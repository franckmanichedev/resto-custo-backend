const UserRepository = require('../../modules/user/user.repository');
const { resolveUserAccessContext } = require('../utils/accessControl');

let defaultUserRepository = null;

const getDefaultUserRepository = () => {
    if (!defaultUserRepository) {
        defaultUserRepository = new UserRepository();
    }

    return defaultUserRepository;
};

module.exports = function resolveUserAccessContextMiddleware(options = {}) {
    const {
        userRepository = null,
        allowMissing = false
    } = options;

    return async (req, res, next) => {
        try {
            const userId = req.user?.uid || req.user?.id;
            if (!userId) {
                if (allowMissing) {
                    req.access = resolveUserAccessContext(req.user || {});
                    return next();
                }
                return res.status(401).json({ success: false, message: 'Utilisateur non authentifie' });
            }

            const repository = userRepository || getDefaultUserRepository();
            const persistedUser = await repository.findById(userId);
            const user = { ...(persistedUser || {}), ...(req.user || {}) };
            const access = resolveUserAccessContext(user, {
                organizationId: req.saas?.organizationId || req.headers?.['x-organization-id'] || null,
                branchId: req.saas?.branchId || req.headers?.['x-branch-id'] || null
            });

            req.user = {
                ...req.user,
                organizationMemberships: persistedUser?.organizationMemberships || req.user.organizationMemberships || [],
                branchMemberships: persistedUser?.branchMemberships || req.user.branchMemberships || [],
                activeOrganizationId: access.activeOrganizationId,
                activeBranchId: access.activeBranchId
            };
            req.access = access;

            return next();
        } catch (error) {
            return next(error);
        }
    };
};

module.exports.getDefaultUserRepository = getDefaultUserRepository;
