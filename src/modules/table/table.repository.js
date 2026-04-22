const { db } = require('../../infrastructure/firebase/firebaseAdmin');
const { TABLES } = require('../../shared/constants/collections');
const { serializeDoc, toFirestoreData } = require('../../shared/utils/firestore');

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
