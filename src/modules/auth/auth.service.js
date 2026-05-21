const { parsePhoneNumberFromString } = require('libphonenumber-js');
const AppError = require('../../shared/errors/AppError');
const UserEntity = require('../../core/entities/User');
const logger = require('../../shared/utils/logger');
const sanitize = require('../../shared/utils/sanitizer');
const { createSlug } = require('../../shared/utils/slug');
const { ROLES, normalizeRole, isPlatformRole } = require('../../shared/constants/roles');
const { db } = require('../../infrastructure/firebase/firebaseAdmin');
const { ORGANIZATIONS, BRANCHES, RESTAURANTS } = require('../../shared/constants/collections');
const { AUTH_EVENTS, AUTH_EVENT_STATUS, AUTH_SEVERITY } = require('../../shared/constants/authEvents');

const normalizeTenantId = (payload = {}) => {
    const tenantId = payload.tenant_id ?? payload.tenantId ?? payload.restaurant_id ?? payload.restaurantId;
    return typeof tenantId === 'string' ? tenantId.trim() : tenantId ?? null;
};

const publicMode = () => process.env.NODE_ENV !== 'production';
const maskEmail = (email) => {
    const [local, domain] = String(email || '').split('@');
    if (!local || !domain) return null;
    return `${local.slice(0, 2)}***@${domain}`;
};

class AuthService {
    constructor({ authRepository, userRepository, firebaseApiKey, authLoggerService, firebaseAuthService }) {
        this.authRepository = authRepository;
        this.userRepository = userRepository;
        this.firebaseApiKey = firebaseApiKey;
        this.authLoggerService = authLoggerService;
        this.firebaseAuthService = firebaseAuthService;
    }

    async createUserFromToken(firebaseUser) {
        if (!firebaseUser?.uid) {
            throw new AppError('Utilisateur Firebase introuvable', 400);
        }

        const existingUser = await this.userRepository.findById(firebaseUser.uid);
        if (existingUser) {
            return { statusCode: 200, message: 'Utilisateur existant', data: UserEntity.create(existingUser) };
        }

        const timestamp = new Date().toISOString();
        const normalizedRole = normalizeRole(firebaseUser.role);
        const tenantId = normalizeTenantId(firebaseUser);

        const user = UserEntity.create({
            id: firebaseUser.uid,
            name: firebaseUser.name || firebaseUser.displayName || '',
            email: firebaseUser.email || null,
            role: normalizedRole && !isPlatformRole(normalizedRole) ? normalizedRole : ROLES.CUSTOMER,
            organizationMemberships: firebaseUser.organizationMemberships || [],
            branchMemberships: firebaseUser.branchMemberships || [],
            activeOrganizationId: firebaseUser.activeOrganizationId || null,
            activeBranchId: firebaseUser.activeBranchId || null,
            tenant_id: tenantId,
            tenantId: tenantId,
            restaurant_id: tenantId,
            restaurantId: tenantId,
            createdAt: timestamp,
            updatedAt: timestamp
        });

        await this.userRepository.create(user.id, user);
        // Create restaurants entry for tenantId if not exists
        if (tenantId) {
            try {
                const restRef = db.collection(RESTAURANTS).doc(tenantId);
                const restDoc = await restRef.get();
                if (!restDoc.exists) {
                    const restaurantPayload = {
                        id: tenantId,
                        name: payload.restaurantName || payload.businessName || payload.name || `Restaurant ${tenantId}`,
                        owner_user_id: user.id,
                        tenant_id: tenantId,
                        tenantId: tenantId,
                        restaurant_id: tenantId,
                        restaurantId: tenantId,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        metadata: { createdBy: 'signup' }
                    };

                    await restRef.set(restaurantPayload);
                    logger.info('Restaurant document created during signup', { restaurantId: tenantId });
                }
            } catch (err) {
                logger.warn('Impossible de creer le document restaurant pendant signup', { error: err.message, tenantId });
            }
        }

        // Ensure a restaurants entry exists for this tenant/restaurant id
        if (tenantId) {
            try {
                const restRef = db.collection(RESTAURANTS).doc(tenantId);
                const restDoc = await restRef.get();
                if (!restDoc.exists) {
                    const restaurantName = firebaseUser.restaurantName || firebaseUser.businessName || firebaseUser.name || `Restaurant ${tenantId}`;
                    const restaurantPayload = {
                        id: tenantId,
                        name: restaurantName,
                        owner_user_id: user.id,
                        tenant_id: tenantId,
                        tenantId: tenantId,
                        restaurant_id: tenantId,
                        restaurantId: tenantId,
                        createdAt: timestamp,
                        updatedAt: timestamp,
                        metadata: { createdBy: 'signup' }
                    };

                    await restRef.set(restaurantPayload);
                    logger.info('Restaurant document created from firebase token', { restaurantId: tenantId });
                }
            } catch (err) {
                logger.warn('Impossible de creer le document restaurant', { error: err.message, tenantId });
            }
        }

        return { statusCode: 201, message: 'Utilisateur cree', data: user };
    }

    async signup(payload, context = {}) {
        logger.info('Nouvelle inscription recue', { body: sanitize(payload) });

        if (payload.password !== payload.passwordConfirm) {
            throw new AppError('Les mots de passe ne correspondent pas', 400);
        }

        if (!this.firebaseApiKey) {
            throw new AppError('Erreur de configuration serveur', 500);
        }

        this.validatePassword(payload.password);

        const email = String(payload.email).trim().toLowerCase();
        if (await this.userRepository.findByEmail(email)) {
            throw new AppError('Cet email est deja utilise (Firestore)', 400);
        }

        await this.ensureFirebaseEmailAvailable(email);

        let normalizedPhoneNumber = null;
        if (payload.phoneNumber) {
            normalizedPhoneNumber = this.normalizePhoneNumber(payload.phoneNumber);

            if (await this.userRepository.findByPhoneNumber(normalizedPhoneNumber)) {
                throw new AppError('Ce numero de telephone est deja utilise', 400);
            }

            await this.ensureFirebasePhoneAvailable(normalizedPhoneNumber);
        }

        const normalizedRole = normalizeRole(payload.role);
        if (payload.role !== undefined && !normalizedRole) {
            throw new AppError('Role invalide', 400);
        }

        if (normalizedRole && isPlatformRole(normalizedRole)) {
            throw new AppError('Les roles plateforme ne peuvent pas etre attribues via l\'inscription', 403);
        }

        const tenantId = normalizeTenantId(payload);

        const userRecord = await this.authRepository.createUser({
            email,
            password: payload.password,
            displayName: payload.name,
            phoneNumber: normalizedPhoneNumber || undefined
        });

        const timestamp = new Date().toISOString();
        const user = UserEntity.create({
            id: userRecord.uid,
            email,
            name: payload.name,
            role: normalizedRole || ROLES.CUSTOMER,
            phoneNumber: normalizedPhoneNumber,
            organizationMemberships: payload.organizationMemberships || [],
            branchMemberships: payload.branchMemberships || [],
            activeOrganizationId: payload.activeOrganizationId || null,
            activeBranchId: payload.activeBranchId || null,
            tenant_id: tenantId,
            tenantId,
            restaurant_id: tenantId,
            restaurantId: tenantId,
            createdAt: timestamp,
            updatedAt: timestamp
        });

        await this.userRepository.create(user.id, user);
        const firebaseSession = await this.verifyPassword(email, payload.password);

        await this.logAuthEvent({
            eventType: AUTH_EVENTS.SIGNUP_SUCCESS,
            userId: user.id,
            firebaseUid: user.id,
            email,
            role: user.role,
            status: AUTH_EVENT_STATUS.SUCCESS,
            ip: context.ip,
            userAgent: context.userAgent,
            requestId: context.requestId,
            metadata: { name: payload.name, legacySignup: true }
        });

        // Do not generate or send verification emails from the backend.
        // The frontend (Firebase Client SDK) is responsible for calling
        // `sendEmailVerification` on the created user.
        return {
            statusCode: 201,
            message: 'Utilisateur cree',
            data: user,
            idToken: firebaseSession.idToken,
            refreshToken: firebaseSession.refreshToken,
            expiresIn: firebaseSession.expiresIn
        };
    }

    async checkEmailExists(email) {
        const cleanEmail = String(email).trim().toLowerCase();
        if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
            throw new AppError('Format d\'email invalide', 400);
        }

        const user = await this.userRepository.findByEmail(cleanEmail);
        if (!user) {
            throw new AppError('Aucun compte trouve avec cet email', 404, { exists: false, email: cleanEmail });
        }

        let authUser;
        try {
            authUser = await this.authRepository.getUserByEmail(cleanEmail);
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                throw new AppError('Utilisateur non trouve dans Firebase Auth', 404, { exists: false });
            }

            throw error;
        }

        const providers = authUser.providerData.map((provider) => provider.providerId);
        return {
            success: true,
            message: 'Email trouve',
            exists: true,
            auth: {
                hasPassword: providers.includes('password'),
                hasGoogle: providers.includes('google.com'),
                providers
            },
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName || '',
                lastName: user.lastName || '',
                role: normalizeRole(user.role) || ROLES.CUSTOMER,
                displayName: user.displayName || '',
                tenant_id: normalizeTenantId(user),
                restaurant_id: normalizeTenantId(user)
            }
        };
    }

    async login(payload, context = {}) {
        const email = String(payload.email).trim().toLowerCase();
        if (!this.firebaseApiKey) {
            throw new AppError('Erreur de configuration serveur', 500);
        }

        let firebaseResponse;
        try {
            firebaseResponse = await this.verifyPassword(email, payload.password);
        } catch (error) {
            await this.logAuthEvent({
                eventType: AUTH_EVENTS.LOGIN_FAILED,
                email,
                status: AUTH_EVENT_STATUS.FAILED,
                severity: AUTH_SEVERITY.WARNING,
                ip: context.ip,
                userAgent: context.userAgent,
                requestId: context.requestId,
                suspiciousActivity: true,
                metadata: { reason: 'invalid_credentials' }
            });
            throw new AppError('Email ou mot de passe incorrect', 401);
        }

        const user = await this.userRepository.findByEmail(email);

        if (!user) {
            await this.logAuthEvent({
                eventType: AUTH_EVENTS.LOGIN_FAILED,
                email,
                status: AUTH_EVENT_STATUS.FAILED,
                severity: AUTH_SEVERITY.WARNING,
                ip: context.ip,
                userAgent: context.userAgent,
                requestId: context.requestId,
                suspiciousActivity: true,
                metadata: { reason: 'missing_profile' }
            });
            throw new AppError('Profil utilisateur non trouve', 404);
        }

        if (firebaseResponse.localId !== user.id) {
            throw new AppError('Erreur systeme: donnees incoherentes', 500);
        }

        if (user.isActive === false) {
            throw new AppError('Ce compte a ete desactive. Contactez l\'administrateur.', 403);
        }

        const tenantId = normalizeTenantId(user);

        // Log successful login
        await this.logAuthEvent({
            eventType: AUTH_EVENTS.LOGIN_SUCCESS,
            userId: user.id,
            firebaseUid: user.id,
            email,
            role: user.role,
            status: AUTH_EVENT_STATUS.SUCCESS,
            ip: context.ip,
            userAgent: context.userAgent,
            requestId: context.requestId
        });

        return {
            success: true,
            message: 'Connexion reussie',
            idToken: firebaseResponse.idToken,
            refreshToken: firebaseResponse.refreshToken,
            expiresIn: firebaseResponse.expiresIn,
            data: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: normalizeRole(user.role) || ROLES.CUSTOMER,
                phoneNumber: user.phoneNumber || null,
                organizationMemberships: user.organizationMemberships || [],
                branchMemberships: user.branchMemberships || [],
                activeOrganizationId: user.activeOrganizationId || null,
                activeBranchId: user.activeBranchId || null,
                tenant_id: tenantId,
                tenantId,
                restaurant_id: tenantId,
                restaurantId: tenantId,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }
        };
    }

    logout() {
        return { success: true, message: 'Deconnexion reussie' };
    }

    validatePassword(password) {
        if (!password || password.length < 8) {
            throw new AppError('Le mot de passe doit contenir au moins 8 caracteres', 400);
        }

        if (/[<>"'`]/.test(password)) {
            throw new AppError('Le mot de passe contient des caracteres interdits', 400);
        }

        if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
            throw new AppError('Le mot de passe doit contenir au moins une lettre et un chiffre', 400);
        }
    }

    normalizePhoneNumber(phoneNumber) {
        const parsed =
            parsePhoneNumberFromString(phoneNumber) ||
            parsePhoneNumberFromString(phoneNumber, 'CM');

        if (!parsed || !parsed.isValid()) {
            throw new AppError(
                'Le numero de telephone fourni n\'est pas valide. Veuillez entrer un numero de telephone valide.',
                400
            );
        }

        return parsed.number;
    }

    async ensureFirebaseEmailAvailable(email) {
        try {
            await this.authRepository.getUserByEmail(email);
            throw new AppError('Cet email est deja utilise (Firebase Auth)', 400);
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            if (error.code !== 'auth/user-not-found') {
                throw new AppError(`Erreur interne lors de la verification de l'email: ${error.message}`, 500);
            }
        }
    }

    async ensureFirebasePhoneAvailable(phoneNumber) {
        try {
            await this.authRepository.getUserByPhoneNumber(phoneNumber);
            throw new AppError('Ce numero de telephone est deja utilise', 400);
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            if (error.code !== 'auth/user-not-found') {
                throw new AppError(
                    `Erreur interne lors de la verification du numero de telephone: ${error.message}`,
                    500
                );
            }
        }
    }

    async verifyPassword(email, password) {
        const response = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${this.firebaseApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, returnSecureToken: true })
            }
        );

        const firebaseResponse = await response.json();
        if (!response.ok) {
            const errorCode = firebaseResponse.error?.message;

            if (errorCode === 'INVALID_PASSWORD' || errorCode === 'INVALID_LOGIN_CREDENTIALS') {
                throw new AppError('Email ou mot de passe incorrect', 401);
            }

            if (errorCode === 'EMAIL_NOT_FOUND' || errorCode === 'USER_DISABLED') {
                throw new AppError('Aucun compte trouve avec cet email ou compte desactive', 404);
            }

            throw new AppError('Email ou mot de passe incorrect', 401);
        }

        return firebaseResponse;
    }

    async verifyPasswordResetCodeWithRest(oobCode) {
        if (!this.firebaseApiKey) {
            throw new AppError('Erreur de configuration serveur', 500);
        }

        const response = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=${this.firebaseApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oobCode })
            }
        );
        const payload = await response.json();
        if (!response.ok || !payload.email) {
            throw new AppError('Code de reinitialisation invalide ou expire', 400);
        }
        return payload;
    }

    async resetPasswordWithRest(oobCode, newPassword) {
        if (!this.firebaseApiKey) {
            throw new AppError('Erreur de configuration serveur', 500);
        }

        const response = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=${this.firebaseApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oobCode, newPassword })
            }
        );
        const payload = await response.json();
        if (!response.ok || !payload.email) {
            throw new AppError('Code de reinitialisation invalide ou expire', 400);
        }
        return payload;
    }

    async verifyEmailWithRest(oobCode) {
        if (!this.firebaseApiKey) {
            throw new AppError('Erreur de configuration serveur', 500);
        }

        const response = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${this.firebaseApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oobCode })
            }
        );
        const payload = await response.json();
        if (!response.ok || !payload.email) {
            throw new AppError('Code d action invalide ou expire', 400);
        }
        return payload;
    }

    async resendVerificationEmail(payload, context = {}) {
        const email = payload.email ? String(payload.email).trim().toLowerCase() : null;
        const uid = payload.uid ? String(payload.uid).trim() : null;

        if (!email && !uid) {
            throw new AppError('Email ou uid requis', 400);
        }

        let user;
        if (uid) {
            user = await this.userRepository.findById(uid);
            if (!user) {
                return {
                    success: true,
                    message: 'Si ce compte existe, un email de verification a ete envoye'
                };
            }
        } else if (email) {
            user = await this.userRepository.findByEmail(email);
            if (!user) {
                return {
                    success: true,
                    message: 'Si ce compte existe, un email de verification a ete envoye'
                };
            }
        }

        try {
            if (user.emailVerified) {
                return {
                    success: true,
                    message: 'Email deja verifie'
                };
            }

            // Do not generate verification links server-side. The client must
            // call `sendEmailVerification(auth.currentUser)` using the
            // Firebase Client SDK. Log the event and return a generic success
            // response so callers can proceed.
            await this.logAuthEvent({
                eventType: AUTH_EVENTS.EMAIL_VERIFICATION_SENT,
                userId: user.id,
                firebaseUid: user.id,
                email: user.email,
                status: AUTH_EVENT_STATUS.SUCCESS,
                ip: context.ip,
                userAgent: context.userAgent,
                requestId: context.requestId,
                metadata: { action: 'resend', verificationLinkGenerated: false }
            });

            return {
                success: true,
                message: 'Si ce compte existe, une action de verification doit etre effectuee par le client'
            };
        } catch (error) {
            this.logger?.error("Erreur lors de l'envoi de l'email de verification", { error: error.message, email: maskEmail(email) });

            await this.logAuthEvent({
                eventType: AUTH_EVENTS.EMAIL_VERIFICATION_FAILED,
                userId: user?.id,
                email,
                status: AUTH_EVENT_STATUS.FAILED,
                severity: AUTH_SEVERITY.WARNING,
                ip: context.ip,
                userAgent: context.userAgent,
                requestId: context.requestId,
                metadata: { error: error.message }
            });

            return {
                success: true,
                message: 'Tentative d envoi effectuee',
                emailDeliveryFailed: true
            };
        }
    }

    async requestPasswordReset(payload, context = {}) {
        const email = String(payload.email).trim().toLowerCase();

        if (!email) {
            throw new AppError('Email requis', 400);
        }

        const user = await this.userRepository.findByEmail(email);
        if (!user) {
            await this.logAuthEvent({
                eventType: AUTH_EVENTS.PASSWORD_RESET_REQUESTED,
                email,
                status: AUTH_EVENT_STATUS.SUCCESS,
                ip: context.ip,
                userAgent: context.userAgent,
                requestId: context.requestId,
                metadata: { userFound: false }
            });
            return {
                success: true,
                message: 'Si cet email existe, un lien de reinitialisation a ete envoye'
            };
        }

        try {
            // Use Firebase Client SDK to trigger password reset emails
            // (`sendPasswordResetEmail(auth, email)`). Do not generate reset
            // links on the server. Log the request and return a generic
            // success response to avoid revealing account existence.
            await this.logAuthEvent({
                eventType: AUTH_EVENTS.PASSWORD_RESET_REQUESTED,
                userId: user.id,
                firebaseUid: user.id,
                email,
                status: AUTH_EVENT_STATUS.SUCCESS,
                ip: context.ip,
                userAgent: context.userAgent,
                requestId: context.requestId,
                metadata: { userFound: true }
            });

            return {
                success: true,
                message: 'Si cet email existe, une demande de reinitialisation doit etre effectuee par le client'
            };
        } catch (error) {
            logger.error('Erreur lors de la demande de reinitialisation du mot de passe', { error: error.message, email });

            await this.logAuthEvent({
                eventType: AUTH_EVENTS.PASSWORD_RESET_FAILED,
                userId: user?.id,
                email,
                status: AUTH_EVENT_STATUS.FAILED,
                severity: AUTH_SEVERITY.WARNING,
                ip: context.ip,
                userAgent: context.userAgent,
                requestId: context.requestId,
                metadata: { error: error.message }
            });

            throw new AppError('Impossible de traiter la demande de reinitialisation', 500);
        }
    }

    async confirmPasswordReset(payload, context = {}) {
        const { oobCode, password } = payload;

        if (!oobCode) {
            throw new AppError('Code de reinitialisation requis', 400);
        }

        if (!password) {
            throw new AppError('Nouveau mot de passe requis', 400);
        }

        this.validatePassword(password);

        try {
            // Verify the reset code first
            const accountInfo = await this.verifyPasswordResetCodeWithRest(oobCode);
            const email = accountInfo.email;

            if (!email) {
                throw new AppError('Code de reinitialisation invalide ou expire', 400);
            }

            // Reset the password. Firebase consumes the oobCode, preventing replay.
            await this.resetPasswordWithRest(oobCode, password);

            const user = await this.userRepository.findByEmail(email);
            if (user?.id && this.firebaseAuthService?.revokeRefreshTokens) {
                await this.firebaseAuthService.revokeRefreshTokens(user.id);
            }

            await this.logAuthEvent({
                eventType: AUTH_EVENTS.PASSWORD_RESET_COMPLETED,
                userId: user?.id,
                firebaseUid: user?.id,
                email,
                status: AUTH_EVENT_STATUS.SUCCESS,
                ip: context.ip,
                userAgent: context.userAgent,
                requestId: context.requestId,
                metadata: { refreshTokensRevoked: Boolean(user?.id) }
            });

            return {
                success: true,
                message: 'Mot de passe reinitialise avec succes'
            };
        } catch (error) {
            logger.error('Erreur lors de la reinitialisation du mot de passe', { error: error.message });

            await this.logAuthEvent({
                eventType: AUTH_EVENTS.PASSWORD_RESET_FAILED,
                email: null,
                status: AUTH_EVENT_STATUS.FAILED,
                severity: AUTH_SEVERITY.WARNING,
                ip: context.ip,
                userAgent: context.userAgent,
                requestId: context.requestId,
                metadata: { error: error.message }
            });

            if (error instanceof AppError) {
                throw error;
            }

            throw new AppError('Impossible de reinitialiser le mot de passe', 500);
        }
    }

    async validateResetCode(oobCode) {
        if (!oobCode) {
            throw new AppError('Code de reinitialisation requis', 400);
        }

        try {
            const accountInfo = await this.verifyPasswordResetCodeWithRest(oobCode);

            return {
                success: true,
                message: 'Code valide',
                valid: true,
                emailMasked: maskEmail(accountInfo.email),
                ...(publicMode() ? { email: accountInfo.email } : {})
            };
        } catch (error) {
            logger.warn('Code de reinitialisation invalide ou expire', { error: error.message });

            return {
                success: false,
                message: 'Code de reinitialisation invalide ou expire',
                valid: false,
                error: 'INVALID_RESET_CODE'
            };
        }
    }

    async applyAction(code) {
        if (!code) {
            throw new AppError('Code d\'action requis', 400);
        }

        try {
            const actionInfo = await this.verifyEmailWithRest(code);
            const user = await this.userRepository.findByEmail(actionInfo.email);
            if (user?.id) {
                await this.userRepository.update(user.id, {
                    emailVerified: true,
                    updatedAt: new Date().toISOString()
                });
            }

            await this.logAuthEvent({
                eventType: AUTH_EVENTS.EMAIL_VERIFIED,
                userId: user?.id,
                firebaseUid: user?.id,
                email: actionInfo.email,
                status: AUTH_EVENT_STATUS.SUCCESS
            });

            return {
                success: true,
                message: 'Email verifie avec succes',
                operation: 'VERIFY_EMAIL',
                email: actionInfo.email
            };
        } catch (error) {
            logger.error('Erreur lors de l\'application du code d\'action', { error: error.message });

            if (error instanceof AppError) {
                throw error;
            }

            throw new AppError('Code d\'action invalide ou expire', 400);
        }
    }

    async logAuthEvent(payload = {}) {
        if (!this.authLoggerService) return null;
        return this.authLoggerService.logEvent(payload);
    }
}

module.exports = AuthService;
