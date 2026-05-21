const { SaasScopeService } = require('../saasScopeService');
const MemoryCacheService = require('../cacheService');
const requireBranchAccess = require('../../shared/middlewares/requireBranchAccess');

const createDoc = (id, data) => ({
    id,
    exists: Boolean(data),
    data: () => data
});

const createFakeDb = (collections, counters = {}) => ({
    collection(name) {
        return {
            doc(id) {
                return {
                    async get() {
                        counters[`${name}:${id}`] = (counters[`${name}:${id}`] || 0) + 1;
                        return createDoc(id, collections[name]?.[id] || null);
                    }
                };
            },
            where(field, operator, value) {
                return {
                    limit() {
                        return {
                            async get() {
                                const docs = Object.entries(collections[name] || {})
                                    .filter(([, doc]) => doc[field] === value)
                                    .map(([id, doc]) => createDoc(id, doc));

                                return {
                                    empty: docs.length === 0,
                                    docs
                                };
                            }
                        };
                    }
                };
            }
        };
    }
});

const silentLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

describe('SaasScopeService', () => {
    test('resout tenant legacy vers organization/branch et hydrate le scope', async () => {
        const db = createFakeDb({
            tenant_migrations: {
                'tenant-safire-faef2b44': {
                    oldTenantId: 'tenant-safire-faef2b44',
                    oldRestaurantId: 'tenant-safire-faef2b44',
                    organizationId: 'org_safire',
                    branchId: 'branch_safire_main'
                }
            },
            organizations: {
                org_safire: { id: 'org_safire', name: 'Safire' }
            },
            branches: {
                branch_safire_main: { id: 'branch_safire_main', organizationId: 'org_safire', name: 'Safire Main' }
            }
        });

        const service = new SaasScopeService({ db, logger: silentLogger, cache: new MemoryCacheService() });
        const scope = await service.resolveFromRequest({
            headers: { 'x-tenant-id': 'tenant-safire-faef2b44' }
        });

        expect(scope.organizationId).toBe('org_safire');
        expect(scope.branchId).toBe('branch_safire_main');
        expect(scope.source).toBe('legacy_tenant');
        expect(scope.organization.name).toBe('Safire');
    });

    test('utilise le cache pour limiter les lectures Firestore', async () => {
        const counters = {};
        const db = createFakeDb({
            tenant_migrations: {
                'tenant-safire-faef2b44': {
                    oldTenantId: 'tenant-safire-faef2b44',
                    organizationId: 'org_safire',
                    branchId: 'branch_safire_main'
                }
            },
            organizations: {
                org_safire: { id: 'org_safire', name: 'Safire' }
            },
            branches: {
                branch_safire_main: { id: 'branch_safire_main', organizationId: 'org_safire' }
            }
        }, counters);

        const service = new SaasScopeService({ db, logger: silentLogger, cache: new MemoryCacheService() });

        await service.resolveFromRequest({ headers: { 'x-tenant-id': 'tenant-safire-faef2b44' } });
        await service.resolveFromRequest({ headers: { 'x-tenant-id': 'tenant-safire-faef2b44' } });

        expect(counters['tenant_migrations:tenant-safire-faef2b44']).toBe(1);
        expect(counters['organizations:org_safire']).toBe(1);
        expect(counters['branches:branch_safire_main']).toBe(1);
    });

    test('bloque une branche rattachee a une autre organisation', async () => {
        const db = createFakeDb({
            organizations: {
                org_safire: { id: 'org_safire' }
            },
            branches: {
                branch_safire_main: { id: 'branch_safire_main', organizationId: 'org_other' }
            },
            tenant_migrations: {}
        });

        const service = new SaasScopeService({ db, logger: silentLogger, cache: new MemoryCacheService() });

        await expect(service.resolveFromRequest({
            headers: {
                'x-organization-id': 'org_safire',
                'x-branch-id': 'branch_safire_main'
            }
        })).rejects.toMatchObject({ statusCode: 403 });
    });
});

describe('requireBranchAccess', () => {
    test('autorise un branch_manager sur sa branche', () => {
        const middleware = requireBranchAccess();
        const req = {
            user: {
                role: 'branch_manager',
                organizationIds: ['org_safire'],
                branchIds: ['branch_safire_main']
            },
            saas: {
                organizationId: 'org_safire',
                branchId: 'branch_safire_main'
            }
        };
        const next = jest.fn();

        middleware(req, {}, next);

        expect(next).toHaveBeenCalledWith();
    });

    test('refuse un utilisateur branche hors scope', () => {
        const middleware = requireBranchAccess();
        const req = {
            user: {
                role: 'waiter',
                organizationIds: ['org_safire'],
                branchIds: ['branch_other']
            },
            saas: {
                organizationId: 'org_safire',
                branchId: 'branch_safire_main'
            }
        };
        const next = jest.fn();

        middleware(req, {}, next);

        expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
    });
});
