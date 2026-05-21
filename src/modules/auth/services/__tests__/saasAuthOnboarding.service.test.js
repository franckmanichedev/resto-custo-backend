const SaaSAuthOnboardingService = require('../saasAuthOnboarding.service');
const { USERS, ORGANIZATIONS, BRANCHES, STAFF_INVITATIONS } = require('../../../../shared/constants/collections');

const docSnapshot = (id, data) => ({
    id,
    exists: Boolean(data),
    data: () => data
});

const createFakeDb = ({ failCommit = false } = {}) => {
    const stores = new Map();
    const getStore = (collection) => {
        if (!stores.has(collection)) stores.set(collection, new Map());
        return stores.get(collection);
    };
    let docCount = 0;

    const makeQuery = (collection, filters = []) => ({
        where(field, operator, value) {
            return makeQuery(collection, [...filters, { field, operator, value }]);
        },
        limit() {
            return makeQuery(collection, filters);
        },
        async get() {
            const docs = [...getStore(collection).entries()]
                .filter(([, data]) => filters.every((filter) => filter.operator === '==' && data[filter.field] === filter.value))
                .map(([id, data]) => docSnapshot(id, data));
            return { empty: docs.length === 0, docs };
        },
        doc(id = `${collection}_${++docCount}`) {
            return {
                id,
                async get() {
                    return docSnapshot(id, getStore(collection).get(id));
                },
                async set(payload) {
                    getStore(collection).set(id, payload);
                },
                async update(payload) {
                    getStore(collection).set(id, { ...(getStore(collection).get(id) || {}), ...payload });
                }
            };
        },
        async add(payload) {
            const id = `${collection}_${++docCount}`;
            getStore(collection).set(id, payload);
            return { id };
        }
    });

    return {
        stores,
        collection: (name) => makeQuery(name),
        batch() {
            const writes = [];
            return {
                set(ref, payload) {
                    writes.push({ type: 'set', ref, payload });
                },
                update(ref, payload) {
                    writes.push({ type: 'update', ref, payload });
                },
                async commit() {
                    if (failCommit) throw new Error('commit failed');
                    for (const write of writes) {
                        if (write.type === 'set') await write.ref.set(write.payload);
                        if (write.type === 'update') await write.ref.update(write.payload);
                    }
                }
            };
        }
    };
};

const createService = ({ db = createFakeDb(), firebaseAuthService = {} } = {}) => {
    const userRepository = {
        findByEmail: jest.fn().mockResolvedValue(null),
        findByPhoneNumber: jest.fn().mockResolvedValue(null),
        findById: jest.fn(async (id) => db.stores.get(USERS)?.get(id) || null)
    };
    const authRepository = {
        getUserByEmail: jest.fn().mockRejectedValue({ code: 'auth/user-not-found' }),
        getUserByPhoneNumber: jest.fn().mockRejectedValue({ code: 'auth/user-not-found' })
    };
    const service = new SaaSAuthOnboardingService({
        db,
        logger: { error: jest.fn() },
        authRepository,
        userRepository,
        firebaseAuthService: {
            createFirebaseUser: jest.fn().mockResolvedValue({ uid: 'uid_1' }),
            deleteUser: jest.fn().mockResolvedValue(undefined),
            setRoleClaims: jest.fn().mockResolvedValue(undefined),
            generateEmailVerificationLink: jest.fn().mockResolvedValue('https://verify.test/link'),
            ...firebaseAuthService
        },
        authLoggerService: {
            logEvent: jest.fn().mockResolvedValue(undefined)
        },
        authService: {
            validatePassword: jest.fn(),
            normalizePhoneNumber: jest.fn((phone) => phone)
        }
    });

    return { service, db, userRepository, authRepository };
};

describe('SaaSAuthOnboardingService', () => {
    beforeEach(() => {
        process.env.ENABLE_ADVANCED_RBAC = 'true';
        process.env.ENABLE_MULTI_BRANCH_USERS = 'true';
    });

    test('cree organization, branche, profil, claims et legacy mapping', async () => {
        const { service, db } = createService();

        const result = await service.registerOrganization({
            fullName: 'Ada Owner',
            email: 'ada@example.com',
            password: 'secret123',
            organizationName: 'Ada Foods',
            branchName: 'Ada Central'
        });

        expect(result.statusCode).toBe(201);
        expect(db.stores.get(USERS).get('uid_1')).toEqual(expect.objectContaining({
            role: 'organization_owner',
            activeOrganizationId: result.data.organization.id,
            activeBranchId: result.data.branch.id,
            tenantId: result.data.branch.id
        }));
        expect(db.stores.get(ORGANIZATIONS).get(result.data.organization.id)).toBeTruthy();
        expect(db.stores.get(BRANCHES).get(result.data.branch.id)).toBeTruthy();
        expect(service.firebaseAuthService.setRoleClaims).toHaveBeenCalledWith('uid_1', expect.objectContaining({
            role: 'organization_owner',
            activeOrganizationId: result.data.organization.id,
            activeBranchId: result.data.branch.id
        }));
    });

    test('supprime le Firebase user si Firestore echoue pendant onboarding', async () => {
        const db = createFakeDb({ failCommit: true });
        const { service } = createService({ db });

        await expect(service.registerOrganization({
            fullName: 'Ada Owner',
            email: 'ada@example.com',
            password: 'secret123',
            organizationName: 'Ada Foods',
            branchName: 'Ada Central'
        })).rejects.toMatchObject({ statusCode: 500 });

        expect(service.firebaseAuthService.deleteUser).toHaveBeenCalledWith('uid_1');
    });

    test('accepte une invitation staff et synchronise les claims', async () => {
        const { service, db } = createService({
            firebaseAuthService: {
                createFirebaseUser: jest.fn().mockResolvedValue({ uid: 'staff_1' })
            }
        });
        const token = 'staff-token';
        await db.collection(STAFF_INVITATIONS).doc('invite_1').set({
            id: 'invite_1',
            email: 'staff@example.com',
            role: 'cashier',
            organizationId: 'org_1',
            branchId: 'branch_1',
            tokenHash: service.hashToken(token),
            status: 'pending',
            expiresAt: new Date(Date.now() + 86400000).toISOString()
        });

        const result = await service.acceptInvitation({
            token,
            fullName: 'Staff Member',
            email: 'staff@example.com',
            password: 'secret123'
        });

        expect(result.statusCode).toBe(201);
        expect(db.stores.get(USERS).get('staff_1')).toEqual(expect.objectContaining({
            role: 'cashier',
            activeOrganizationId: 'org_1',
            activeBranchId: 'branch_1'
        }));
        expect(db.stores.get(STAFF_INVITATIONS).get('invite_1')).toEqual(expect.objectContaining({
            status: 'accepted',
            acceptedBy: 'staff_1'
        }));
    });
});
