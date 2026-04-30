// Script to add tenant/restaurant id fields to existing documents that lack them.
// Usage:
//   Real migration (requires Firebase env):
//     node scripts/migrate-add-tenant.js <TENANT_ID>
//   Preview migration from an export JSON (no Firebase required):
//     node scripts/migrate-add-tenant.js --preview path/to/export.json <TENANT_ID>

const fs = require('fs');
const path = require('path');
const COLLECTIONS = require('../src/shared/constants/collections');

const args = process.argv.slice(2);
let previewFile = null;
let tenantId = null;

if (args[0] === '--preview') {
    previewFile = args[1];
    tenantId = args[2] || process.env.TENANT_ID;
} else {
    tenantId = args[0] || process.env.TENANT_ID;
}

if (!tenantId) {
    console.error('Usage: node scripts/migrate-add-tenant.js <TENANT_ID>');
    console.error('   or: node scripts/migrate-add-tenant.js --preview export.json <TENANT_ID>');
    process.exit(1);
}

const targetCollections = [
    COLLECTIONS.MENU_ITEMS,
    COLLECTIONS.COMPOSITIONS,
    COLLECTIONS.CATEGORIES,
    COLLECTIONS.TYPE_CATEGORIES,
    COLLECTIONS.TABLES,
    COLLECTIONS.ORDERS,
    COLLECTIONS.MENU_ITEM_COMPOSITIONS,
    COLLECTIONS.ORDER_ITEMS,
    COLLECTIONS.ORDER_ITEM_COMPOSITIONS,
    COLLECTIONS.CARTS,
    COLLECTIONS.CART_ITEMS,
    COLLECTIONS.CART_ITEM_COMPOSITIONS
].filter(Boolean);

const addTenantFieldsToObject = (obj, tenantId) => {
    const updated = { ...obj };
    if (!updated.tenant_id && !updated.tenantId && !updated.restaurant_id && !updated.restaurantId) {
        updated.tenant_id = tenantId;
        updated.tenantId = tenantId;
        updated.restaurant_id = tenantId;
        updated.restaurantId = tenantId;
        updated.updatedAt = new Date().toISOString();
        return { changed: true, doc: updated };
    }
    return { changed: false, doc: updated };
};

// Load .env for real migration mode
try {
    require('dotenv').config();
} catch (e) {
    // ignore if dotenv not available
}

(async () => {
    console.log('Migration mode:', previewFile ? 'preview' : 'real');
    console.log('TenantId:', tenantId);

    if (previewFile) {
        // Read export JSON and simulate updates
        const fullPath = path.resolve(previewFile);
        if (!fs.existsSync(fullPath)) {
            console.error('Preview file not found:', fullPath);
            process.exit(2);
        }

        let content;
        try {
            content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        } catch (err) {
            console.error('Failed to parse preview JSON:', err.message);
            process.exit(2);
        }

        for (const colName of targetCollections) {
            const docs = content[colName] || [];
            let wouldUpdate = 0;
            for (const doc of docs) {
                const { changed } = addTenantFieldsToObject(doc, tenantId);
                if (changed) wouldUpdate += 1;
            }
            console.log(`Collection ${colName}: ${wouldUpdate} documents would be updated (out of ${docs.length})`);
        }

        console.log('Preview complete');
        process.exit(0);
    }

    // Real migration: load firebase lazily
    let db = null;
    try {
        const firebaseAdmin = require('../src/infrastructure/firebase/firebaseAdmin');
        db = firebaseAdmin.db;
    } catch (err) {
        console.error('Firebase not configured or failed to load:', err.message);
        console.error('Set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY and FIREBASE_CLIENT_EMAIL and retry');
        process.exit(2);
    }

    try {
        console.log('Starting migration: adding tenant fields ->', tenantId);

        for (const colName of targetCollections) {
            console.log(`Processing collection: ${colName}`);
            const snapshot = await db.collection(colName).get();
            let updated = 0;

            for (const doc of snapshot.docs) {
                const data = doc.data() || {};
                if (!data.tenant_id && !data.tenantId && !data.restaurant_id && !data.restaurantId) {
                    await doc.ref.update({
                        tenant_id: tenantId,
                        tenantId: tenantId,
                        restaurant_id: tenantId,
                        restaurantId: tenantId,
                        updatedAt: new Date().toISOString()
                    });
                    updated += 1;
                }
            }

            console.log(`Updated ${updated} documents in ${colName}`);
        }

        console.log('Migration complete');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed', err);
        process.exit(2);
    }
})();
