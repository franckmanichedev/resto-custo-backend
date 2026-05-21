const AppError = require('../errors/AppError');
const {
    ROLES,
    PERMISSIONS,
    normalizeRole,
    isPlatformRole
} = require('../constants/roles');
const {
    isAdvancedRbacEnabled,
    isMultiBranchUsersEnabled
} = require('./featureFlags');

const PLATFORM_ROLE_PRIORITY = [
    ROLES.PLATFORM_OWNER,
    ROLES.PLATFORM_ADMIN,
    ROLES.PLATFORM_SUPPORT
];

const toArray = (value) => {
    if (!value) return [];
    return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
};

const nowIso = () => new Date().toISOString();

const normalizeMembership = (membership = {}, type = 'organization') => {
    const role = normalizeRole(membership.role);
    const organizationId = membership.organizationId || membership.organization_id || null;
    const branchId = membership.branchId || membership.branch_id || null;

    if (!organizationId || !role) {
        return null;
    }

    if (type === 'branch' && !branchId) {
        return null;
    }

    return {
        organizationId,
        ...(type === 'branch' ? { branchId } : {}),
        role,
        joinedAt: membership.joinedAt || membership.joined_at || null,
        isActive: membership.isActive !== false
    };
};

const legacyOrganizationMemberships = (user = {}) => {
    const role = normalizeRole(user.role);
    if (!role || isPlatformRole(role) || role === ROLES.CUSTOMER) {
        return [];
    }

    const ids = [
        ...toArray(user.organizationId || user.organization_id),
        ...toArray(user.organizationIds || user.organization_ids)
    ];

    return [...new Set(ids)].map((organizationId) => ({
        organizationId,
        role,
        joinedAt: user.createdAt || null,
        isActive: true
    }));
};

const legacyBranchMemberships = (user = {}) => {
    const role = normalizeRole(user.role);
    if (!role || isPlatformRole(role) || role === ROLES.CUSTOMER) {
        return [];
    }

    const organizationIds = [
        ...toArray(user.organizationId || user.organization_id),
        ...toArray(user.organizationIds || user.organization_ids)
    ];
    const branchIds = [
        ...toArray(user.branchId || user.branch_id),
        ...toArray(user.branchIds || user.branch_ids)
    ];

    const organizationId = organizationIds[0] || null;
    return branchIds.map((branchId) => ({
        organizationId,
        branchId,
        role,
        joinedAt: user.createdAt || null,
        isActive: true
    })).filter((membership) => membership.organizationId && membership.branchId);
};

const getOrganizationMemberships = (user = {}) => {
    const nativeMemberships = toArray(user.organizationMemberships)
        .map((membership) => normalizeMembership(membership, 'organization'))
        .filter(Boolean);

    return [...nativeMemberships, ...legacyOrganizationMemberships(user)]
        .filter((membership) => membership.isActive !== false);
};

const getBranchMemberships = (user = {}) => {
    const nativeMemberships = toArray(user.branchMemberships)
        .map((membership) => normalizeMembership(membership, 'branch'))
        .filter(Boolean);

    return [...nativeMemberships, ...legacyBranchMemberships(user)]
        .filter((membership) => membership.isActive !== false);
};

const resolvePlatformRole = (user = {}) => {
    const roles = [
        normalizeRole(user.platformRole),
        normalizeRole(user.role),
        ...toArray(user.platformRoles).map(normalizeRole)
    ].filter(Boolean);

    return PLATFORM_ROLE_PRIORITY.find((role) => roles.includes(role)) || null;
};

const getPermissionsForRoles = (roles = []) => {
    const permissions = new Set();
    roles.map(normalizeRole).filter(Boolean).forEach((role) => {
        (PERMISSIONS[role] || []).forEach((permission) => permissions.add(permission));
    });
    return [...permissions].sort();
};

const resolveActiveOrganizationId = (user, organizations, branches, requestedOrganizationId = null) => {
    if (requestedOrganizationId) return requestedOrganizationId;
    if (user.activeOrganizationId || user.active_organization_id) {
        return user.activeOrganizationId || user.active_organization_id;
    }
    if (branches[0]?.organizationId) return branches[0].organizationId;
    if (organizations[0]?.organizationId) return organizations[0].organizationId;
    return user.organizationId || user.organization_id || null;
};

const resolveActiveBranchId = (user, branches, requestedBranchId = null) => {
    if (requestedBranchId) return requestedBranchId;
    if (user.activeBranchId || user.active_branch_id) {
        return user.activeBranchId || user.active_branch_id;
    }
    if (branches[0]?.branchId) return branches[0].branchId;
    return user.branchId || user.branch_id || null;
};

const buildPermissionBooleans = (permissions) => {
    const has = (permission) => permissions.includes(permission);
    return {
        canManageMenu: has('plats:create') || has('plats:update') || has('categories:update'),
        canManageOrders: has('orders:read') || has('orders:update_status'),
        canManageBranch: has('tables:update') || has('restaurant:update'),
        canManageOrganization: has('users:manage_roles') || has('restaurant:update'),
        canAccessAnalytics: has('orders:analytics') || has('restaurant:view_analytics') || has('platform:analytics:read'),
        canManageBilling: has('platform:billing:update') || has('platform:billing:read'),
        canImpersonate: has('platform:support:impersonate')
    };
};

const resolveUserAccessContext = (user = {}, options = {}) => {
    if (!isAdvancedRbacEnabled()) {
        const role = normalizeRole(user.role) || ROLES.CUSTOMER;
        const permissions = getPermissionsForRoles([role]);
        return {
            platformRole: isPlatformRole(role) ? role : null,
            organizations: [],
            branches: [],
            activeOrganizationId: user.organizationId || user.organization_id || null,
            activeBranchId: user.branchId || user.branch_id || null,
            permissions,
            ...buildPermissionBooleans(permissions),
            legacyMode: true
        };
    }

    const organizations = getOrganizationMemberships(user);
    const branches = isMultiBranchUsersEnabled() ? getBranchMemberships(user) : getBranchMemberships(user).slice(0, 1);
    const platformRole = resolvePlatformRole(user);
    const activeOrganizationId = resolveActiveOrganizationId(user, organizations, branches, options.organizationId);
    const activeBranchId = resolveActiveBranchId(user, branches, options.branchId);
    const activeOrganizationRole = organizations.find((membership) => membership.organizationId === activeOrganizationId)?.role || null;
    const activeBranchRole = branches.find((membership) =>
        membership.organizationId === activeOrganizationId && membership.branchId === activeBranchId
    )?.role || null;
    const legacyRole = normalizeRole(user.role);
    const permissions = getPermissionsForRoles([
        platformRole,
        activeOrganizationRole,
        activeBranchRole,
        legacyRole
    ]);

    return {
        platformRole,
        organizations,
        branches,
        activeOrganizationId,
        activeBranchId,
        activeOrganizationRole,
        activeBranchRole,
        permissions,
        ...buildPermissionBooleans(permissions),
        legacyMode: false
    };
};

const canAccessOrganization = (access = {}, organizationId) => {
    if (!organizationId) return true;
    if (access.platformRole) return true;
    return access.organizations?.some((membership) => membership.organizationId === organizationId)
        || access.branches?.some((membership) => membership.organizationId === organizationId);
};

const canAccessBranch = (access = {}, organizationId, branchId) => {
    if (!branchId) return canAccessOrganization(access, organizationId);
    if (access.platformRole) return true;
    return access.branches?.some((membership) =>
        membership.organizationId === organizationId && membership.branchId === branchId
    );
};

const assertOrganizationAccess = (access, organizationId) => {
    if (!canAccessOrganization(access, organizationId)) {
        throw new AppError('Acces refuse: organization hors de portee', 403, { organizationId });
    }
};

const assertBranchAccess = (access, organizationId, branchId) => {
    if (!canAccessBranch(access, organizationId, branchId)) {
        throw new AppError('Acces refuse: branche hors de portee', 403, { organizationId, branchId });
    }
};

const assertCanSwitchBranch = (user, organizationId, branchId) => {
    const access = resolveUserAccessContext(user, { organizationId, branchId });
    assertBranchAccess(access, organizationId, branchId);
    return access;
};

module.exports = {
    nowIso,
    getOrganizationMemberships,
    getBranchMemberships,
    getPermissionsForRoles,
    buildPermissionBooleans,
    resolveUserAccessContext,
    canAccessOrganization,
    canAccessBranch,
    assertOrganizationAccess,
    assertBranchAccess,
    assertCanSwitchBranch
};
