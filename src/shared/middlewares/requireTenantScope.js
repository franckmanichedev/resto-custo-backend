const AppError = require('../errors/AppError');
const { resolveTenantId } = require('../utils/tenant');

const getUserTenantId = (user = {}) =>
    user.tenant_id
    || user.tenantId
    || user.restaurant_id
    || user.restaurantId
    || null;

const requireTenantScope = ({ allowMissingTenant = false } = {}) => {
    return (req, res, next) => {
        try {
            const userTenantId = getUserTenantId(req.user);
            const requestTenantId = resolveTenantId(req);

            if (userTenantId && requestTenantId && userTenantId !== requestTenantId) {
                throw new AppError('Acces refuse: tenant hors de portee', 403, {
                    tenantId: requestTenantId,
                    userTenantId
                });
            }

            const effectiveTenantId = userTenantId || requestTenantId || null;

            if (!effectiveTenantId && !allowMissingTenant) {
                throw new AppError('Tenant introuvable', 400);
            }

            req.tenantId = effectiveTenantId;
            req.user = {
                ...(req.user || {}),
                tenant_id: req.user?.tenant_id || effectiveTenantId,
                tenantId: req.user?.tenantId || effectiveTenantId,
                restaurant_id: req.user?.restaurant_id || effectiveTenantId,
                restaurantId: req.user?.restaurantId || effectiveTenantId
            };

            next();
        } catch (error) {
            next(error);
        }
    };
};

module.exports = requireTenantScope;
