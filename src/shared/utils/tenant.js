const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || process.env.DEFAULT_RESTAURANT_ID || 'default-tenant';
const DEFAULT_RESTAURANT_ID = DEFAULT_TENANT_ID;

const extractTenantId = (source) => {
  if (!source || typeof source !== 'object') return null;

  return (
    source.tenant_id
    || source.tenantId
    || source?.headers?.['x-tenant-id']
    || source?.headers?.['X-Tenant-Id']
    || source?.claims?.tenant_id
    || source?.claims?.tenantId
    || null
  );
};

const extractRestaurantId = (source) => {
  if (!source || typeof source !== 'object') return null;

  return (
    source.restaurant_id
    || source.restaurantId
    || source?.headers?.['x-restaurant-id']
    || source?.headers?.['X-Restaurant-Id']
    || source?.claims?.restaurant_id
    || source?.claims?.restaurantId
    || null
  );
};

const resolveTenantId = (input) => {
  if (typeof input === 'string' && input.trim()) return input.trim();

  if (!input || typeof input !== 'object') return DEFAULT_TENANT_ID;

  // Prefer tenant/restaurant ids already extracted on the authenticated user
  return extractTenantId(input.user)
    || extractTenantId(input)
    || extractRestaurantId(input.user) // fallback backward compat
    || extractRestaurantId(input) // fallback backward compat
    || DEFAULT_TENANT_ID;
};

const resolveRestaurantId = (input) => {
  if (typeof input === 'string' && input.trim()) return input.trim();

  if (!input || typeof input !== 'object') return DEFAULT_RESTAURANT_ID;

  return extractRestaurantId(input.user)
    || extractRestaurantId(input)
    || extractTenantId(input.user) // fallback backward compat
    || extractTenantId(input) // fallback backward compat
    || DEFAULT_RESTAURANT_ID;
};

const matchesTenantId = (entity, tenantId) => {
  if (!entity) return false;

  const tenantScopeIds = [
    entity.tenant_id,
    entity.tenantId
  ].filter(Boolean);

  if (!tenantScopeIds.length) return tenantId === DEFAULT_TENANT_ID || tenantId === DEFAULT_RESTAURANT_ID;

  return tenantScopeIds.includes(tenantId);
};

const matchesRestaurantId = (entity, restaurantId) => {
  if (!entity) return false;

  const restaurantScopeIds = [
    entity.restaurant_id,
    entity.restaurantId
  ].filter(Boolean);

  if (!restaurantScopeIds.length) return restaurantId === DEFAULT_RESTAURANT_ID || restaurantId === DEFAULT_TENANT_ID;

  return restaurantScopeIds.includes(restaurantId);
};

// Strict: tenantId AND restaurantId must match
const matchesTenantAndRestaurantScope = (entity, tenantId, restaurantId) => {
  const effectiveTenantId = tenantId ?? DEFAULT_TENANT_ID;
  const effectiveRestaurantId = restaurantId ?? effectiveTenantId;

  // If entity has both scopes stored, we require both. If one is missing, fall back to the other.
  const hasTenantField = Boolean(entity?.tenant_id || entity?.tenantId);
  const hasRestaurantField = Boolean(entity?.restaurant_id || entity?.restaurantId);

  if (hasTenantField && hasRestaurantField) {
    return matchesTenantId(entity, effectiveTenantId) && matchesRestaurantId(entity, effectiveRestaurantId);
  }

  if (hasTenantField) return matchesTenantId(entity, effectiveTenantId);
  if (hasRestaurantField) return matchesRestaurantId(entity, effectiveRestaurantId);

  // No scope fields: allow only default scope
  return effectiveTenantId === DEFAULT_TENANT_ID && effectiveRestaurantId === DEFAULT_RESTAURANT_ID;
};

// Backward-compatible helpers (old OR matching)
const matchesTenantScope = (entity, tenantId) => {
  if (!entity) return false;

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

const filterByTenantScope = (entities, tenantId) =>
  (entities || []).filter((entity) => matchesTenantScope(entity, tenantId));

// Backward-compatible alias (legacy name)
const filterByRestaurantScope = (entities, restaurantId) => filterByTenantScope(entities, restaurantId);
// Strict AND matching
const filterByTenantAndRestaurantScope = (entities, tenantId, restaurantId) =>
  (entities || []).filter((entity) => matchesTenantAndRestaurantScope(entity, tenantId, restaurantId));

const withTenantScope = (payload, tenantId) => ({
  ...payload,
  tenant_id: payload.tenant_id || payload.tenantId || payload.tenant_id || tenantId || DEFAULT_TENANT_ID,
  tenantId: payload.tenantId || payload.tenant_id || tenantId || DEFAULT_TENANT_ID,
  restaurant_id: payload.restaurant_id || payload.restaurantId || payload.tenant_id || payload.tenantId || tenantId || DEFAULT_TENANT_ID,
  restaurantId: payload.restaurantId || payload.restaurant_id || payload.tenant_id || payload.tenantId || tenantId || DEFAULT_TENANT_ID
});

// New helper: set tenant AND restaurant separately
const withTenantAndRestaurantScope = (payload, tenantId, restaurantId) => ({
  ...payload,
  tenant_id: tenantId ?? payload.tenant_id ?? payload.tenantId ?? DEFAULT_TENANT_ID,
  tenantId: tenantId ?? payload.tenantId ?? payload.tenant_id ?? DEFAULT_TENANT_ID,
  restaurant_id: restaurantId ?? payload.restaurant_id ?? payload.restaurantId ?? tenantId ?? DEFAULT_RESTAURANT_ID,
  restaurantId: restaurantId ?? payload.restaurantId ?? payload.restaurant_id ?? tenantId ?? DEFAULT_RESTAURANT_ID
});

// Backward-compatible alias
const withRestaurantScope = withTenantScope;

module.exports = {
  DEFAULT_TENANT_ID,
  DEFAULT_RESTAURANT_ID,

  resolveTenantId,
  resolveRestaurantId,

  matchesTenantScope,
  matchesRestaurantScope: matchesTenantScope, // backward compat

  filterByTenantScope,
  filterByRestaurantScope,
  filterByTenantAndRestaurantScope,

  matchesTenantAndRestaurantScope,

  withTenantScope,
  withTenantAndRestaurantScope,
  withRestaurantScope
};
