const ImpersonationService = require('../impersonationService');

const createDoc = (store, id) => ({
    id,
    async get() {
        const data = store.get(id);
        return {
            id,
            exists: Boolean(data),
            data: () => data
        };
    },
    async set(payload) {
        store.set(id, payload);
    },
    async update(payload) {
        store.set(id, { ...(store.get(id) || {}), ...payload });
    }
});

const createFakeDb = () => {
    const store = new Map();
    let count = 0;
    return {
        store,
        collection: () => ({
            doc(id = `imp_${++count}`) {
                return createDoc(store, id);
            }
        })
    };
};

describe('Phase 6 ImpersonationService', () => {
    beforeEach(() => {
        process.env.ENABLE_ADVANCED_RBAC = 'true';
        process.env.ENABLE_IMPERSONATION = 'true';
    });

    test('platform_support demarre une impersonation read-only et loggee', async () => {
        const db = createFakeDb();
        const service = new ImpersonationService({ db, logger: { info: jest.fn() } });

        const log = await service.start({ id: 'support_1', role: 'platform_support' }, {
            targetOrganizationId: 'org_a',
            targetBranchId: 'branch_1',
            reason: 'support ticket'
        });

        expect(log.actorId).toBe('support_1');
        expect(log.targetOrganizationId).toBe('org_a');
        expect(log.context.readOnly).toBe(true);
        expect(db.store.get(log.id)).toEqual(expect.objectContaining({
            actorId: 'support_1',
            isActive: true,
            endedAt: null
        }));
    });

    test('refuse impersonation sans permission', async () => {
        const db = createFakeDb();
        const service = new ImpersonationService({ db, logger: { info: jest.fn() } });

        await expect(service.start({ id: 'waiter_1', role: 'waiter' }, {
            targetOrganizationId: 'org_a'
        })).rejects.toMatchObject({ statusCode: 403 });
    });

    test('termine une impersonation et renseigne endedAt', async () => {
        const db = createFakeDb();
        const service = new ImpersonationService({ db, logger: { info: jest.fn() } });
        const started = await service.start({ id: 'admin_1', role: 'platform_admin' }, {
            targetOrganizationId: 'org_a'
        });

        const ended = await service.end({ id: 'admin_1', role: 'platform_admin' }, started.id);

        expect(ended.isActive).toBe(false);
        expect(ended.endedAt).toBeTruthy();
        expect(db.store.get(started.id).isActive).toBe(false);
    });
});
