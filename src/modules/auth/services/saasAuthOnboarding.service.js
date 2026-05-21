const crypto = require('crypto');
const AppError = require('../../../shared/errors/AppError');
const { createSlug } = require('../../../shared/utils/slug');
const { toFirestoreData, serializeDoc } = require('../../../shared/utils/firestore');
const {
    resolveUserAccessContext,
    assertOrganizationAccess,
    assertBranchAccess
} = require('../../../shared/utils/accessControl');
const {
    ROLES,
    normalizeRole,
    isPlatformRole
} = require('../../../shared/constants/roles');
const {
    USERS,
    ORGANIZATIONS,
    BRANCHES,
    RESTAURANTS,
    TENANT_MIGRATIONS,
    STAFF_INVITATIONS
} = require('../../../shared/constants/collections');
const { AUTH_EVENTS, AUTH_EVENT_STATUS, AUTH_SEVERITY } = require('../../../shared/constants/authEvents');

const INVITATION_STATUS = {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    EXPIRED: 'expired',
    REVOKED: 'revoked',
    PROCESSING: 'processing'
};

const nowIso = () => new Date().toISOString();
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const cleanString = (value) => (typeof value === 'string' ? value.trim() : value);
const publicMode = () => process.env.NODE_ENV !== 'production';
const getFrontendUrl = () => {
    if (process.env.NODE_ENV === 'production') {
        return process.env.FRONTEND_URL_PRODUCTION || process.env.FRONTEND_URL || 'https://resto-custo.netlify.app';
    }
    return process.env.FRONTEND_URL_DEVELOPMENT || process.env.FRONTEND_URL || 'http://localhost:5173';
};
const getEmailFrontendUrl = () => getFrontendUrl();
const getFirebaseDebugInfo = () => ({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN,
    environment: process.env.NODE_ENV || 'development'
});
const getTokenPepper = () =>
    process.env.AUTH_TOKEN_PEPPER
    || process.env.PLATFORM_BOOTSTRAP_SECRET
    || process.env.FIREBASE_PROJECT_ID
    || 'restoqr-dev-token-pepper';

const uniqueSlug = (base, suffix) => {
    const slug = createSlug(base);
    return suffix ? `${slug}-${suffix}` : slug;
};

class SaaSAuthOnboardingService {
    constructor({
        db,
        logger,
        authRepository,
        userRepository,
        firebaseAuthService,
        authLoggerService,
        authService
    }) {
        this.db = db;
        this.logger = logger;
        this.authRepository = authRepository;
        this.userRepository = userRepository;
        this.firebaseAuthService = firebaseAuthService;
        this.authLoggerService = authLoggerService;
        this.authService = authService;
    }

    assertReady() {
        if (!this.db) {
            throw new AppError('Firestore non configure', 500);
        }
    }

    async registerOrganization(payload = {}, context = {}) {
        return this.registerOwnerOrganization({
            mode: 'independent',
            fullName: payload.fullName,
            email: payload.email,
            password: payload.password,
            phone: payload.phone,
            organizationName: payload.organizationName,
            branchName: payload.branchName || payload.organizationName,
            organizationType: 'independent',
            subscriptionPlan: 'starter',
            branchCity: payload.city,
            branchMetadata: {
                cuisineType: payload.cuisineType || null
            },
            context
        });
    }

    async registerFranchise(payload = {}, context = {}) {
        return this.registerOwnerOrganization({
            mode: 'franchise',
            fullName: payload.fullName,
            email: payload.email,
            password: payload.password,
            phone: payload.phone,
            organizationName: payload.organizationName,
            branchName: 'HQ',
            organizationType: 'franchise',
            subscriptionPlan: payload.enterprisePlan || 'enterprise',
            branchCity: '',
            organizationMetadata: {
                expectedBranches: Number(payload.expectedBranches || 1),
                enterprisePlan: payload.enterprisePlan || 'enterprise',
                onboardingMode: 'franchise'
            },
            branchMetadata: {
                branchType: 'hq'
            },
            context
        });
    }

    async registerOwnerOrganization(input = {}) {
        this.assertReady();
        this.authService?.validatePassword(input.password || '');

        const email = normalizeEmail(input.email);
        const fullName = cleanString(input.fullName);
        const organizationName = cleanString(input.organizationName);
        const branchName = cleanString(input.branchName) || organizationName;
        const phoneNumber = input.phone ? this.authService.normalizePhoneNumber(input.phone) : null;

        if (!email || !fullName || !organizationName || !input.password) {
            throw new AppError('Donnees d inscription incompletes', 400);
        }
        this.assertSafeName(fullName, 'fullName');
        this.assertSafeName(organizationName, 'organizationName');
        this.assertSafeName(branchName, 'branchName');

        this.logger?.info('Checking SaaS onboarding email availability', {
            email,
            ...getFirebaseDebugInfo()
        });
        await this.ensureEmailAvailable(email);
        if (phoneNumber) {
            await this.ensurePhoneAvailable(phoneNumber);
        }

        let firebaseUid = null;
        let onboardingRefs = null;
        const timestamp = nowIso();

        try {
            const userRecord = await this.firebaseAuthService.createFirebaseUser({
                email,
                password: input.password,
                displayName: fullName,
                phoneNumber: phoneNumber || undefined,
                emailVerified: false,
                disabled: false
            });
            firebaseUid = userRecord.uid;
            this.logger?.info('Firebase Auth user created for onboarding', {
                email,
                firebaseUid,
                appName: this.firebaseAuthService?.authClient?.app?.name,
                ...getFirebaseDebugInfo()
            });

            const organizationRef = this.db.collection(ORGANIZATIONS).doc();
            const branchRef = this.db.collection(BRANCHES).doc();
            const tenantId = branchRef.id;
            const organizationMembership = {
                organizationId: organizationRef.id,
                role: ROLES.ORGANIZATION_OWNER,
                joinedAt: timestamp,
                isActive: true
            };
            const branchMembership = {
                organizationId: organizationRef.id,
                branchId: branchRef.id,
                role: ROLES.BRANCH_MANAGER,
                joinedAt: timestamp,
                isActive: true
            };

            const organization = {
                id: organizationRef.id,
                slug: uniqueSlug(organizationName, organizationRef.id.slice(0, 6)),
                name: organizationName,
                type: input.organizationType || 'independent',
                subscriptionPlan: input.subscriptionPlan || 'starter',
                isActive: true,
                ownerUserId: firebaseUid,
                contact: {
                    email,
                    phoneNumber
                },
                metadata: {
                    ...(input.organizationMetadata || {}),
                    createdBy: 'saas_auth_onboarding',
                    onboardingMode: input.mode || 'independent'
                },
                createdAt: timestamp,
                updatedAt: timestamp
            };

            const branch = {
                id: branchRef.id,
                organizationId: organizationRef.id,
                slug: uniqueSlug(branchName, branchRef.id.slice(0, 6)),
                name: branchName,
                code: createSlug(branchName).toUpperCase().replace(/-/g, '_') || 'MAIN',
                address: '',
                city: input.branchCity || '',
                country: '',
                phoneNumber: phoneNumber || '',
                email,
                isMainBranch: true,
                isActive: true,
                metadata: {
                    ...(input.branchMetadata || {}),
                    createdBy: 'saas_auth_onboarding'
                },
                createdAt: timestamp,
                updatedAt: timestamp
            };

            const userProfile = {
                id: firebaseUid,
                uid: firebaseUid,
                email,
                name: fullName,
                displayName: fullName,
                role: ROLES.ORGANIZATION_OWNER,
                phoneNumber,
                isActive: true,
                platformRole: null,
                organizationId: organizationRef.id,
                organization_id: organizationRef.id,
                branchId: branchRef.id,
                branch_id: branchRef.id,
                organizationMemberships: [organizationMembership],
                branchMemberships: [branchMembership],
                activeOrganizationId: organizationRef.id,
                activeBranchId: branchRef.id,
                tenant_id: tenantId,
                tenantId,
                restaurant_id: tenantId,
                restaurantId: tenantId,
                createdAt: timestamp,
                updatedAt: timestamp
            };

            onboardingRefs = await this.writeOnboardingBatch({
                userProfile,
                organization,
                branch,
                tenantId,
                timestamp
            });

            await this.syncClaims(firebaseUid, userProfile);

            // Do not generate verification links server-side. The frontend must
            // trigger `sendEmailVerification` using the Firebase Client SDK.
            await this.logAuthEvent(AUTH_EVENTS.SIGNUP_SUCCESS, {
                userId: firebaseUid,
                firebaseUid,
                email,
                role: ROLES.ORGANIZATION_OWNER,
                organizationId: organization.id,
                branchId: branch.id,
                status: AUTH_EVENT_STATUS.SUCCESS,
                ip: input.context?.ip,
                userAgent: input.context?.userAgent,
                requestId: input.context?.requestId,
                metadata: {
                    mode: input.mode,
                    verificationLinkGenerated: false
                }
            });

            return {
                statusCode: 201,
                message: 'Onboarding SaaS cree avec succes',
                data: {
                    profile: this.safeProfile(userProfile),
                    organization,
                    branch,
                    memberships: {
                        organizations: [organizationMembership],
                        branches: [branchMembership]
                    },
                    verificationLinkGenerated: false
                }
            };
        } catch (error) {
            await this.logAuthEvent(AUTH_EVENTS.SIGNUP_FAILED, {
                email,
                status: AUTH_EVENT_STATUS.FAILED,
                severity: AUTH_SEVERITY.WARNING,
                ip: input.context?.ip,
                userAgent: input.context?.userAgent,
                requestId: input.context?.requestId,
                metadata: {
                    mode: input.mode,
                    error: error.message,
                    firebaseUid
                }
            });

            if (onboardingRefs) {
                await this.cleanupOnboardingDocs(onboardingRefs);
            }

            if (firebaseUid) {
                await this.cleanupFirebaseUser(firebaseUid);
            }

            if (error instanceof AppError) {
                throw error;
            }

            this.logger?.error('SaaS onboarding failed', {
                error: error.message,
                email,
                firebaseUid
            });
            throw new AppError('Impossible de finaliser l onboarding SaaS', 500);
        }
    }

    async writeOnboardingBatch({ userProfile, organization, branch, tenantId, timestamp }) {
        const batch = this.db.batch();
        const userRef = this.db.collection(USERS).doc(userProfile.id);
        const organizationRef = this.db.collection(ORGANIZATIONS).doc(organization.id);
        const branchRef = this.db.collection(BRANCHES).doc(branch.id);
        const restaurantRef = this.db.collection(RESTAURANTS).doc(tenantId);
        const migrationRef = this.db.collection(TENANT_MIGRATIONS).doc(tenantId);

        batch.set(userRef, toFirestoreData(userProfile));
        batch.set(organizationRef, toFirestoreData(organization));
        batch.set(branchRef, toFirestoreData(branch));
        batch.set(restaurantRef, toFirestoreData({
            id: tenantId,
            name: branch.name || organization.name,
            owner_user_id: userProfile.id,
            organizationId: organization.id,
            branchId: branch.id,
            tenant_id: tenantId,
            tenantId,
            restaurant_id: tenantId,
            restaurantId: tenantId,
            isActive: true,
            metadata: {
                createdBy: 'saas_auth_onboarding',
                compatibility: 'legacy_restaurant'
            },
            createdAt: timestamp,
            updatedAt: timestamp
        }));
        batch.set(migrationRef, toFirestoreData({
            tenantId,
            tenant_id: tenantId,
            restaurantId: tenantId,
            restaurant_id: tenantId,
            organizationId: organization.id,
            branchId: branch.id,
            status: 'completed',
            source: 'saas_auth_onboarding',
            createdAt: timestamp,
            updatedAt: timestamp
        }), { merge: true });

        await batch.commit();
        this.logger?.info('Firestore onboarding batch committed', {
            userId: userProfile.id,
            organizationId: organization.id,
            branchId: branch.id,
            tenantId
        });

        return { userRef, organizationRef, branchRef, restaurantRef, migrationRef };
    }

    async sendOnboardingEmails({ email, fullName, verificationLink, organization, branch }) {
        this.logger?.info('Skipping onboarding transactional email delivery; using Firebase native email flows instead', {
            email,
            organizationId: organization?.id,
            branchId: branch?.id
        });
        return null;
    }

    async createInvitation(payload = {}, actor = {}, context = {}) {
        this.assertReady();
        const access = resolveUserAccessContext(actor, {
            organizationId: payload.organizationId,
            branchId: payload.branchId
        });

        if (!access.canManageOrganization && !access.canManageBranch) {
            throw new AppError('Permission insuffisante pour inviter un membre', 403);
        }

        const email = normalizeEmail(payload.email);
        const role = normalizeRole(payload.role);
        const organizationId = cleanString(payload.organizationId) || access.activeOrganizationId;
        const branchId = cleanString(payload.branchId) || access.activeBranchId;

        if (!email || !role || !organizationId) {
            throw new AppError('Email, role et organizationId requis', 400);
        }

        if (isPlatformRole(role) || role === ROLES.ORGANIZATION_OWNER) {
            throw new AppError('Ce role ne peut pas etre attribue par invitation staff', 403);
        }
        assertOrganizationAccess(access, organizationId);
        if (branchId) {
            assertBranchAccess(access, organizationId, branchId);
        }
        if ([ROLES.BRANCH_MANAGER, ROLES.CASHIER, ROLES.WAITER, ROLES.KITCHEN].includes(role) && !branchId) {
            throw new AppError('Une invitation avec role branche requiert branchId', 400);
        }

        const organizationDoc = await this.db.collection(ORGANIZATIONS).doc(organizationId).get();
        if (!organizationDoc.exists) {
            throw new AppError('Organisation introuvable', 404);
        }

        let branch = null;
        if (branchId) {
            const branchDoc = await this.db.collection(BRANCHES).doc(branchId).get();
            if (!branchDoc.exists || branchDoc.data().organizationId !== organizationId) {
                throw new AppError('Branche introuvable dans cette organisation', 404);
            }
            branch = { id: branchDoc.id, ...branchDoc.data() };
        }
        await this.assertNoPendingInvitation({ email, organizationId, branchId });

        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = this.hashToken(token);
        const timestamp = nowIso();
        const expiresAt = new Date(Date.now() + Number(payload.expiresInDays || 7) * 24 * 60 * 60 * 1000).toISOString();
        const invitationRef = this.db.collection(STAFF_INVITATIONS).doc();
        const invitation = {
            id: invitationRef.id,
            email,
            role,
            organizationId,
            branchId: branchId || null,
            tokenHash,
            status: INVITATION_STATUS.PENDING,
            invitedBy: actor.uid || actor.id || null,
            acceptedBy: null,
            expiresAt,
            acceptedAt: null,
            revokedAt: null,
            revokedBy: null,
            reservedAt: null,
            metadata: {
                organizationName: organizationDoc.data().name || null,
                branchName: branch?.name || null
            },
            createdAt: timestamp,
            updatedAt: timestamp
        };

        await invitationRef.set(toFirestoreData(invitation));

        await this.logAuthEvent(AUTH_EVENTS.INVITATION_SENT, {
            userId: actor.uid || actor.id || null,
            actorId: actor.uid || actor.id || null,
            email,
            role,
            organizationId,
            branchId: branchId || null,
            ip: context.ip,
            userAgent: context.userAgent,
            requestId: context.requestId,
            status: AUTH_EVENT_STATUS.SUCCESS,
            metadata: {
                invitationId: invitation.id,
                expiresAt
            }
        });

        return {
            statusCode: 201,
            message: 'Invitation staff creee',
            data: {
                invitation: this.safeInvitation(invitation),
                invitationLink: this.buildInvitationUrl(token),
                ...(publicMode() ? { token } : {})
            }
        };
    }

    async revokeInvitation(invitationId, actor = {}, context = {}) {
        this.assertReady();
        const doc = await this.db.collection(STAFF_INVITATIONS).doc(invitationId).get();
        if (!doc.exists) {
            throw new AppError('Invitation introuvable', 404);
        }

        const invitation = serializeDoc(doc);
        const access = resolveUserAccessContext(actor, {
            organizationId: invitation.organizationId,
            branchId: invitation.branchId
        });
        assertOrganizationAccess(access, invitation.organizationId);
        if (invitation.branchId) {
            assertBranchAccess(access, invitation.organizationId, invitation.branchId);
        }
        if (!access.canManageOrganization && !access.canManageBranch) {
            throw new AppError('Permission insuffisante pour revoquer cette invitation', 403);
        }
        if (invitation.status !== INVITATION_STATUS.PENDING && invitation.status !== INVITATION_STATUS.PROCESSING) {
            throw new AppError('Seules les invitations en attente peuvent etre revoquees', 409);
        }

        const timestamp = nowIso();
        await this.db.collection(STAFF_INVITATIONS).doc(invitationId).update({
            status: INVITATION_STATUS.REVOKED,
            revokedAt: timestamp,
            revokedBy: actor.uid || actor.id || null,
            updatedAt: timestamp
        });

        await this.logAuthEvent(AUTH_EVENTS.INVITATION_REVOKED, {
            actorId: actor.uid || actor.id || null,
            email: invitation.email,
            role: invitation.role,
            organizationId: invitation.organizationId,
            branchId: invitation.branchId || null,
            ip: context.ip,
            userAgent: context.userAgent,
            requestId: context.requestId,
            status: AUTH_EVENT_STATUS.SUCCESS,
            metadata: { invitationId }
        });

        return {
            message: 'Invitation revoquee',
            data: {
                invitationId,
                revokedAt: timestamp
            }
        };
    }

    async acceptInvitation(payload = {}, context = {}) {
        this.assertReady();
        this.authService?.validatePassword(payload.password || '');

        const token = cleanString(payload.token);
        const fullName = cleanString(payload.fullName);
        const email = normalizeEmail(payload.email);
        const phoneNumber = payload.phone ? this.authService.normalizePhoneNumber(payload.phone) : null;

        if (!token || !fullName || !email || !payload.password) {
            throw new AppError('Token, nom, email et mot de passe requis', 400);
        }

        let invitation = null;
        let firebaseUid = null;
        const timestamp = nowIso();

        try {
            invitation = await this.reserveInvitationByToken(token, email);
            if (!invitation) {
                throw new AppError('Invitation invalide ou expiree', 400);
            }

            await this.ensureEmailAvailable(email);
            if (phoneNumber) {
                await this.ensurePhoneAvailable(phoneNumber);
            }

            const userRecord = await this.firebaseAuthService.createFirebaseUser({
                email,
                password: payload.password,
                displayName: fullName,
                phoneNumber: phoneNumber || undefined,
                emailVerified: false,
                disabled: false
            });
            firebaseUid = userRecord.uid;

            const organizationMembership = {
                organizationId: invitation.organizationId,
                role: this.organizationMembershipRole(invitation.role),
                joinedAt: timestamp,
                isActive: true
            };
            const branchMembership = invitation.branchId ? {
                organizationId: invitation.organizationId,
                branchId: invitation.branchId,
                role: invitation.role,
                joinedAt: timestamp,
                isActive: true
            } : null;
            const tenantId = invitation.branchId || invitation.organizationId;
            const userProfile = {
                id: firebaseUid,
                uid: firebaseUid,
                email,
                name: fullName,
                displayName: fullName,
                role: invitation.role,
                phoneNumber,
                isActive: true,
                platformRole: null,
                organizationId: invitation.organizationId,
                organization_id: invitation.organizationId,
                branchId: invitation.branchId || null,
                branch_id: invitation.branchId || null,
                organizationMemberships: [organizationMembership],
                branchMemberships: branchMembership ? [branchMembership] : [],
                activeOrganizationId: invitation.organizationId,
                activeBranchId: invitation.branchId || null,
                tenant_id: tenantId,
                tenantId,
                restaurant_id: tenantId,
                restaurantId: tenantId,
                createdAt: timestamp,
                updatedAt: timestamp
            };

            const batch = this.db.batch();
            batch.set(this.db.collection(USERS).doc(firebaseUid), toFirestoreData(userProfile));
            batch.update(this.db.collection(STAFF_INVITATIONS).doc(invitation.id), {
                status: INVITATION_STATUS.ACCEPTED,
                acceptedBy: firebaseUid,
                acceptedAt: timestamp,
                updatedAt: timestamp
            });
            await batch.commit();

            await this.syncClaims(firebaseUid, userProfile);

            // Do not create server-side verification links. The client should
            // call `sendEmailVerification` after sign-up/acceptance.
            await this.logAuthEvent(AUTH_EVENTS.INVITATION_ACCEPTED, {
                userId: firebaseUid,
                firebaseUid,
                email,
                role: invitation.role,
                organizationId: invitation.organizationId,
                branchId: invitation.branchId || null,
                ip: context.ip,
                userAgent: context.userAgent,
                requestId: context.requestId,
                status: AUTH_EVENT_STATUS.SUCCESS,
                metadata: {
                    invitationId: invitation.id,
                    verificationLinkGenerated: false
                }
            });

            return {
                statusCode: 201,
                message: 'Invitation acceptee',
                data: {
                    profile: this.safeProfile(userProfile),
                    memberships: {
                        organizations: [organizationMembership],
                        branches: branchMembership ? [branchMembership] : []
                    },
                    verificationLinkGenerated: false
                }
            };
        } catch (error) {
            await this.releaseReservedInvitation(invitation?.id);

            await this.logAuthEvent(AUTH_EVENTS.INVITATION_ACCEPT_FAILED, {
                email,
                status: AUTH_EVENT_STATUS.FAILED,
                severity: AUTH_SEVERITY.WARNING,
                ip: context.ip,
                userAgent: context.userAgent,
                requestId: context.requestId,
                metadata: {
                    invitationId: invitation?.id || null,
                    error: error.message,
                    firebaseUid
                }
            });

            if (firebaseUid) {
                await this.cleanupUserProfileDoc(firebaseUid);
                await this.cleanupFirebaseUser(firebaseUid);
            }

            if (error instanceof AppError) {
                throw error;
            }

            throw new AppError('Impossible d accepter l invitation', 500);
        }
    }

    async getMe(user = {}) {
        this.assertReady();
        const profile = await this.userRepository.findById(user.uid || user.id);
        if (!profile) {
            throw new AppError('Utilisateur non trouve', 404);
        }

        const access = resolveUserAccessContext(profile);
        const activeOrganization = access.activeOrganizationId
            ? await this.findDoc(ORGANIZATIONS, access.activeOrganizationId)
            : null;
        const activeBranch = access.activeBranchId
            ? await this.findDoc(BRANCHES, access.activeBranchId)
            : null;

        return {
            success: true,
            data: {
                profile: this.safeProfile(profile),
                permissions: access.permissions,
                access,
                activeOrganization,
                activeBranch,
                memberships: {
                    organizations: access.organizations,
                    branches: access.branches
                },
                roles: {
                    platformRole: access.platformRole,
                    activeOrganizationRole: access.activeOrganizationRole || null,
                    activeBranchRole: access.activeBranchRole || null,
                    legacyRole: normalizeRole(profile.role) || ROLES.CUSTOMER
                },
                featureFlags: {
                    advancedRbac: process.env.ENABLE_ADVANCED_RBAC !== 'false',
                    impersonation: process.env.ENABLE_IMPERSONATION !== 'false',
                    multiBranchUsers: process.env.ENABLE_MULTI_BRANCH_USERS !== 'false'
                }
            }
        };
    }

    async bootstrapPlatformOwner(payload = {}, context = {}) {
        this.assertReady();
        this.authService?.validatePassword(payload.password || '');

        if (!process.env.PLATFORM_BOOTSTRAP_SECRET) {
            throw new AppError('PLATFORM_BOOTSTRAP_SECRET doit etre configure avant bootstrap', 500);
        }

        if (payload.bootstrapSecret !== process.env.PLATFORM_BOOTSTRAP_SECRET) {
            throw new AppError('Bootstrap secret invalide', 403);
        }

        const email = normalizeEmail(payload.email);
        const fullName = cleanString(payload.fullName);
        if (!email || !fullName || !payload.password) {
            throw new AppError('Nom, email et mot de passe requis', 400);
        }

        const existingOwner = await this.findExistingPlatformOwner();
        if (existingOwner) {
            throw new AppError('Le platform_owner initial existe deja', 409, {
                code: 'PLATFORM_OWNER_ALREADY_BOOTSTRAPPED'
            });
        }

        await this.ensureEmailAvailable(email);
        let firebaseUid = null;
        const timestamp = nowIso();

        try {
            const userRecord = await this.firebaseAuthService.createFirebaseUser({
                email,
                password: payload.password,
                displayName: fullName,
                emailVerified: false,
                disabled: false
            });
            firebaseUid = userRecord.uid;

            const userProfile = {
                id: firebaseUid,
                uid: firebaseUid,
                email,
                name: fullName,
                displayName: fullName,
                role: ROLES.PLATFORM_OWNER,
                platformRole: ROLES.PLATFORM_OWNER,
                isActive: true,
                organizationMemberships: [],
                branchMemberships: [],
                activeOrganizationId: null,
                activeBranchId: null,
                tenant_id: null,
                tenantId: null,
                restaurant_id: null,
                restaurantId: null,
                createdAt: timestamp,
                updatedAt: timestamp
            };

            await this.db.collection(USERS).doc(firebaseUid).set(toFirestoreData(userProfile));
            await this.syncClaims(firebaseUid, userProfile);

            // Do not create server-side verification links. The client should
            // call `sendEmailVerification` after sign-up.
            await this.logAuthEvent(AUTH_EVENTS.BOOTSTRAP_PLATFORM_OWNER, {
                userId: firebaseUid,
                firebaseUid,
                email,
                role: ROLES.PLATFORM_OWNER,
                status: AUTH_EVENT_STATUS.SUCCESS,
                severity: AUTH_SEVERITY.CRITICAL,
                ip: context.ip,
                userAgent: context.userAgent,
                requestId: context.requestId,
                metadata: { verificationLinkGenerated: false }
            });

            return {
                statusCode: 201,
                message: 'Platform owner cree',
                data: {
                    profile: this.safeProfile(userProfile),
                    verificationLinkGenerated: false
                }
            };
        } catch (error) {
            await this.logAuthEvent(AUTH_EVENTS.BOOTSTRAP_PLATFORM_OWNER_FAILED, {
                email,
                status: AUTH_EVENT_STATUS.FAILED,
                severity: AUTH_SEVERITY.CRITICAL,
                ip: context.ip,
                userAgent: context.userAgent,
                requestId: context.requestId,
                metadata: {
                    error: error.message,
                    firebaseUid
                }
            });

            if (firebaseUid) {
                await this.cleanupUserProfileDoc(firebaseUid);
                await this.cleanupFirebaseUser(firebaseUid);
            }

            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Impossible de bootstrap le platform owner', 500);
        }
    }

    async syncClaims(uid, profile = {}) {
        const access = resolveUserAccessContext(profile);
        const claims = {
            role: normalizeRole(profile.role) || ROLES.CUSTOMER,
            platformRole: access.platformRole || null,
            organizationIds: access.organizations.map((membership) => membership.organizationId),
            branchIds: access.branches.map((membership) => membership.branchId),
            activeOrganizationId: access.activeOrganizationId || null,
            activeBranchId: access.activeBranchId || null,
            tenantId: profile.tenantId || profile.tenant_id || null,
            restaurantId: profile.restaurantId || profile.restaurant_id || profile.tenantId || profile.tenant_id || null,
            permissionsVersion: 1
        };
        await this.firebaseAuthService.setRoleClaims(uid, claims);
        return claims;
    }

    async ensureEmailAvailable(email) {
        this.logger?.info('Ensuring email is available in Firestore and Firebase Auth', {
            email,
            ...getFirebaseDebugInfo()
        });
        if (await this.userRepository.findByEmail(email)) {
            throw new AppError('Cet email est deja utilise', 409);
        }
        try {
            await this.authRepository.getUserByEmail(email);
            throw new AppError('Cet email est deja utilise', 409);
        } catch (error) {
            if (error instanceof AppError) throw error;
            if (error.code !== 'auth/user-not-found') {
                this.logger?.error('Unexpected error checking Firebase Auth user by email', {
                    email,
                    code: error.code,
                    message: error.message
                });
                throw new AppError(`Erreur lors de la verification email: ${error.message}`, 500);
            }
        }
    }

    async ensurePhoneAvailable(phoneNumber) {
        if (await this.userRepository.findByPhoneNumber(phoneNumber)) {
            throw new AppError('Ce numero de telephone est deja utilise', 409);
        }
        try {
            await this.authRepository.getUserByPhoneNumber(phoneNumber);
            throw new AppError('Ce numero de telephone est deja utilise', 409);
        } catch (error) {
            if (error instanceof AppError) throw error;
            if (error.code !== 'auth/user-not-found') {
                throw new AppError(`Erreur lors de la verification telephone: ${error.message}`, 500);
            }
        }
    }

    async cleanupUserProfileDoc(uid) {
        if (!uid) return;
        try {
            await this.db.collection(USERS).doc(uid).delete();
            this.logger?.info('Deleted user profile document during rollback', { uid });
        } catch (cleanupError) {
            this.logger?.error('Failed to delete user profile document during rollback', {
                uid,
                error: cleanupError.message
            });
        }
    }

    async cleanupFirebaseUser(uid) {
        try {
            await this.firebaseAuthService.deleteUser(uid);
            this.logger?.info('Cleaned up Firebase Auth user after onboarding failure', { uid });
        } catch (cleanupError) {
            this.logger?.error('Firebase cleanup failed after onboarding error', {
                uid,
                error: cleanupError.message
            });
        }
    }

    async cleanupOnboardingDocs(refs) {
        if (!refs) return;
        const refsToDelete = [
            refs.userRef,
            refs.organizationRef,
            refs.branchRef,
            refs.restaurantRef,
            refs.migrationRef
        ];

        for (const ref of refsToDelete) {
            try {
                await ref.delete();
                this.logger?.info('Deleted onboarding Firestore doc during rollback', {
                    path: ref.path
                });
            } catch (cleanupError) {
                this.logger?.error('Failed to delete onboarding Firestore doc during rollback', {
                    path: ref.path,
                    error: cleanupError.message
                });
            }
        }
    }


    async logAuthEvent(eventType, payload = {}) {
        if (!this.authLoggerService) return null;
        return this.authLoggerService.logEvent({
            eventType,
            ...payload
        });
    }

    hashToken(token) {
        return crypto.createHmac('sha256', getTokenPepper()).update(String(token || '')).digest('hex');
    }

    async findPendingInvitationByToken(token) {
        const tokenHash = this.hashToken(token);
        const snapshot = await this.db.collection(STAFF_INVITATIONS)
            .where('tokenHash', '==', tokenHash)
            .where('status', '==', INVITATION_STATUS.PENDING)
            .limit(1)
            .get();

        if (snapshot.empty) return null;
        const invitation = serializeDoc(snapshot.docs[0]);
        if (new Date(invitation.expiresAt).getTime() < Date.now()) {
            await this.db.collection(STAFF_INVITATIONS).doc(invitation.id).update({
                status: INVITATION_STATUS.EXPIRED,
                updatedAt: nowIso()
            });
            return null;
        }
        return invitation;
    }

    async reserveInvitationByToken(token, email) {
        const tokenHash = this.hashToken(token);
        const reserve = async (invitation) => {
            if (!invitation) return null;
            if (invitation.email !== email) {
                throw new AppError('Invitation invalide ou expiree', 400);
            }
            if (new Date(invitation.expiresAt).getTime() < Date.now()) {
                await this.db.collection(STAFF_INVITATIONS).doc(invitation.id).update({
                    status: INVITATION_STATUS.EXPIRED,
                    updatedAt: nowIso()
                });
                return null;
            }
            const timestamp = nowIso();
            await this.db.collection(STAFF_INVITATIONS).doc(invitation.id).update({
                status: INVITATION_STATUS.PROCESSING,
                reservedAt: timestamp,
                updatedAt: timestamp
            });
            return { ...invitation, status: INVITATION_STATUS.PROCESSING, reservedAt: timestamp };
        };

        if (typeof this.db.runTransaction === 'function') {
            return this.db.runTransaction(async (transaction) => {
                const query = this.db.collection(STAFF_INVITATIONS)
                    .where('tokenHash', '==', tokenHash)
                    .where('status', '==', INVITATION_STATUS.PENDING)
                    .limit(1);
                const snapshot = await transaction.get(query);
                if (snapshot.empty) return null;
                const doc = snapshot.docs[0];
                const invitation = serializeDoc(doc);
                if (invitation.email !== email) {
                    throw new AppError('Invitation invalide ou expiree', 400);
                }
                if (new Date(invitation.expiresAt).getTime() < Date.now()) {
                    transaction.update(doc.ref, {
                        status: INVITATION_STATUS.EXPIRED,
                        updatedAt: nowIso()
                    });
                    return null;
                }
                const timestamp = nowIso();
                transaction.update(doc.ref, {
                    status: INVITATION_STATUS.PROCESSING,
                    reservedAt: timestamp,
                    updatedAt: timestamp
                });
                return { ...invitation, status: INVITATION_STATUS.PROCESSING, reservedAt: timestamp };
            });
        }

        const invitation = await this.findPendingInvitationByToken(token);
        return reserve(invitation);
    }

    async releaseReservedInvitation(invitationId) {
        if (!invitationId) return null;
        const doc = await this.db.collection(STAFF_INVITATIONS).doc(invitationId).get();
        if (!doc.exists) return null;
        const invitation = doc.data();
        if (invitation.status !== INVITATION_STATUS.PROCESSING) return null;
        return this.db.collection(STAFF_INVITATIONS).doc(invitationId).update({
            status: INVITATION_STATUS.PENDING,
            reservedAt: null,
            updatedAt: nowIso()
        });
    }

    async assertNoPendingInvitation({ email, organizationId, branchId }) {
        const snapshot = await this.db.collection(STAFF_INVITATIONS)
            .where('email', '==', email)
            .where('organizationId', '==', organizationId)
            .where('status', '==', INVITATION_STATUS.PENDING)
            .limit(5)
            .get();
        const duplicate = snapshot.docs
            .map(serializeDoc)
            .find((invitation) => (invitation.branchId || null) === (branchId || null));
        if (duplicate) {
            throw new AppError('Une invitation active existe deja pour cet email', 409, {
                invitationId: duplicate.id
            });
        }
    }

    buildInvitationUrl(token) {
        const baseUrl = process.env.FRONTEND_URL_PRODUCTION || process.env.FRONTEND_URL || 'http://localhost:3000';
        return `${baseUrl}/auth/invitation/accept?token=${encodeURIComponent(token)}`;
    }

    assertSafeName(value, field) {
        const normalized = cleanString(value);
        if (!normalized || normalized.length < 2 || normalized.length > 120) {
            throw new AppError(`${field} doit contenir entre 2 et 120 caracteres`, 400);
        }
        if (/[<>`{}$]/.test(normalized)) {
            throw new AppError(`${field} contient des caracteres interdits`, 400);
        }
    }

    organizationMembershipRole(role) {
        return role === ROLES.ORGANIZATION_MANAGER ? ROLES.ORGANIZATION_MANAGER : role;
    }

    async findExistingPlatformOwner() {
        const byRole = await this.db.collection(USERS)
            .where('role', '==', ROLES.PLATFORM_OWNER)
            .limit(1)
            .get();
        if (!byRole.empty) return serializeDoc(byRole.docs[0]);

        const byPlatformRole = await this.db.collection(USERS)
            .where('platformRole', '==', ROLES.PLATFORM_OWNER)
            .limit(1)
            .get();
        return byPlatformRole.empty ? null : serializeDoc(byPlatformRole.docs[0]);
    }

    async findDoc(collection, id) {
        const doc = await this.db.collection(collection).doc(id).get();
        return doc.exists ? serializeDoc(doc) : null;
    }

    safeProfile(profile = {}) {
        const {
            password,
            passwordHash,
            ...safe
        } = profile;
        return safe;
    }

    safeInvitation(invitation = {}) {
        const {
            tokenHash,
            ...safe
        } = invitation;
        return safe;
    }
}

module.exports = SaaSAuthOnboardingService;
