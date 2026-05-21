const COLLECTIONS = require('../shared/constants/collections');
const { createSlug } = require('../shared/utils/slug');

const LEGACY_TENANT_KEYS = ['tenantId', 'tenant_id', 'restaurantId', 'restaurant_id'];

const BUSINESS_COLLECTIONS = [
    COLLECTIONS.CATEGORIES,
    COLLECTIONS.ORDER_ITEM_COMPOSITIONS,
    COLLECTIONS.ORDER_ITEMS,
    COLLECTIONS.ORDERS,
    COLLECTIONS.COMPOSITIONS,
    COLLECTIONS.CUSTOMERS,
    COLLECTIONS.MENU_ITEM_COMPOSITIONS,
    COLLECTIONS.MENU_ITEMS,
    COLLECTIONS.CART_ITEM_COMPOSITIONS,
    COLLECTIONS.CART_ITEMS,
    COLLECTIONS.CARTS,
    COLLECTIONS.TABLE_SESSIONS,
    COLLECTIONS.TABLES,
    COLLECTIONS.TYPE_CATEGORIES,
    COLLECTIONS.USERS
];

const DEFAULT_RESTAURANT_IDS = [
    'tenant-delice-food-by-arth-57l52',
    'tenant-safire-faef2b44'
];

const createEmptyCollectionStats = () => ({
    scanned: 0,
    updated: 0,
    skippedAlreadyMigrated: 0,
    skippedNoTenantMatch: 0,
    conflicts: 0,
    errors: 0
});

class MigrationService {
    constructor({ db, logger = console, dryRun = false, now = () => new Date().toISOString() } = {}) {
        if (!db) {
            throw new Error('Firestore DB not configured');
        }

        this.db = db;
        this.logger = logger;
        this.dryRun = dryRun;
        this.now = now;
        this.stats = {
            dryRun,
            restaurants: 0,
            organizationsCreated: 0,
            organizationsExisting: 0,
            branchesCreated: 0,
            branchesExisting: 0,
            mappingsCreated: 0,
            mappingsExisting: 0,
            documentsUpdated: 0,
            conflicts: [],
            errors: [],
            collections: {}
        };
    }

    getTenantFromDocument(id, data = {}) {
        return data.tenantId
            || data.tenant_id
            || data.restaurantId
            || data.restaurant_id
            || id
            || null;
    }

    buildBaseSlug(tenantId = '') {
        const withoutPrefix = String(tenantId).replace(/^tenant[-_]/, '');
        const parts = withoutPrefix.split('-').filter(Boolean);
        const last = parts[parts.length - 1] || '';

        // Les anciens ids se terminent souvent par un suffixe technique court.
        // On le retire pour obtenir un identifiant SaaS lisible et stable.
        if (parts.length > 1 && last.length >= 5 && /\d/.test(last)) {
            parts.pop();
        }

        return createSlug(parts.join('-') || withoutPrefix);
    }

    buildMappingFromRestaurant(restaurantId, restaurant = {}) {
        const oldTenantId = this.getTenantFromDocument(restaurantId, restaurant);
        const oldRestaurantId = restaurant.restaurantId
            || restaurant.restaurant_id
            || oldTenantId;
        const baseSlug = this.buildBaseSlug(oldTenantId);
        const baseKey = baseSlug.replace(/-/g, '_');

        return {
            oldTenantId,
            oldRestaurantId,
            organizationId: `org_${baseKey}`,
            branchId: `branch_${baseKey}_main`,
            organizationSlug: baseSlug,
            branchSlug: `${baseSlug}-main`,
            displayName: restaurant.name || restaurant.restaurantName || baseSlug
        };
    }

    async getRestaurantDocuments(targetRestaurantIds = DEFAULT_RESTAURANT_IDS) {
        const restaurants = [];

        for (const restaurantId of targetRestaurantIds) {
            const ref = this.db.collection(COLLECTIONS.RESTAURANTS).doc(restaurantId);
            const snap = await ref.get();

            if (!snap.exists) {
                this.logger.warn(`Restaurant introuvable, ignore: ${restaurantId}`);
                this.stats.errors.push({
                    scope: 'restaurants',
                    id: restaurantId,
                    message: 'Restaurant introuvable'
                });
                continue;
            }

            restaurants.push({ id: snap.id, data: snap.data() || {} });
        }

        return restaurants;
    }

    async setDocument(ref, payload) {
        if (this.dryRun) {
            return;
        }

        await ref.set(payload, { merge: true });
    }

    async updateDocument(ref, payload) {
        if (this.dryRun) {
            return;
        }

        await ref.update(payload);
    }

    async ensureOrganization(mapping, restaurant = {}) {
        const ref = this.db.collection(COLLECTIONS.ORGANIZATIONS).doc(mapping.organizationId);
        const snap = await ref.get();
        const timestamp = this.now();

        if (snap.exists) {
            this.stats.organizationsExisting += 1;
            this.logger.info(`Organisation existante: ${mapping.organizationId}`);
            return;
        }

        const payload = {
            id: mapping.organizationId,
            slug: mapping.organizationSlug,
            name: restaurant.name || restaurant.restaurantName || mapping.displayName,
            type: 'independent',
            subscriptionPlan: restaurant.subscriptionPlan || 'starter',
            isActive: restaurant.isActive ?? true,
            ownerUserId: restaurant.ownerUserId || restaurant.owner_user_id || null,
            contact: restaurant.contact || {
                email: restaurant.email || null,
                phoneNumber: restaurant.phoneNumber || restaurant.phone || null
            },
            metadata: {
                ...(restaurant.metadata || {}),
                migratedFrom: COLLECTIONS.RESTAURANTS,
                oldTenantId: mapping.oldTenantId,
                oldRestaurantId: mapping.oldRestaurantId
            },
            createdAt: timestamp,
            updatedAt: timestamp
        };

        await this.setDocument(ref, payload);
        this.stats.organizationsCreated += 1;
        this.logger.info(`Organisation creee: ${mapping.organizationId}`);
    }

    async ensureBranch(mapping, restaurant = {}) {
        const ref = this.db.collection(COLLECTIONS.BRANCHES).doc(mapping.branchId);
        const snap = await ref.get();
        const timestamp = this.now();

        if (snap.exists) {
            this.stats.branchesExisting += 1;
            this.logger.info(`Branche existante: ${mapping.branchId}`);
            return;
        }

        const payload = {
            id: mapping.branchId,
            organizationId: mapping.organizationId,
            slug: mapping.branchSlug,
            name: `${restaurant.name || restaurant.restaurantName || mapping.displayName} Main Branch`,
            code: mapping.branchId.toUpperCase(),
            address: restaurant.address || '',
            city: restaurant.city || '',
            country: restaurant.country || '',
            phoneNumber: restaurant.phoneNumber || restaurant.phone || '',
            email: restaurant.email || '',
            isMainBranch: true,
            isActive: restaurant.isActive ?? true,
            metadata: {
                migratedFrom: COLLECTIONS.RESTAURANTS,
                oldTenantId: mapping.oldTenantId,
                oldRestaurantId: mapping.oldRestaurantId
            },
            createdAt: timestamp,
            updatedAt: timestamp
        };

        await this.setDocument(ref, payload);
        this.stats.branchesCreated += 1;
        this.logger.info(`Branche creee: ${mapping.branchId}`);
    }

    async ensureMigrationMapping(mapping) {
        const ref = this.db.collection(COLLECTIONS.TENANT_MIGRATIONS).doc(mapping.oldTenantId);
        const snap = await ref.get();

        if (snap.exists) {
            this.stats.mappingsExisting += 1;
            this.logger.info(`Mapping existant: ${mapping.oldTenantId}`);
            return snap.data();
        }

        const payload = {
            oldTenantId: mapping.oldTenantId,
            oldRestaurantId: mapping.oldRestaurantId,
            organizationId: mapping.organizationId,
            branchId: mapping.branchId,
            migratedAt: this.now(),
            status: 'prepared'
        };

        await this.setDocument(ref, payload);
        this.stats.mappingsCreated += 1;
        this.logger.info(`Mapping cree: ${mapping.oldTenantId} -> ${mapping.organizationId}/${mapping.branchId}`);
        return payload;
    }

    buildUpdateForDocument(data, mapping) {
        const currentOrganizationId = data.organizationId || null;
        const currentBranchId = data.branchId || null;

        if (currentOrganizationId && currentOrganizationId !== mapping.organizationId) {
            return {
                status: 'conflict',
                reason: 'organizationId existant different du mapping attendu'
            };
        }

        if (currentBranchId && currentBranchId !== mapping.branchId) {
            return {
                status: 'conflict',
                reason: 'branchId existant different du mapping attendu'
            };
        }

        if (currentOrganizationId && currentBranchId) {
            return { status: 'already_migrated' };
        }

        return {
            status: 'update',
            payload: {
                ...(currentOrganizationId ? {} : { organizationId: mapping.organizationId }),
                ...(currentBranchId ? {} : { branchId: mapping.branchId }),
                updatedAt: this.now()
            }
        };
    }

    findMappingForDocument(data, mappingsByLegacyId) {
        for (const key of LEGACY_TENANT_KEYS) {
            const value = data[key];
            if (value && mappingsByLegacyId.has(value)) {
                return mappingsByLegacyId.get(value);
            }
        }

        return null;
    }

    async migrateCollection(collectionName, mappingsByLegacyId) {
        const collectionStats = createEmptyCollectionStats();
        this.stats.collections[collectionName] = collectionStats;

        this.logger.info(`Analyse collection: ${collectionName}`);
        const snapshot = await this.db.collection(collectionName).get();

        for (const doc of snapshot.docs) {
            collectionStats.scanned += 1;
            const data = doc.data() || {};
            const mapping = this.findMappingForDocument(data, mappingsByLegacyId);

            if (!mapping) {
                collectionStats.skippedNoTenantMatch += 1;
                continue;
            }

            const decision = this.buildUpdateForDocument(data, mapping);

            if (decision.status === 'already_migrated') {
                collectionStats.skippedAlreadyMigrated += 1;
                continue;
            }

            if (decision.status === 'conflict') {
                collectionStats.conflicts += 1;
                this.stats.conflicts.push({
                    collection: collectionName,
                    id: doc.id,
                    tenantId: mapping.oldTenantId,
                    organizationId: data.organizationId || null,
                    branchId: data.branchId || null,
                    expectedOrganizationId: mapping.organizationId,
                    expectedBranchId: mapping.branchId,
                    reason: decision.reason
                });
                this.logger.warn(`Conflit ignore: ${collectionName}/${doc.id}`);
                continue;
            }

            try {
                await this.updateDocument(doc.ref, decision.payload);
                collectionStats.updated += 1;
                this.stats.documentsUpdated += 1;
            } catch (error) {
                collectionStats.errors += 1;
                this.stats.errors.push({
                    scope: collectionName,
                    id: doc.id,
                    message: error.message
                });
                this.logger.error(`Erreur migration document ${collectionName}/${doc.id}: ${error.message}`);
            }
        }

        this.logger.info(`Collection terminee: ${collectionName}`, collectionStats);
    }

    async finalizeMappings(mappingsByTenantId) {
        for (const mapping of mappingsByTenantId.values()) {
            const ref = this.db.collection(COLLECTIONS.TENANT_MIGRATIONS).doc(mapping.oldTenantId);
            const payload = {
                status: this.stats.errors.length || this.stats.conflicts.length ? 'completed_with_warnings' : 'completed',
                completedAt: this.now(),
                report: {
                    documentsUpdated: this.stats.documentsUpdated,
                    conflicts: this.stats.conflicts.length,
                    errors: this.stats.errors.length
                }
            };

            await this.setDocument(ref, payload);
            this.logger.info(`Mapping finalise: ${mapping.oldTenantId} (${payload.status})`);
        }
    }

    async run(options = {}) {
        const targetRestaurantIds = options.restaurantIds?.length
            ? options.restaurantIds
            : DEFAULT_RESTAURANT_IDS;
        const targetCollections = options.collections?.length
            ? options.collections
            : BUSINESS_COLLECTIONS;

        this.logger.info('Demarrage migration SaaS progressive', {
            dryRun: this.dryRun,
            targetRestaurantIds,
            targetCollections
        });

        const restaurantDocs = await this.getRestaurantDocuments(targetRestaurantIds);
        const mappingsByLegacyId = new Map();
        const mappingsByTenantId = new Map();

        for (const restaurantDoc of restaurantDocs) {
            this.stats.restaurants += 1;
            const mapping = this.buildMappingFromRestaurant(restaurantDoc.id, restaurantDoc.data);

            await this.ensureOrganization(mapping, restaurantDoc.data);
            await this.ensureBranch(mapping, restaurantDoc.data);
            const persistedMapping = await this.ensureMigrationMapping(mapping);

            mappingsByLegacyId.set(mapping.oldTenantId, { ...mapping, ...persistedMapping });
            mappingsByLegacyId.set(mapping.oldRestaurantId, { ...mapping, ...persistedMapping });
            mappingsByLegacyId.set(restaurantDoc.id, { ...mapping, ...persistedMapping });
            mappingsByTenantId.set(mapping.oldTenantId, { ...mapping, ...persistedMapping });
        }

        for (const collectionName of targetCollections) {
            await this.migrateCollection(collectionName, mappingsByLegacyId);
        }

        await this.finalizeMappings(mappingsByTenantId);

        this.logger.info('Migration SaaS terminee', this.stats);
        return this.stats;
    }
}

module.exports = {
    MigrationService,
    BUSINESS_COLLECTIONS,
    DEFAULT_RESTAURANT_IDS
};
