#!/usr/bin/env node

require('dotenv').config();

const path = require('path');
const { db } = require(path.resolve(__dirname, '../src/config/firebase'));

const MENU_ITEM_COLLECTION = 'menu_items';
const CATEGORY_COLLECTION = 'categories';
const TYPE_CATEGORY_COLLECTION = 'type_categories';
const BATCH_LIMIT = 400;

const args = new Set(process.argv.slice(2));
const dryRun = !args.has('--write');
const overwrite = args.has('--overwrite');

if (args.has('--help') || args.has('-h')) {
    console.log('Usage: node scripts/migrate-menu-item-taxonomy.js [--write] [--overwrite]');
    console.log('');
    console.log('--write      Execute les ecritures Firestore. Sans cette option, le script reste en dry-run.');
    console.log('--overwrite  Re-ecrit categorie_id et type_categorie_id meme s ils existent deja.');
    console.log('--help       Affiche cette aide.');
    process.exit(0);
}

const nowIso = () => new Date().toISOString();

const normalizeName = (value = '') =>
    value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();

const ensureFirebaseReady = () => {
    if (!db) {
        throw new Error(
            'Firestore n est pas initialise. Verifiez les variables FIREBASE_* dans votre fichier .env.'
        );
    }
};

const chunk = (items, size) => {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
};

const serializeDoc = (doc) => ({
    id: doc.id,
    ...doc.data()
});

const inferKind = (item) => {
    const candidates = [item.kind, item.category, item.legacy_category]
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean);

    return candidates.includes('boisson') ? 'boisson' : 'plat';
};

const inferCategoryName = (item) => {
    const candidates = [
        item.categorie_name,
        item.category_name,
        item.category_label,
        item.legacy_category,
        item.category,
        item.kind
    ]
        .map((value) => String(value || '').trim())
        .filter(Boolean);

    return candidates[0] || 'Plat';
};

const inferTypeCategoryName = (item) => {
    const candidates = [item.type_categorie_name, item.type_category_name, item.subcategory_name]
        .map((value) => String(value || '').trim())
        .filter(Boolean);

    return candidates[0] || '';
};

const loadExistingCategories = async () => {
    const snapshot = await db.collection(CATEGORY_COLLECTION).get();
    const map = new Map();

    snapshot.docs.map(serializeDoc).forEach((category) => {
        map.set(`${category.kind}::${category.normalized_name}`, category);
    });

    return map;
};

const loadExistingTypeCategories = async () => {
    const snapshot = await db.collection(TYPE_CATEGORY_COLLECTION).get();
    const map = new Map();

    snapshot.docs.map(serializeDoc).forEach((typeCategory) => {
        map.set(`${typeCategory.categorie_id}::${typeCategory.normalized_name}`, typeCategory);
    });

    return map;
};

const ensureCategory = ({ name, kind, cache, writes }) => {
    const normalizedName = normalizeName(name);
    const key = `${kind}::${normalizedName}`;
    const existing = cache.get(key);
    if (existing) {
        return existing;
    }

    const category = {
        id: db.collection(CATEGORY_COLLECTION).doc().id,
        name: name.trim(),
        normalized_name: normalizedName,
        kind,
        description: '',
        is_active: true,
        schema_version: 2,
        migrated_from: 'menu_items',
        createdAt: nowIso(),
        updatedAt: nowIso()
    };

    cache.set(key, category);
    writes.push({
        collection: CATEGORY_COLLECTION,
        id: category.id,
        payload: category
    });

    return category;
};

const ensureTypeCategory = ({ name, categorieId, cache, writes }) => {
    const normalizedName = normalizeName(name);
    const key = `${categorieId}::${normalizedName}`;
    const existing = cache.get(key);
    if (existing) {
        return existing;
    }

    const typeCategory = {
        id: db.collection(TYPE_CATEGORY_COLLECTION).doc().id,
        categorie_id: categorieId,
        name: name.trim(),
        normalized_name: normalizedName,
        description: '',
        is_active: true,
        schema_version: 2,
        migrated_from: 'menu_items',
        createdAt: nowIso(),
        updatedAt: nowIso()
    };

    cache.set(key, typeCategory);
    writes.push({
        collection: TYPE_CATEGORY_COLLECTION,
        id: typeCategory.id,
        payload: typeCategory
    });

    return typeCategory;
};

const main = async () => {
    ensureFirebaseReady();

    console.log('======================================================');
    console.log('Migration Firestore menu_items -> categories/taxonomy');
    console.log('======================================================');
    console.log(`Mode: ${dryRun ? 'DRY-RUN (aucune ecriture)' : 'WRITE (ecriture active)'}`);
    console.log(`Overwrite: ${overwrite ? 'oui' : 'non'}`);
    console.log('');

    const menuItemsSnapshot = await db.collection(MENU_ITEM_COLLECTION).get();
    const menuItems = menuItemsSnapshot.docs.map(serializeDoc);
    const categoryCache = await loadExistingCategories();
    const typeCategoryCache = await loadExistingTypeCategories();
    const writes = [];
    const menuItemUpdates = [];

    console.log(`${MENU_ITEM_COLLECTION}: ${menuItems.length} document(s) source`);
    console.log(`${CATEGORY_COLLECTION}: ${categoryCache.size} categorie(s) deja presente(s)`);
    console.log(`${TYPE_CATEGORY_COLLECTION}: ${typeCategoryCache.size} type(s) deja present(s)`);
    console.log('');

    menuItems.forEach((item) => {
        const shouldSkipCategory = item.categorie_id && !overwrite;
        const shouldSkipType = item.type_categorie_id && !overwrite;
        if (shouldSkipCategory && shouldSkipType) {
            return;
        }

        const kind = inferKind(item);
        const categoryName = inferCategoryName(item);
        const typeCategoryName = inferTypeCategoryName(item);
        const category = ensureCategory({
            name: categoryName,
            kind,
            cache: categoryCache,
            writes
        });

        const updates = {
            updatedAt: nowIso()
        };

        if (!shouldSkipCategory) {
            updates.categorie_id = category.id;
            updates.categorie_name = category.name;
        }

        if (typeCategoryName && !shouldSkipType) {
            const typeCategory = ensureTypeCategory({
                name: typeCategoryName,
                categorieId: category.id,
                cache: typeCategoryCache,
                writes
            });
            updates.type_categorie_id = typeCategory.id;
            updates.type_categorie_name = typeCategory.name;
        } else if (!item.type_categorie_id || overwrite) {
            updates.type_categorie_id = null;
        }

        menuItemUpdates.push({
            id: item.id,
            updates
        });
    });

    const categoryCreates = writes.filter((write) => write.collection === CATEGORY_COLLECTION).length;
    const typeCategoryCreates = writes.filter((write) => write.collection === TYPE_CATEGORY_COLLECTION).length;

    console.log(`${CATEGORY_COLLECTION}: ${categoryCreates} creation(s) preparee(s)`);
    console.log(`${TYPE_CATEGORY_COLLECTION}: ${typeCategoryCreates} creation(s) preparee(s)`);
    console.log(`${MENU_ITEM_COLLECTION}: ${menuItemUpdates.length} mise(s) a jour preparee(s)`);
    console.log('');

    if (dryRun) {
        console.log('Aucune ecriture n a ete effectuee. Relancez avec --write pour executer la migration.');
        return;
    }

    const creationBatches = chunk(writes, BATCH_LIMIT);
    for (const currentBatch of creationBatches) {
        const batch = db.batch();
        currentBatch.forEach((write) => {
            batch.set(db.collection(write.collection).doc(write.id), write.payload, { merge: false });
        });
        await batch.commit();
    }

    const updateBatches = chunk(menuItemUpdates, BATCH_LIMIT);
    for (const currentBatch of updateBatches) {
        const batch = db.batch();
        currentBatch.forEach((item) => {
            batch.update(db.collection(MENU_ITEM_COLLECTION).doc(item.id), item.updates);
        });
        await batch.commit();
    }

    console.log('Migration terminee avec succes.');
    console.log(JSON.stringify({
        dryRun,
        overwrite,
        created_categories: categoryCreates,
        created_type_categories: typeCategoryCreates,
        updated_menu_items: menuItemUpdates.length
    }, null, 2));
};

main().catch((error) => {
    console.error('Echec migration taxonomy:', error.message);
    process.exitCode = 1;
});
