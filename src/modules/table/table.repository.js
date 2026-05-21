const { db } = require('../../infrastructure/firebase/firebaseAdmin');
const { TABLES } = require('../../shared/constants/collections');
const { serializeDoc, toFirestoreData } = require('../../shared/utils/firestore');
const { buildScopedFirestoreQuery } = require('../../shared/utils/scopedFirestore');

class TableRepository {
    constructor(firestore = db) {
        this.collection = firestore.collection(TABLES);
    }

    createRef() {
        return this.collection.doc();
    }

    async listAll() {
        const snapshot = await this.collection.orderBy('createdAt', 'desc').get();
        return snapshot.docs.map(serializeDoc);
    }

    async listScoped(scope = {}, restaurantId = null) {
        try {
            const query = buildScopedFirestoreQuery({
                collection: this.collection,
                scope: { ...scope, restaurantId },
                orderBy: [['createdAt', 'desc']]
            });
            const snapshot = await query.get();
            if (snapshot.empty) {
                return this.listAll();
            }
            return snapshot.docs.map(serializeDoc);
        } catch (error) {
            return this.listAll();
        }
    }

    async findById(id) {
        const doc = await this.collection.doc(id).get();
        return doc.exists ? serializeDoc(doc) : null;
    }

    async findByQrCode(qrCode) {
        const snapshot = await this.collection.where('qr_code', '==', qrCode).get();
        return snapshot.docs.map(serializeDoc);
    }

    async findByNumber(number) {
        const snapshot = await this.collection.where('number', '==', number).get();
        return snapshot.docs.map(serializeDoc);
    }

    async findByNumberScoped(number, scope = {}, restaurantId = null) {
        try {
            const query = buildScopedFirestoreQuery({
                collection: this.collection,
                scope: { ...scope, restaurantId },
                filters: [['number', '==', number]]
            });
            const snapshot = await query.get();
            if (snapshot.empty) {
                return this.findByNumber(number);
            }
            return snapshot.docs.map(serializeDoc);
        } catch (error) {
            return this.findByNumber(number);
        }
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
}

module.exports = TableRepository;
