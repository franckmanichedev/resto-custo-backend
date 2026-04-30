const AppError = require('../errors/AppError');
const { resolveTenantId, resolveRestaurantId } = require('../utils/tenant');

const getUserTenantId = (user = {}) =>
    user.tenant_id
    || user.tenantId
    || null;

const getUserRestaurantId = (user = {}) =>
    user.restaurant_id
    || user.restaurantId
    || null;

const requireTenantScope = ({ allowMissingTenant = false } = {}) => {
    return (req, res, next) => {
        try {
            const userTenantId = getUserTenantId(req.user);
            const userRestaurantId = getUserRestaurantId(req.user);

            const requestTenantId = resolveTenantId(req);
            const requestRestaurantId = resolveRestaurantId(req);

            // Validation: tenant
            if (userTenantId && requestTenantId && userTenantId !== requestTenantId) {
                throw new AppError('Acces refuse: tenant hors de portee', 403, {
                    tenantId: requestTenantId,
                    userTenantId
                });
            }

            // Validation: restaurant
            if (userRestaurantId && requestRestaurantId && userRestaurantId !== requestRestaurantId) {
                throw new AppError('Acces refuse: restaurant hors de portee', 403, {
                    restaurantId: requestRestaurantId,
                    userRestaurantId
                });
            }

            const effectiveTenantId = userTenantId || requestTenantId || null;
            const effectiveRestaurantId = userRestaurantId || requestRestaurantId || null;

            if ((!effectiveTenantId || !effectiveRestaurantId) && !allowMissingTenant) {
                throw new AppError('Tenant/restaurant introuvable', 400);
            }

            req.tenantId = effectiveTenantId;
            req.restaurantId = effectiveRestaurantId;

            req.user = {
                ...(req.user || {}),
                tenant_id: req.user?.tenant_id || effectiveTenantId,
                tenantId: req.user?.tenantId || effectiveTenantId,
                restaurant_id: req.user?.restaurant_id || effectiveRestaurantId,
                restaurantId: req.user?.restaurantId || effectiveRestaurantId
            };

            next();
        } catch (error) {
            next(error);
        }
    };
};

module.exports = requireTenantScope;
