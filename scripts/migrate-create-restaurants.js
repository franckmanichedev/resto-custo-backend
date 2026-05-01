#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { db, admin } = require('../src/infrastructure/firebase/firebaseAdmin');

if (!db) {
    console.error('Firestore DB not configured. Aborting.');
    process.exit(1);
}

const USERS_COL = 'users';
const RESTAURANTS_COL = 'restaurants';
const TABLES_COL = 'tables';

async function main() {
    console.log('Migration: create restaurants from users (restaurant_id)');

    const usersSnap = await db.collection(USERS_COL).get();
    console.log(`Found ${usersSnap.size} users`);

    const restaurantsMap = new Map();

    usersSnap.forEach((doc) => {
        const data = doc.data() || {};
        const restaurantId = data.restaurant_id || data.restaurantId || data.tenant_id || data.tenantId;
        if (!restaurantId) return;
        if (!restaurantsMap.has(restaurantId)) {
            restaurantsMap.set(restaurantId, {
                id: restaurantId,
                name: String(data.name || data.restaurantName || `Restaurant ${restaurantId}`).trim(),
                owner_user_id: doc.id || data.id || null,
                contact: {
                    email: data.email || null,
                    phoneNumber: data.phoneNumber || data.phone || null
                }
            });
        }
    });

    console.log(`Unique restaurant ids found: ${restaurantsMap.size}`);

    const created = [];
    const skipped = [];

    for (const [restId, info] of restaurantsMap.entries()) {
        const ref = db.collection(RESTAURANTS_COL).doc(restId);
        const snap = await ref.get();
        if (snap.exists) {
            skipped.push(restId);
            continue;
        }

        const payload = {
            id: restId,
            name: info.name || restId,
            owner_user_id: info.owner_user_id || null,
            contact: info.contact || {},
            metadata: { migratedFrom: 'users.restaurant_id', migratedAt: new Date().toISOString() },
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await ref.set(payload, { merge: true });
        created.push(restId);
        console.log(`Created restaurant ${restId}`);
    }

    // Backfill tables: ensure restaurant_id present when possible
    const tablesSnap = await db.collection(TABLES_COL).get();
    console.log(`Found ${tablesSnap.size} tables to inspect for backfill`);
    let tablesUpdated = 0;

    for (const doc of tablesSnap.docs) {
        const data = doc.data() || {};
        if (data.restaurant_id || data.restaurantId) continue;

        const candidate = data.restaurant_id || data.restaurantId || data.tenant_id || data.tenantId || null;
        // if candidate present in doc under alternative keys use it
        const alt = data.tenant_id || data.tenantId || data.restaurantId || data.restaurant_id;
        if (alt) {
            await db.collection(TABLES_COL).doc(doc.id).set({ restaurant_id: alt }, { merge: true });
            tablesUpdated += 1;
            console.log(`Backfilled table ${doc.id} -> restaurant_id=${alt}`);
        }
    }

    console.log('Migration summary:');
    console.log(`  restaurants created: ${created.length}`);
    console.log(`  restaurants skipped (already exist): ${skipped.length}`);
    console.log(`  tables backfilled: ${tablesUpdated}`);

    console.log('Done. Review created documents in Firestore and run tests as needed.');
}

main().then(() => process.exit(0)).catch((err) => {
    console.error('Migration failed', err);
    process.exit(2);
});
