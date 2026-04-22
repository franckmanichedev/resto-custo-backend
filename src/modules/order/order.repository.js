const { db } = require('../../infrastructure/firebase/firebaseAdmin');
const {
    ORDERS,
    ORDER_ITEMS,
    ORDER_ITEM_COMPOSITIONS,
    CUSTOMERS,
    TABLES,
    TABLE_SESSIONS,
    COMPOSITIONS
} = require('../../shared/constants/collections');
const { serializeDoc, toFirestoreData } = require('../../shared/utils/firestore');

class OrderRepository {
    constructor(firestore = db) {
        this.firestore = firestore;
        this.orderCollection = firestore.collection(ORDERS);
        this.orderItemCollection = firestore.collection(ORDER_ITEMS);
        this.orderItemCompositionCollection = firestore.collection(ORDER_ITEM_COMPOSITIONS);
        this.customerCollection = firestore.collection(CUSTOMERS);
        this.tableCollection = firestore.collection(TABLES);
        this.sessionCollection = firestore.collection(TABLE_SESSIONS);
        this.compositionCollection = firestore.collection(COMPOSITIONS);
    }

    createOrderRef() {
        return this.orderCollection.doc();
    }

    createOrderItemRef() {
        return this.orderItemCollection.doc();
    }

    createOrderItemCompositionRef() {
        return this.orderItemCompositionCollection.doc();
    }

    createCustomerRef() {
        return this.customerCollection.doc();
    }

    async listOrders() {
        const snapshot = await this.orderCollection.orderBy('createdAt', 'desc').get();
        return snapshot.docs.map(serializeDoc);
    }

    async listOrdersBySession(sessionId) {
        const snapshot = await this.orderCollection.where('session_id', '==', sessionId).get();
        return snapshot.docs.map(serializeDoc);
    }

    async findOrderById(id) {
        const doc = await this.orderCollection.doc(id).get();
        return doc.exists ? serializeDoc(doc) : null;
    }

    async updateOrder(id, payload) {
        await this.orderCollection.doc(id).update(toFirestoreData(payload));
        return this.findOrderById(id);
    }

    async createOrder(id, payload) {
        const data = toFirestoreData(payload);
        await this.orderCollection.doc(id).set(data);
        return { id, ...data };
    }

    async listOrderItems(orderId) {
        const snapshot = await this.orderItemCollection.where('commande_id', '==', orderId).get();
        return snapshot.docs.map(serializeDoc);
    }

    async updateOrderItem(id, payload) {
        await this.orderItemCollection.doc(id).update(toFirestoreData(payload));
        const doc = await this.orderItemCollection.doc(id).get();
        return doc.exists ? serializeDoc(doc) : null;
    }

    async createOrderItem(id, payload) {
        const data = toFirestoreData(payload);
        await this.orderItemCollection.doc(id).set(data);
        return { id, ...data };
    }

    async listOrderItemCompositions(orderItemId) {
        const snapshot = await this.orderItemCompositionCollection.where('commande_item_id', '==', orderItemId).get();
        return snapshot.docs.map(serializeDoc);
    }

    async listOrderItemCompositionsBatch(orderItemIds) {
        const uniqueIds = [...new Set((orderItemIds || []).filter(Boolean))];
        if (!uniqueIds.length) return new Map();

        const CHUNK_SIZE = 10;
        const allDocs = [];
        for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
            const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
            const snapshot = await this.orderItemCompositionCollection.where('commande_item_id', 'in', chunk).get();
            allDocs.push(...snapshot.docs.map(serializeDoc));
        }

        const result = new Map(uniqueIds.map((id) => [id, []]));
        allDocs.forEach((doc) => {
            const list = result.get(doc.commande_item_id);
            if (list) list.push(doc);
        });
        return result;
    }

    async createOrderItemComposition(id, payload) {
        const data = toFirestoreData(payload);
        await this.orderItemCompositionCollection.doc(id).set(data);
        return { id, ...data };
    }

    async findCustomerByPhone(phone) {
        const snapshot = await this.customerCollection.where('phone', '==', phone).limit(1).get();
        return snapshot.empty ? null : serializeDoc(snapshot.docs[0]);
    }

    async findCustomerById(id) {
        const doc = await this.customerCollection.doc(id).get();
        return doc.exists ? serializeDoc(doc) : null;
    }

    async createCustomer(id, payload) {
        const data = toFirestoreData(payload);
        await this.customerCollection.doc(id).set(data);
        return { id, ...data };
    }

    async updateCustomer(id, payload) {
        await this.customerCollection.doc(id).update(toFirestoreData(payload));
        return this.findCustomerById(id);
    }

    async findTableById(id) {
        const doc = await this.tableCollection.doc(id).get();
        return doc.exists ? serializeDoc(doc) : null;
    }

    async findSessionById(id) {
        const doc = await this.sessionCollection.doc(id).get();
        return doc.exists ? serializeDoc(doc) : null;
    }

    async findCompositionsByIds(ids) {
        const uniqueIds = [...new Set((ids || []).filter(Boolean))];
        const docs = await Promise.all(uniqueIds.map((id) => this.compositionCollection.doc(id).get()));
        return docs.filter((doc) => doc.exists).map(serializeDoc);
    }
}

module.exports = OrderRepository;
