#!/usr/bin/env node

require('dotenv').config();

const path = require('path');
const { db } = require(path.resolve(__dirname, '../src/config/firebase'));

const SOURCE_MENU_ITEMS = 'plats';
const TARGET_MENU_ITEMS = 'menu_items';
const SOURCE_LINKS = 'plat_compositions';
const TARGET_LINKS = 'menu_item_compositions';
const BATCH_LIMIT = 400;

const args = new Set(process.argv.slice(2));
const dryRun = !args.has('--write');
const overwrite = args.has('--overwrite');

if (args.has('--help') || args.has('-h')) {
    console.log('Usage: node scripts/migrate-plats-to-menu-items.js [--write] [--overwrite]');
    console.log('');
    console.log('--write      Execute les ecritures Firestore. Sans cette option, le script reste en dry-run.');
    console.log('--overwrite  Re-ecrit les documents deja presents dans menu_items et menu_item_compositions.');
    console.log('--help       Affiche cette aide.');
    process.exit(0);
}

const nowIso = () => new Date().toISOString();

const normalizeKindFromLegacyCategory = (category) => {
    const normalized = String(category || '').trim().toLowerCase();
    return normalized === 'boisson' ? 'boisson' : 'plat';
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

const buildMenuItemPayload = (sourceDoc) => {
    const data = serializeDoc(sourceDoc);
    const kind = normalizeKindFromLegacyCategory(data.category);

    return {
        ...data,
        id: sourceDoc.id,
        kind,
        legacy_category: data.category || null,
        schema_version: 2,
        migrated_from: SOURCE_MENU_ITEMS,
        migrated_at: nowIso()
    };
};

const buildMenuItemCompositionPayload = (sourceDoc) => {
    const data = serializeDoc(sourceDoc);

    return {
        id: sourceDoc.id,
        menu_item_id: data.plat_id,
        composition_id: data.composition_id,
        sort_order: data.sort_order || 0,
        createdAt: data.createdAt || '',
        updatedAt: data.updatedAt || '',
        legacy_plat_id: data.plat_id,
        schema_version: 2,
        migrated_from: SOURCE_LINKS,
        migrated_at: nowIso()
    };
};

const ensureFirebaseReady = () => {
    if (!db) {
        throw new Error(
            'Firestore n est pas initialise. Verifiez les variables FIREBASE_* dans votre fichier .env.'
        );
    }
};

const collectExistingIds = async (collectionName) => {
    const snapshot = await db.collection(collectionName).get();
    return new Set(snapshot.docs.map((doc) => doc.id));
};

const writeDocuments = async ({ docs, targetCollection, payloadBuilder, existingTargetIds, label }) => {
    let created = 0;
    let skipped = 0;
    let overwritten = 0;
    const operations = [];

    docs.forEach((doc) => {
        const alreadyExists = existingTargetIds.has(doc.id);
        if (alreadyExists && !overwrite) {
            skipped += 1;
            return;
        }

        operations.push({
            ref: db.collection(targetCollection).doc(doc.id),
            payload: payloadBuilder(doc),
            exists: alreadyExists
        });
    });

    if (dryRun) {
        operations.forEach((operation) => {
            if (operation.exists) {
                overwritten += 1;
            } else {
                created += 1;
            }
        });

        console.log(`[DRY-RUN] ${label}: ${created} a creer, ${overwritten} a ecraser, ${skipped} ignores`);
        return { created, overwritten, skipped };
    }

    const batches = chunk(operations, BATCH_LIMIT);

    for (const currentBatch of batches) {
        const batch = db.batch();
        currentBatch.forEach((operation) => {
            batch.set(operation.ref, operation.payload, { merge: false });
        });
        await batch.commit();

        currentBatch.forEach((operation) => {
            if (operation.exists) {
                overwritten += 1;
            } else {
                created += 1;
            }
        });
    }

    console.log(`${label}: ${created} crees, ${overwritten} ecrases, ${skipped} ignores`);
    return { created, overwritten, skipped };
};

const main = async () => {
    ensureFirebaseReady();

    console.log('========================================');
    console.log('Migration Firestore plats -> menu_items');
    console.log('========================================');
    console.log(`Mode: ${dryRun ? 'DRY-RUN (aucune ecriture)' : 'WRITE (ecriture active)'}`);
    console.log(`Overwrite: ${overwrite ? 'oui' : 'non'}`);
    console.log('');

    const [platsSnapshot, linksSnapshot] = await Promise.all([
        db.collection(SOURCE_MENU_ITEMS).get(),
        db.collection(SOURCE_LINKS).get()
    ]);

    console.log(`${SOURCE_MENU_ITEMS}: ${platsSnapshot.size} document(s) source`);
    console.log(`${SOURCE_LINKS}: ${linksSnapshot.size} document(s) source`);

    const [existingMenuItemIds, existingLinkIds] = await Promise.all([
        collectExistingIds(TARGET_MENU_ITEMS),
        collectExistingIds(TARGET_LINKS)
    ]);

    console.log(`${TARGET_MENU_ITEMS}: ${existingMenuItemIds.size} document(s) deja presents`);
    console.log(`${TARGET_LINKS}: ${existingLinkIds.size} document(s) deja presents`);
    console.log('');

    const menuItemStats = await writeDocuments({
        docs: platsSnapshot.docs,
        targetCollection: TARGET_MENU_ITEMS,
        payloadBuilder: buildMenuItemPayload,
        existingTargetIds: existingMenuItemIds,
        label: `${SOURCE_MENU_ITEMS} -> ${TARGET_MENU_ITEMS}`
    });

    const linkStats = await writeDocuments({
        docs: linksSnapshot.docs,
        targetCollection: TARGET_LINKS,
        payloadBuilder: buildMenuItemCompositionPayload,
        existingTargetIds: existingLinkIds,
        label: `${SOURCE_LINKS} -> ${TARGET_LINKS}`
    });

    console.log('');
    console.log('Resume migration');
    console.log('----------------');
    console.log(
        JSON.stringify(
            {
                dryRun,
                overwrite,
                menu_items: menuItemStats,
                menu_item_compositions: linkStats
            },
            null,
            2
        )
    );
    console.log('');

    if (dryRun) {
        console.log('Aucune ecriture n a ete effectuee. Relancez avec --write pour executer la migration.');
    } else {
        console.log('Migration terminee. Les anciennes collections n ont pas ete supprimees.');
    }
};

main().catch((error) => {
    console.error('Echec migration:', error.message);
    process.exitCode = 1;
});
