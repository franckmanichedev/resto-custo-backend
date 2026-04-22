const { db } = require('../../infrastructure/firebase/firebaseAdmin');
const { MENU_ITEMS, MENU_ITEM_COMPOSITIONS } = require('../../shared/constants/collections');
const { serializeDoc, toFirestoreData } = require('../../shared/utils/firestore');

class PlatRepository {
    constructor(firestore = db) {
        this.collection = firestore.collection(MENU_ITEMS);
        this.linkCollection = firestore.collection(MENU_ITEM_COMPOSITIONS);
        this.firestore = firestore;
    }

    createRef() {
        return this.collection.doc();
    }

    createLinkRef() {
        return this.linkCollection.doc();
    }

    async listAll() {
        const snapshot = await this.collection.orderBy('createdAt', 'desc').get();
        return snapshot.docs.map(serializeDoc);
    }

    async findById(id) {
        const doc = await this.collection.doc(id).get();
        return doc.exists ? serializeDoc(doc) : null;
    }

    async create(id, payload) {
        const data = toFirestoreData(payload);
        await this.collection.doc(id).set(data);
        return { id, ...data };
    }

    async update(id, payload) {
        await this.collection.doc(id).update(toFirestoreData(payload));
        return this.findById(id);
    }

    async delete(id) {
        await this.collection.doc(id).delete();
    }

    async listCompositionLinks(menuItemId) {
        const snapshot = await this.linkCollection.where('menu_item_id', '==', menuItemId).get();
        return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    }

    async replaceCompositionLinks(menuItemId, compositionIds) {
        const existingLinks = await this.listCompositionLinks(menuItemId);
        const batch = this.firestore.batch();

        existingLinks.forEach((link) => {
            batch.delete(this.linkCollection.doc(link.id));
        });

        const now = new Date().toISOString();
        compositionIds.forEach((compositionId, index) => {
            const linkRef = this.createLinkRef();
            batch.set(linkRef, toFirestoreData({
                id: linkRef.id,
                menu_item_id: menuItemId,
                composition_id: compositionId,
                sort_order: index,
                createdAt: now,
                updatedAt: now
            }));
        });

        await batch.commit();
    }

    async deleteWithLinks(id) {
        const batch = this.firestore.batch();
        batch.delete(this.collection.doc(id));

        const links = await this.listCompositionLinks(id);
        links.forEach((link) => {
            batch.delete(this.linkCollection.doc(link.id));
        });

        await batch.commit();
    }
}

module.exports = PlatRepository;
