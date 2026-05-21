const AppError = require('../errors/AppError');
const { ROLES } = require('../constants/roles');

const PLATFORM_ROLES = new Set([
    ROLES.PLATFORM_OWNER,
    ROLES.PLATFORM_ADMIN,
    ROLES.PLATFORM_SUPPORT
]);

const ORGANIZATION_ROLES = new Set([
    ROLES.ORGANIZATION_OWNER,
    ROLES.ADMIN
]);

const BRANCH_ROLES = new Set([
    ROLES.BRANCH_MANAGER,
    ROLES.MENU_MANAGER,
    ROLES.WAITER,
    ROLES.KITCHEN,
    ROLES.KITCHEN_STAFF
]);

const toArray = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    return [value].filter(Boolean);
};

const getUserOrganizationIds = (user = {}) => [
    ...toArray(user.organizationId),
    ...toArray(user.organization_id),
    ...toArray(user.organizationIds),
    ...toArray(user.organization_ids),
    ...toArray(user.metadata?.organizationIds)
];

const getUserBranchIds = (user = {}) => [
    ...toArray(user.branchId),
    ...toArray(user.branch_id),
    ...toArray(user.branchIds),
    ...toArray(user.branch_ids),
    ...toArray(user.metadata?.branchIds)
];

module.exports = function requireBranchAccess(options = {}) {
    const {
        allowPlatform = true,
        allowOrganizationOwner = true
    } = options;

    return (req, res, next) => {
        try {
            const user = req.user || {};
            const role = user.role || null;
            const saas = req.saas || {};

            if (!saas.organizationId || !saas.branchId) {
                throw new AppError('Scope branche requis', 400);
            }

            if (allowPlatform && PLATFORM_ROLES.has(role)) {
                return next();
            }

            const userOrganizationIds = getUserOrganizationIds(user);
            const userBranchIds = getUserBranchIds(user);
            const sameOrganization = userOrganizationIds.includes(saas.organizationId);
            const sameBranch = userBranchIds.includes(saas.branchId);

            if (allowOrganizationOwner && ORGANIZATION_ROLES.has(role) && sameOrganization) {
                return next();
            }

            if (BRANCH_ROLES.has(role) && sameOrganization && sameBranch) {
                return next();
            }

            throw new AppError('Acces refuse: branche hors de portee', 403, {
                organizationId: saas.organizationId,
                branchId: saas.branchId,
                userOrganizationIds,
                userBranchIds,
                role
            });
        } catch (error) {
            next(error);
        }
    };
};

module.exports.getUserOrganizationIds = getUserOrganizationIds;
module.exports.getUserBranchIds = getUserBranchIds;
