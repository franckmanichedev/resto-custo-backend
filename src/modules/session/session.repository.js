const { db } = require('../../infrastructure/firebase/firebaseAdmin');
const {
    TABLE_SESSIONS,
    CARTS,
    CART_ITEMS,
    CART_ITEM_COMPOSITIONS
} = require('../../shared/constants/collections');
const { serializeDoc, toFirestoreData } = require('../../shared/utils/firestore');
const { buildScopedFirestoreQuery } = require('../../shared/utils/scopedFirestore');

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

    async listSessionsByTableScoped(tableId, scope = {}, restaurantId = null) {
        try {
            const query = buildScopedFirestoreQuery({
                collection: this.sessionCollection,
                scope: { ...scope, restaurantId },
                filters: [['table_id', '==', tableId]]
            });
            const snapshot = await query.get();
            if (snapshot.empty) return this.listSessionsByTable(tableId);
            return snapshot.docs.map(serializeDoc);
        } catch (error) {
            return this.listSessionsByTable(tableId);
        }
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

    async listCartsBySessionScoped(sessionId, scope = {}, restaurantId = null) {
        try {
            const query = buildScopedFirestoreQuery({
                collection: this.cartCollection,
                scope: { ...scope, restaurantId },
                filters: [['table_session_id', '==', sessionId]]
            });
            const snapshot = await query.get();
            if (snapshot.empty) return this.listCartsBySession(sessionId);
            return snapshot.docs.map(serializeDoc);
        } catch (error) {
            return this.listCartsBySession(sessionId);
        }
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

    async listCartItemsScoped(cartId, scope = {}, restaurantId = null) {
        try {
            const query = buildScopedFirestoreQuery({
                collection: this.cartItemCollection,
                scope: { ...scope, restaurantId },
                filters: [['panier_id', '==', cartId]]
            });
            const snapshot = await query.get();
            if (snapshot.empty) return this.listCartItems(cartId);
            return snapshot.docs.map(serializeDoc);
        } catch (error) {
            return this.listCartItems(cartId);
        }
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

    async listCartItemCompositionsScoped(cartItemId, scope = {}, restaurantId = null) {
        try {
            const query = buildScopedFirestoreQuery({
                collection: this.cartItemCompositionCollection,
                scope: { ...scope, restaurantId },
                filters: [['panier_item_id', '==', cartItemId]]
            });
            const snapshot = await query.get();
            if (snapshot.empty) return this.listCartItemCompositions(cartItemId);
            return snapshot.docs.map(serializeDoc);
        } catch (error) {
            return this.listCartItemCompositions(cartItemId);
        }
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

    async replaceCartItemCompositions(cartItemId, actions, scope = {}, restaurantId = null) {
        await this.deleteCartItemCompositions(cartItemId);

        for (const action of actions) {
            const actionRef = this.createCartItemCompositionRef();
            await this.cartItemCompositionCollection.doc(actionRef.id).set(toFirestoreData({
                id: actionRef.id,
                panier_item_id: cartItemId,
                composition_id: action.composition_id,
                action: action.action,
                organizationId: action.organizationId || scope.organizationId || null,
                branchId: action.branchId || scope.branchId || null,
                tenantId: action.tenantId || restaurantId || null,
                tenant_id: action.tenant_id || restaurantId || null,
                restaurantId: action.restaurantId || restaurantId || null,
                restaurant_id: action.restaurant_id || restaurantId || null,
                created_at: action.created_at,
                createdAt: action.createdAt
            }));
        }
    }
}

module.exports = SessionRepository;
