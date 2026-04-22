const { db } = require('../../infrastructure/firebase/firebaseAdmin');
const {
    TABLE_SESSIONS,
    CARTS,
    CART_ITEMS,
    CART_ITEM_COMPOSITIONS
} = require('../../shared/constants/collections');
const { serializeDoc, toFirestoreData } = require('../../shared/utils/firestore');

class SessionRepository {
    constructor(firestore = db) {
        this.sessionCollection = firestore.collection(TABLE_SESSIONS);
        this.cartCollection = firestore.collection(CARTS);
        this.cartItemCollection = firestore.collection(CART_ITEMS);
        this.cartItemCompositionCollection = firestore.collection(CART_ITEM_COMPOSITIONS);
    }

    createSessionRef() {
        return this.sessionCollection.doc();
    }

    async listSessionsByTable(tableId) {
        const snapshot = await this.sessionCollection.where('table_id', '==', tableId).get();
        return snapshot.docs.map(serializeDoc);
    }

    async findSessionById(id) {
        const doc = await this.sessionCollection.doc(id).get();
        return doc.exists ? serializeDoc(doc) : null;
    }

    async findSessionByToken(sessionToken) {
        const snapshot = await this.sessionCollection.where('session_token', '==', sessionToken).limit(1).get();
        return snapshot.empty ? null : serializeDoc(snapshot.docs[0]);
    }

    async createSession(id, payload) {
        const data = toFirestoreData(payload);
        await this.sessionCollection.doc(id).set(data);
        return { id, ...data };
    }

    async updateSession(id, payload) {
        await this.sessionCollection.doc(id).update(toFirestoreData(payload));
        return this.findSessionById(id);
    }

    createCartRef() {
        return this.cartCollection.doc();
    }

    async listCartsBySession(sessionId) {
        const snapshot = await this.cartCollection.where('table_session_id', '==', sessionId).get();
        return snapshot.docs.map(serializeDoc);
    }

    async findCartById(id) {
        const doc = await this.cartCollection.doc(id).get();
        return doc.exists ? serializeDoc(doc) : null;
    }

    async createCart(id, payload) {
        const data = toFirestoreData(payload);
        await this.cartCollection.doc(id).set(data);
        return { id, ...data };
    }

    async updateCart(id, payload) {
        await this.cartCollection.doc(id).update(toFirestoreData(payload));
        return this.findCartById(id);
    }

    createCartItemRef() {
        return this.cartItemCollection.doc();
    }

    async listCartItems(cartId) {
        const snapshot = await this.cartItemCollection.where('panier_id', '==', cartId).get();
        return snapshot.docs.map(serializeDoc);
    }

    async findCartItemById(id) {
        const doc = await this.cartItemCollection.doc(id).get();
        return doc.exists ? serializeDoc(doc) : null;
    }

    async createCartItem(id, payload) {
        const data = toFirestoreData(payload);
        await this.cartItemCollection.doc(id).set(data);
        return { id, ...data };
    }

    async updateCartItem(id, payload) {
        await this.cartItemCollection.doc(id).update(toFirestoreData(payload));
        return this.findCartItemById(id);
    }

    async deleteCartItem(id) {
        await this.cartItemCollection.doc(id).delete();
    }

    createCartItemCompositionRef() {
        return this.cartItemCompositionCollection.doc();
    }

    async listCartItemCompositions(cartItemId) {
        const snapshot = await this.cartItemCompositionCollection.where('panier_item_id', '==', cartItemId).get();
        return snapshot.docs.map(serializeDoc);
    }

    async listCartItemCompositionsBatch(cartItemIds) {
        const uniqueIds = [...new Set((cartItemIds || []).filter(Boolean))];
        if (!uniqueIds.length) return new Map();

        const CHUNK_SIZE = 10;
        const allDocs = [];
        for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
            const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
            const snapshot = await this.cartItemCompositionCollection.where('panier_item_id', 'in', chunk).get();
            allDocs.push(...snapshot.docs.map(serializeDoc));
        }

        const result = new Map(uniqueIds.map((id) => [id, []]));
        allDocs.forEach((doc) => {
            const list = result.get(doc.panier_item_id);
            if (list) list.push(doc);
        });
        return result;
    }

    async deleteCartItemCompositions(cartItemId) {
        const actions = await this.listCartItemCompositions(cartItemId);
        await Promise.all(actions.map((action) => this.cartItemCompositionCollection.doc(action.id).delete()));
    }

    async replaceCartItemCompositions(cartItemId, actions) {
        await this.deleteCartItemCompositions(cartItemId);

        for (const action of actions) {
            const actionRef = this.createCartItemCompositionRef();
            await this.cartItemCompositionCollection.doc(actionRef.id).set(toFirestoreData({
                id: actionRef.id,
                panier_item_id: cartItemId,
                composition_id: action.composition_id,
                action: action.action,
                created_at: action.created_at,
                createdAt: action.createdAt
            }));
        }
    }
}

module.exports = SessionRepository;
