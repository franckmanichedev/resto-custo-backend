const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || process.env.DEFAULT_RESTAURANT_ID || 'default-tenant';
const DEFAULT_RESTAURANT_ID = DEFAULT_TENANT_ID;

const extractTenantId = (source) => {
    if (!source || typeof source !== 'object') {
        return null;
    }

    return source.tenant_id
        || source.tenantId
        || source.restaurant_id
        || source.restaurantId
        || source?.headers?.['x-tenant-id']
        || source?.headers?.['X-Tenant-Id']
        || source?.headers?.['x-restaurant-id']
        || source?.headers?.['X-Restaurant-Id']
        || null;
};

const resolveTenantId = (input) => {
    if (typeof input === 'string' && input.trim()) {
        return input.trim();
    }

    if (!input || typeof input !== 'object') {
        return DEFAULT_TENANT_ID;
    }

    return extractTenantId(input.user)
        || extractTenantId(input.body)
        || extractTenantId(input.query)
        || extractTenantId(input.params)
        || extractTenantId(input)
        || DEFAULT_TENANT_ID;
};

const resolveRestaurantId = resolveTenantId;

const matchesTenantScope = (entity, tenantId) => {
    if (!entity) {
        return false;
    }

    const scopeIds = [
        entity.tenant_id,
        entity.tenantId,
        entity.restaurant_id,
        entity.restaurantId
    ].filter(Boolean);

    if (scopeIds.length === 0) {
        return tenantId === DEFAULT_TENANT_ID || tenantId === DEFAULT_RESTAURANT_ID;
    }

    return scopeIds.includes(tenantId);
};

const matchesRestaurantScope = matchesTenantScope;

const filterByTenantScope = (entities, tenantId) =>
    (entities || []).filter((entity) => matchesTenantScope(entity, tenantId));

const filterByRestaurantScope = filterByTenantScope;

const withTenantScope = (payload, tenantId) => ({
    ...payload,
    tenant_id: payload.tenant_id || payload.tenantId || payload.restaurant_id || payload.restaurantId || tenantId || DEFAULT_TENANT_ID,
    tenantId: payload.tenantId || payload.tenant_id || payload.restaurant_id || payload.restaurantId || tenantId || DEFAULT_TENANT_ID,
    restaurant_id: payload.restaurant_id || payload.restaurantId || payload.tenant_id || payload.tenantId || tenantId || DEFAULT_TENANT_ID,
    restaurantId: payload.restaurantId || payload.restaurant_id || payload.tenant_id || payload.tenantId || tenantId || DEFAULT_TENANT_ID
});

const withRestaurantScope = withTenantScope;

module.exports = {
    DEFAULT_TENANT_ID,
    DEFAULT_RESTAURANT_ID,
    resolveTenantId,
    resolveRestaurantId,
    matchesTenantScope,
    matchesRestaurantScope,
    filterByTenantScope,
    filterByRestaurantScope,
    withTenantScope,
    withRestaurantScope
};
