const { db } = require('../../infrastructure/firebase/firebaseAdmin');
const { ORGANIZATIONS } = require('../../shared/constants/collections');
const { serializeDoc, toFirestoreData } = require('../../shared/utils/firestore');

class OrganizationsRepository {
    constructor(firestore = db) {
        this.collection = firestore.collection(ORGANIZATIONS);
    }

    createRef() {
        return this.collection.doc();
    }

    async create(id, payload) {
        const data = toFirestoreData(payload);
        await this.collection.doc(id).set(data);
        return { id, ...data };
    }

    async list(filters = {}) {
        let query = this.collection;

        if (filters.type) {
            query = query.where('type', '==', filters.type);
        }

        if (typeof filters.isActive === 'boolean') {
            query = query.where('isActive', '==', filters.isActive);
        }

        const snapshot = await query.get();
        return snapshot.docs.map(serializeDoc);
    }

    async findById(id) {
        const doc = await this.collection.doc(id).get();
        return doc.exists ? serializeDoc(doc) : null;
    }

    async findBySlug(slug) {
        const snapshot = await this.collection.where('slug', '==', slug).limit(1).get();
        return snapshot.empty ? null : serializeDoc(snapshot.docs[0]);
    }

    async update(id, payload) {
        await this.collection.doc(id).update(toFirestoreData(payload));
        return this.findById(id);
    }

    async delete(id) {
        await this.collection.doc(id).delete();
    }
}

module.exports = OrganizationsRepository;
