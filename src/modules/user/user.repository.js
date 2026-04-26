const { db } = require('../../infrastructure/firebase/firebaseAdmin');
const { USERS } = require('../../shared/constants/collections');
const { serializeDoc, toFirestoreData } = require('../../shared/utils/firestore');

class UserRepository {
    constructor(firestore = db) {
        this.collection = firestore ? firestore.collection(USERS) : null;
    }

    ensureCollection() {
        if (!this.collection) {
            throw new Error('Firestore is not configured');
        }
    }

    async findById(id) {
        this.ensureCollection();
        const doc = await this.collection.doc(id).get();
        if (!doc.exists) {
            return null;
        }

        return serializeDoc(doc);
    }

    async findByEmail(email) {
        this.ensureCollection();
        const snapshot = await this.collection.where('email', '==', email).limit(1).get();
        if (snapshot.empty) {
            return null;
        }

        return serializeDoc(snapshot.docs[0]);
    }

    async findByPhoneNumber(phoneNumber) {
        this.ensureCollection();
        const snapshot = await this.collection.where('phoneNumber', '==', phoneNumber).limit(1).get();
        if (snapshot.empty) {
            return null;
        }

        return serializeDoc(snapshot.docs[0]);
    }

    async create(id, payload) {
        this.ensureCollection();
        const data = toFirestoreData(payload);
        await this.collection.doc(id).set(data);
        return { id, ...data };
    }

    async update(id, payload) {
        this.ensureCollection();
        await this.collection.doc(id).update(toFirestoreData(payload));
        return this.findById(id);
    }
}

module.exports = UserRepository;
