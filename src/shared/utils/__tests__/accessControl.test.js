const AppError = require('../../errors/AppError');
const {
    resolveUserAccessContext,
    assertCanSwitchBranch,
    assertBranchAccess
} = require('../accessControl');

describe('Phase 6 accessControl', () => {
    beforeEach(() => {
        process.env.ENABLE_ADVANCED_RBAC = 'true';
        process.env.ENABLE_MULTI_BRANCH_USERS = 'true';
    });

    test('resout un utilisateur multi-organization avec branche active', () => {
        const access = resolveUserAccessContext({
            role: 'customer',
            organizationMemberships: [
                { organizationId: 'org_a', role: 'organization_manager', isActive: true }
            ],
            branchMemberships: [
                { organizationId: 'org_a', branchId: 'branch_1', role: 'cashier', isActive: true },
                { organizationId: 'org_a', branchId: 'branch_2', role: 'waiter', isActive: true }
            ],
            activeOrganizationId: 'org_a',
            activeBranchId: 'branch_2'
        });

        expect(access.activeOrganizationId).toBe('org_a');
        expect(access.activeBranchId).toBe('branch_2');
        expect(access.activeOrganizationRole).toBe('organization_manager');
        expect(access.activeBranchRole).toBe('waiter');
        expect(access.canManageMenu).toBe(true);
        expect(access.canManageOrders).toBe(true);
    });

    test('herite les permissions platform pour impersonation', () => {
        const access = resolveUserAccessContext({
            role: 'platform_support'
        });

        expect(access.platformRole).toBe('platform_support');
        expect(access.permissions).toContain('platform:support:impersonate');
        expect(access.canImpersonate).toBe(true);
    });

    test('autorise le switch vers une branche membre', () => {
        const access = assertCanSwitchBranch({
            branchMemberships: [
                { organizationId: 'org_a', branchId: 'branch_1', role: 'branch_manager', isActive: true }
            ]
        }, 'org_a', 'branch_1');

        expect(access.activeBranchId).toBe('branch_1');
    });

    test('bloque le switch vers une branche hors scope', () => {
        expect(() => assertCanSwitchBranch({
            branchMemberships: [
                { organizationId: 'org_a', branchId: 'branch_1', role: 'branch_manager', isActive: true }
            ]
        }, 'org_a', 'branch_2')).toThrow(AppError);
    });

    test('reste compatible legacy avec role admin et branchIds', () => {
        const access = resolveUserAccessContext({
            role: 'admin',
            organizationId: 'org_legacy',
            branchIds: ['branch_legacy']
        });

        expect(access.branches).toEqual(expect.arrayContaining([
            expect.objectContaining({ organizationId: 'org_legacy', branchId: 'branch_legacy', role: 'admin' })
        ]));
        expect(access.permissions).toContain('restaurant:update');
        expect(() => assertBranchAccess(access, 'org_legacy', 'branch_legacy')).not.toThrow();
    });

    test('feature flag advanced rbac preserve legacy role permissions', () => {
        process.env.ENABLE_ADVANCED_RBAC = 'false';
        const access = resolveUserAccessContext({ role: 'kitchen_staff' });

        expect(access.legacyMode).toBe(true);
        expect(access.permissions).toContain('orders:update_status');
    });
});
