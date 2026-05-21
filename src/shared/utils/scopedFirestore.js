/** 
 * Utilitaires pour construire des requêtes Firestore avec un scope SaaS
 * Ce module permet de construire des requêtes Firestore qui respectent les scopes d'organisation et de branche pour les applications SaaS multi-tenant.
 * Il gère également un fallback vers un modèle de scope basé sur restaurantId pour les cas où les champs SaaS ne sont pas présents.
 * Les fonctions principales incluent:
 * - buildScopedFirestoreQuery: construit une requête Firestore avec les filtres de scope appropriés
 * - withBusinessScope: ajoute les champs de scope à un payload avant création dans Firestore
 * - matchesBusinessScope: vérifie si un document correspond au scope d'une requête
 * - filterByBusinessScope: filtre une liste de documents pour ne retourner que ceux qui correspondent au scope
 * - assertBranchOwnership: vérifie qu'un document appartient à la branche attendue et lance une erreur sinon
 * 
 * La configuration des scopes est déterminée par les variables d'environnement ENABLE_SCOPED_QUERIES et 
 * ENABLE_LEGACY_FALLBACK, ainsi que par la présence des champs organizationId et branchId dans le scope fourni.
 * **/

const AppError = require('../errors/AppError');
const logger = require('./logger');
const { filterByRestaurantScope, matchesRestaurantScope, withRestaurantScope } = require('./tenant');

const isScopedQueriesEnabled = () =>
    String(process.env.ENABLE_SCOPED_QUERIES || 'true').toLowerCase() !== 'false';

const isLegacyFallbackEnabled = () =>
    String(process.env.ENABLE_LEGACY_FALLBACK || 'true').toLowerCase() !== 'false';

const getSaasScope = (input = {}) => input.saas || input.scope || input || {};

const hasNativeSaasScope = (scope = {}) =>
    Boolean(scope.enabled !== false && scope.organizationId && scope.branchId);

const getLegacyRestaurantId = (input = {}) =>
    input.restaurantId
    || input.restaurant_id
    || input.tenantId
    || input.tenant_id
    || input.legacy?.restaurantId
    || input.legacy?.tenantId
    || null;

const applyFilters = (query, filters = []) => {
    let scopedQuery = query;

    filters.forEach((filter) => {
        if (Array.isArray(filter)) {
            scopedQuery = scopedQuery.where(filter[0], filter[1], filter[2]);
        } else if (filter?.field) {
            scopedQuery = scopedQuery.where(filter.field, filter.op || '==', filter.value);
        }
    });

    return scopedQuery;
};

const applyOrdering = (query, orderBy = []) => {
    const orders = Array.isArray(orderBy?.[0]) || orderBy?.field ? [].concat(orderBy) : orderBy;
    let orderedQuery = query;

    (orders || []).filter(Boolean).forEach((order) => {
        if (Array.isArray(order)) {
            orderedQuery = orderedQuery.orderBy(order[0], order[1]);
        } else {
            orderedQuery = orderedQuery.orderBy(order.field, order.direction || 'asc');
        }
    });

    return orderedQuery;
};

const buildScopedFirestoreQuery = ({ collection, req = null, scope = null, filters = [], orderBy = [], limit = null } = {}) => {
    if (!collection) {
        throw new Error('collection est requis pour buildScopedFirestoreQuery');
    }

    const resolvedScope = getSaasScope(scope || req || {});
    let query = collection;

    if (isScopedQueriesEnabled() && hasNativeSaasScope(resolvedScope)) {
        logger.debug?.('[SaaS Scope] Firestore query scoped', {
            organizationId: resolvedScope.organizationId,
            branchId: resolvedScope.branchId
        });
        query = query
            .where('organizationId', '==', resolvedScope.organizationId)
            .where('branchId', '==', resolvedScope.branchId);
    } else if (isLegacyFallbackEnabled()) {
        const legacyId = getLegacyRestaurantId(req || scope || {});
        if (legacyId) {
            logger.debug?.('[Legacy Query] Firestore query tenant fallback', { legacyId });
            query = query.where('restaurantId', '==', legacyId);
        }
    }

    query = applyFilters(query, filters);
    query = applyOrdering(query, orderBy);

    if (limit) {
        query = query.limit(limit);
    }

    return query;
};

const buildRealtimeScopedQuery = (options = {}) => buildScopedFirestoreQuery(options);

const createScopeFromEntity = (entity = {}, fallbackScope = {}) => ({
    ...(fallbackScope || {}),
    enabled: fallbackScope.enabled !== false,
    organizationId: fallbackScope.organizationId || entity.organizationId || null,
    branchId: fallbackScope.branchId || entity.branchId || null,
    organization: fallbackScope.organization || null,
    branch: fallbackScope.branch || null,
    source: fallbackScope.source || (entity.organizationId && entity.branchId ? 'entity_scope' : 'fallback'),
    legacy: fallbackScope.legacy || {
        tenantId: entity.tenantId || entity.tenant_id || null,
        restaurantId: entity.restaurantId || entity.restaurant_id || null
    }
});

const withBusinessScope = (payload, restaurantId, scope = {}) => {
    const legacyPayload = withRestaurantScope(payload, restaurantId);
    const saas = getSaasScope(scope);

    if (isScopedQueriesEnabled() && hasNativeSaasScope(saas)) {
        logger.debug?.('[SaaS Scope] Create payload scoped', {
            organizationId: saas.organizationId,
            branchId: saas.branchId
        });

        return {
            ...legacyPayload,
            organizationId: legacyPayload.organizationId || saas.organizationId,
            branchId: legacyPayload.branchId || saas.branchId
        };
    }

    logger.debug?.('[SaaS Fallback] Create payload legacy only', { restaurantId });
    return legacyPayload;
};

const matchesBusinessScope = (entity, restaurantId, scope = {}) => {
    if (!entity) {
        return false;
    }

    const saas = getSaasScope(scope);
    if (isScopedQueriesEnabled() && hasNativeSaasScope(saas) && entity.organizationId && entity.branchId) {
        return entity.organizationId === saas.organizationId && entity.branchId === saas.branchId;
    }

    if (!isLegacyFallbackEnabled()) {
        return false;
    }

    return matchesRestaurantScope(entity, restaurantId);
};

const filterByBusinessScope = (items, restaurantId, scope = {}) => {
    const saas = getSaasScope(scope);
    const safeItems = items || [];

    if (isScopedQueriesEnabled() && hasNativeSaasScope(saas)) {
        const scopedItems = safeItems.filter((item) =>
            item.organizationId === saas.organizationId && item.branchId === saas.branchId
        );

        if (scopedItems.length || !isLegacyFallbackEnabled()) {
            return scopedItems;
        }

        logger.debug?.('[SaaS Fallback] Aucun document SaaS trouve, fallback legacy', {
            organizationId: saas.organizationId,
            branchId: saas.branchId,
            restaurantId
        });
    }

    return isLegacyFallbackEnabled() ? filterByRestaurantScope(safeItems, restaurantId) : [];
};

const assertBranchOwnership = (entity, scope = {}, options = {}) => {
    const saas = getSaasScope(scope);
    if (!isScopedQueriesEnabled() || !hasNativeSaasScope(saas) || !entity?.organizationId || !entity?.branchId) {
        return true;
    }

    if (entity.organizationId !== saas.organizationId || entity.branchId !== saas.branchId) {
        logger.warn('[Cross Branch Access Attempt]', {
            expectedOrganizationId: saas.organizationId,
            expectedBranchId: saas.branchId,
            documentOrganizationId: entity.organizationId,
            documentBranchId: entity.branchId,
            collection: options.collection || null,
            id: entity.id || null
        });

        throw new AppError('Acces refuse: document hors branche', 403, {
            organizationId: saas.organizationId,
            branchId: saas.branchId,
            documentOrganizationId: entity.organizationId,
            documentBranchId: entity.branchId
        });
    }

    return true;
};

module.exports = {
    buildScopedFirestoreQuery,
    withBusinessScope,
    matchesBusinessScope,
    filterByBusinessScope,
    assertBranchOwnership,
    buildRealtimeScopedQuery,
    createScopeFromEntity,
    isScopedQueriesEnabled,
    isLegacyFallbackEnabled,
    hasNativeSaasScope
};
