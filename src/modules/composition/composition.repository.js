const { db } = require('../../infrastructure/firebase/firebaseAdmin');
const { COMPOSITIONS, MENU_ITEM_COMPOSITIONS } = require('../../shared/constants/collections');
const { serializeDoc, toFirestoreData } = require('../../shared/utils/firestore');

class CompositionRepository {
    constructor(firestore = db) {
        this.collection = firestore.collection(COMPOSITIONS);
        this.linkCollection = firestore.collection(MENU_ITEM_COMPOSITIONS);
    }

    createRef() {
        return this.collection.doc();
    }

    async findById(id) {
        const doc = await this.collection.doc(id).get();
        return doc.exists ? serializeDoc(doc) : null;
    }

    async listAll() {
        const snapshot = await this.collection.orderBy('name').get();
        return snapshot.docs.map(serializeDoc);
    }

    async findByNormalizedName(normalizedName) {
        const snapshot = await this.collection.where('normalized_name', '==', normalizedName).get();
        return snapshot.docs.map(serializeDoc);
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

    async hasLinkedMenuItems(compositionId) {
        const snapshot = await this.linkCollection.where('composition_id', '==', compositionId).limit(1).get();
        return !snapshot.empty;
    }
}

module.exports = CompositionRepository;
