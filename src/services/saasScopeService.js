const AppError = require('../shared/errors/AppError');
const COLLECTIONS = require('../shared/constants/collections');
const MemoryCacheService = require('./cacheService');
const logger = require('../shared/utils/logger');

const NATIVE_SOURCE = 'native_saas';
const LEGACY_SOURCE = 'legacy_tenant';
const QR_SOURCE = 'qr_session';
const FALLBACK_SOURCE = 'fallback';

const getFirstValue = (...values) => {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }

    return null;
};

const readHeader = (headers = {}, key) => headers[key] || headers[key.toLowerCase()] || headers[key.toUpperCase()] || null;

const extractSaasScope = (req = {}) => ({
    organizationId: getFirstValue(
        req.body?.organizationId,
        req.query?.organizationId,
        readHeader(req.headers, 'x-organization-id'),
        req.user?.organizationId,
        req.user?.organization_id
    ),
    branchId: getFirstValue(
        req.body?.branchId,
        req.query?.branchId,
        readHeader(req.headers, 'x-branch-id'),
        req.user?.branchId,
        req.user?.branch_id
    )
});

const extractLegacyScope = (req = {}) => ({
    tenantId: getFirstValue(
        req.tenantId,
        req.body?.tenantId,
        req.body?.tenant_id,
        req.query?.tenantId,
        req.query?.tenant_id,
        readHeader(req.headers, 'x-tenant-id'),
        req.user?.tenantId,
        req.user?.tenant_id
    ),
    restaurantId: getFirstValue(
        req.restaurantId,
        req.body?.restaurantId,
        req.body?.restaurant_id,
        req.query?.restaurantId,
        req.query?.restaurant_id,
        readHeader(req.headers, 'x-restaurant-id'),
        req.user?.restaurantId,
        req.user?.restaurant_id
    )
});

const hasQrSessionSignal = (req = {}) => Boolean(
    req.params?.qrCode
    || req.query?.qrCode
    || req.query?.sessionId
    || req.query?.tableSessionId
    || readHeader(req.headers, 'x-qr-session-id')
);

class SaasScopeService {
    constructor({ db, cache = new MemoryCacheService(), logger: scopeLogger = logger } = {}) {
        if (!db) {
            throw new Error('Firestore DB not configured');
        }

        this.db = db;
        this.cache = cache;
        this.logger = scopeLogger;
    }

    async getCachedDoc(collectionName, id) {
        if (!id) {
            return null;
        }

        const cacheKey = `doc:${collectionName}:${id}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            this.logger.debug?.('SaaS scope cache hit', { cacheKey });
            return cached;
        }

        const doc = await this.db.collection(collectionName).doc(id).get();
        const value = doc.exists ? { id: doc.id, ...(doc.data() || {}) } : null;
        if (value) {
            this.cache.set(cacheKey, value);
        }

        return value;
    }

    async getTenantMigration(tenantOrRestaurantId) {
        if (!tenantOrRestaurantId) {
            return null;
        }

        const cacheKey = `tenant_migration:${tenantOrRestaurantId}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            this.logger.debug?.('SaaS legacy migration cache hit', { tenantOrRestaurantId });
            return cached;
        }

        const direct = await this.getCachedDoc(COLLECTIONS.TENANT_MIGRATIONS, tenantOrRestaurantId);
        if (direct) {
            this.cache.set(cacheKey, direct);
            return direct;
        }

        const snapshot = await this.db.collection(COLLECTIONS.TENANT_MIGRATIONS)
            .where('oldRestaurantId', '==', tenantOrRestaurantId)
            .limit(1)
            .get();

        const value = snapshot.empty ? null : { id: snapshot.docs[0].id, ...(snapshot.docs[0].data() || {}) };
        if (value) {
            this.cache.set(cacheKey, value);
        }

        return value;
    }

    async resolveTenantToSaasScope({ tenantId, restaurantId } = {}) {
        const migration = await this.getTenantMigration(tenantId || restaurantId);

        if (!migration && restaurantId && restaurantId !== tenantId) {
            return this.getTenantMigration(restaurantId);
        }

        return migration;
    }

    async hydrateScope({ organizationId, branchId, source, legacy = {} }) {
        const [organization, branch] = await Promise.all([
            this.getCachedDoc(COLLECTIONS.ORGANIZATIONS, organizationId),
            this.getCachedDoc(COLLECTIONS.BRANCHES, branchId)
        ]);

        if (!organization || !branch) {
            throw new AppError('Scope SaaS introuvable', 404, { organizationId, branchId });
        }

        if (branch.organizationId !== organizationId) {
            this.logger.warn('SaaS scope conflict: branch hors organisation', {
                organizationId,
                branchId,
                branchOrganizationId: branch.organizationId
            });
            throw new AppError('Acces refuse: branche hors organisation', 403, {
                organizationId,
                branchId,
                branchOrganizationId: branch.organizationId
            });
        }

        return {
            organizationId,
            branchId,
            organization,
            branch,
            source,
            legacy
        };
    }

    async resolveFromRequest(req = {}, options = {}) {
        const { allowMissing = true } = options;
        const native = extractSaasScope(req);
        const legacy = extractLegacyScope(req);
        const qrSession = hasQrSessionSignal(req);

        if (native.organizationId && native.branchId) {
            const legacyMapping = await this.resolveTenantToSaasScope(legacy);
            if (legacyMapping && (
                legacyMapping.organizationId !== native.organizationId
                || legacyMapping.branchId !== native.branchId
            )) {
                this.logger.warn('SaaS scope conflict: native scope different du legacy scope', {
                    native,
                    legacy,
                    legacyMapping
                });
                throw new AppError('Conflit de scope SaaS', 403, { native, legacyMapping });
            }

            return this.hydrateScope({
                organizationId: native.organizationId,
                branchId: native.branchId,
                source: qrSession ? QR_SOURCE : NATIVE_SOURCE,
                legacy
            });
        }

        const migration = await this.resolveTenantToSaasScope(legacy);
        if (migration?.organizationId && migration?.branchId) {
            this.logger.debug?.('Resolution SaaS via tenant legacy', {
                tenantId: legacy.tenantId,
                restaurantId: legacy.restaurantId,
                organizationId: migration.organizationId,
                branchId: migration.branchId
            });

            return this.hydrateScope({
                organizationId: migration.organizationId,
                branchId: migration.branchId,
                source: qrSession ? QR_SOURCE : LEGACY_SOURCE,
                legacy
            });
        }

        if (!allowMissing) {
            throw new AppError('Scope SaaS introuvable', 400, { native, legacy });
        }

        return {
            organizationId: native.organizationId || null,
            branchId: native.branchId || null,
            organization: null,
            branch: null,
            source: FALLBACK_SOURCE,
            legacy
        };
    }
}

const resolveTenantToSaasScope = (scope, options = {}) => {
    const service = options.service || new SaasScopeService(options);
    return service.resolveTenantToSaasScope(scope);
};

module.exports = {
    SaasScopeService,
    resolveTenantToSaasScope,
    extractSaasScope,
    extractLegacyScope,
    NATIVE_SOURCE,
    LEGACY_SOURCE,
    QR_SOURCE,
    FALLBACK_SOURCE
};
