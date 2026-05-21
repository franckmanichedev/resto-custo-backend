const { db } = require('../../infrastructure/firebase/firebaseAdmin');
const logger = require('../utils/logger');
const MemoryCacheService = require('../../services/cacheService');
const { SaasScopeService, FALLBACK_SOURCE } = require('../../services/saasScopeService');

let defaultService = null;

const isEnabled = () => {
    if (!db) {
        return false;
    }

    return String(process.env.ENABLE_SAAS_SCOPE || 'true').toLowerCase() !== 'false';
};

const getDefaultService = () => {
    if (!defaultService) {
        defaultService = new SaasScopeService({
            db,
            logger,
            cache: new MemoryCacheService()
        });
    }

    return defaultService;
};

/**
 * Resolve req.saas sans casser les anciens flux tenantId / restaurantId.
 * Le middleware reste volontairement permissif par defaut pour etre montable globalement.
 */
module.exports = function resolveSaasScope(options = {}) {
    const {
        allowMissing = true,
        service = null
    } = options;

    return async (req, res, next) => {
        try {
            if (!isEnabled()) {
                req.saas = {
                    organizationId: null,
                    branchId: null,
                    organization: null,
                    branch: null,
                    source: FALLBACK_SOURCE,
                    legacy: {
                        tenantId: req.tenantId || req.user?.tenantId || req.user?.tenant_id || null,
                        restaurantId: req.restaurantId || req.user?.restaurantId || req.user?.restaurant_id || null
                    },
                    enabled: false
                };

                return next();
            }

            const scopeService = service || getDefaultService();
            req.saas = {
                ...(await scopeService.resolveFromRequest(req, { allowMissing })),
                enabled: true
            };

            req.organizationId = req.saas.organizationId;
            req.branchId = req.saas.branchId;

            return next();
        } catch (error) {
            return next(error);
        }
    };
};

module.exports.getDefaultService = getDefaultService;
module.exports.isEnabled = isEnabled;
