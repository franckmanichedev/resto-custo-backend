const crypto = require('crypto');
const { db } = require('../config/firebase');
const logger = require('../utils/logger');

const TABLE_COLLECTION = 'tables';
const TABLE_SESSION_COLLECTION = 'table_sessions';
const PLAT_COLLECTION = 'plats';
const PLAT_COMPOSITION_COLLECTION = 'plat_compositions';
const COMPOSITION_COLLECTION = 'compositions';
const CUSTOMER_COLLECTION = 'customers';
const ORDER_COLLECTION = 'commandes';
const ORDER_ITEM_COLLECTION = 'commande_items';
const ORDER_ITEM_COMPOSITION_COLLECTION = 'commande_item_compositions';
const CART_COLLECTION = 'paniers';
const CART_ITEM_COLLECTION = 'panier_items';
const CART_ITEM_COMPOSITION_COLLECTION = 'panier_item_compositions';
const ACTIVE_ORDER_STATUSES = ['pending', 'preparing'];

const WEEK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const SESSION_DURATION_MINUTES = 60;

const serializeDoc = (doc) => ({
    id: doc.id,
    ...doc.data()
});

const getCurrentWeekDay = () => {
    const formatter = new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        timeZone: process.env.APP_TIMEZONE || 'Africa/Douala'
    });

    return formatter.format(new Date()).toLowerCase();
};

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const isPlatAvailableForDay = (plat, day) => {
    if (plat.is_available === false) {
        return false;
    }

    if ((plat.availability_mode || 'everyday') !== 'selected_days') {
        return true;
    }

    return Array.isArray(plat.available_days) && plat.available_days.includes(day);
};

const getPlatAvailableDays = (plat) => {
    if ((plat.availability_mode || 'everyday') !== 'selected_days') {
        return [...WEEK_DAYS];
    }

    return Array.isArray(plat.available_days) ? plat.available_days : [];
};

const getSessionExpirationDate = () => new Date(Date.now() + SESSION_DURATION_MINUTES * 60 * 1000);

const getRemainingSeconds = (targetDate) => {
    const diff = new Date(targetDate).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 1000));
};

const buildSessionPayload = (session) => ({
    id: session.id,
    table_id: session.table_id,
    session_token: session.session_token,
    created_at: session.created_at,
    expires_at: session.expires_at,
    refreshed_at: session.refreshed_at || null,
    was_extended: Boolean(session.refreshed_at),
    remaining_seconds: getRemainingSeconds(session.expires_at)
});

const getCompositionMap = async (compositionIds) => {
    const uniqueIds = [...new Set((compositionIds || []).filter(Boolean))];
    if (!uniqueIds.length) {
        return new Map();
    }

    const compositionDocs = await Promise.all(
        uniqueIds.map((compositionId) => db.collection(COMPOSITION_COLLECTION).doc(compositionId).get())
    );

    return new Map(
        compositionDocs
            .filter((doc) => doc.exists)
            .map((doc) => [doc.id, serializeDoc(doc)])
    );
};

const buildPreparationState = ({ status, estimatedReadyAt, preparationStartedAt, prepTime = 0 }) => {
    const preparationTotalMinutes = Math.max(0, Number(prepTime || 0));
    const preparationTotalSeconds = preparationTotalMinutes * 60;
    const countdownActive = status === 'preparing' && Boolean(estimatedReadyAt);

    return {
        preparation_started_at: preparationStartedAt || null,
        preparation_total_minutes: preparationTotalMinutes,
        preparation_total_seconds: preparationTotalSeconds,
        estimated_ready_at: estimatedReadyAt || null,
        countdown_active: countdownActive,
        remaining_seconds: countdownActive
            ? getRemainingSeconds(estimatedReadyAt)
            : status === 'served'
                ? 0
                : null
    };
};

const validateRequestedDay = (day) => {
    if (!day) {
        return getCurrentWeekDay();
    }

    const normalized = String(day).trim().toLowerCase();
    if (!WEEK_DAYS.includes(normalized)) {
        const error = new Error('Jour invalide');
        error.status = 400;
        throw error;
    }

    return normalized;
};

const getPlatCompositions = async (platId) => {
    const linksSnap = await db
        .collection(PLAT_COMPOSITION_COLLECTION)
        .where('plat_id', '==', platId)
        .get();

    if (linksSnap.empty) {
        return [];
    }

    const compositionIds = linksSnap.docs
        .map((doc) => doc.data())
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .map((link) => link.composition_id);

    const compositionDocs = await Promise.all(
        compositionIds.map((compositionId) => db.collection(COMPOSITION_COLLECTION).doc(compositionId).get())
    );

    const compositionMap = new Map(
        compositionDocs
            .filter((doc) => doc.exists)
            .map((doc) => [doc.id, serializeDoc(doc)])
    );

    return compositionIds.map((compositionId) => compositionMap.get(compositionId)).filter(Boolean);
};

const buildPlatResponse = async (platDoc, currentDay, requestedDay = currentDay) => {
    const data = serializeDoc(platDoc);
    const compositions = await getPlatCompositions(platDoc.id);

    return {
        ...data,
        is_available: data.is_available !== false,
        availability_mode: data.availability_mode || 'everyday',
        available_days: Array.isArray(data.available_days) ? data.available_days : [],
        consultable_days: getPlatAvailableDays(data),
        is_orderable_today: isPlatAvailableForDay(data, currentDay),
        is_visible_for_requested_day: isPlatAvailableForDay(data, requestedDay),
        compositions
    };
};

const getConsultableDaysFromPlats = (plats) => {
    const days = new Set();
    plats.forEach((plat) => {
        getPlatAvailableDays(plat).forEach((day) => days.add(day));
    });
    return WEEK_DAYS.filter((day) => days.has(day));
};

const getTableByInput = async ({ table_id, qr_code }) => {
    if (isNonEmptyString(table_id)) {
        const doc = await db.collection(TABLE_COLLECTION).doc(table_id.trim()).get();
        if (doc.exists) {
            return serializeDoc(doc);
        }
    }

    if (isNonEmptyString(qr_code)) {
        const snap = await db
            .collection(TABLE_COLLECTION)
            .where('qr_code', '==', qr_code.trim())
            .limit(1)
            .get();

        if (!snap.empty) {
            return serializeDoc(snap.docs[0]);
        }
    }

    return null;
};

const getLatestActiveSessionForTable = async (tableId) => {
    const snap = await db
        .collection(TABLE_SESSION_COLLECTION)
        .where('table_id', '==', tableId)
        .get();

    const sortedSessions = snap.docs
        .map(serializeDoc)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    for (const session of sortedSessions) {
        try {
            return await maybeExtendSessionForActiveOrders(session);
        } catch (error) {
            if (error.status !== 410) {
                throw error;
            }
        }
    }

    return null;
};

const getLatestActiveOrderForSession = async (sessionId) => {
    const snap = await db
        .collection(ORDER_COLLECTION)
        .where('session_id', '==', sessionId)
        .get();

    const activeOrders = snap.docs
        .map(serializeDoc)
        .filter((order) => ACTIVE_ORDER_STATUSES.includes(order.status))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return activeOrders[0] || null;
};

const maybeExtendSessionForActiveOrders = async (sessionDocOrData) => {
    const session = typeof sessionDocOrData.data === 'function'
        ? serializeDoc(sessionDocOrData)
        : sessionDocOrData;

    const expiresAt = new Date(session.expires_at).getTime();
    if (expiresAt > Date.now()) {
        return session;
    }

    const activeOrder = await getLatestActiveOrderForSession(session.id);
    if (!activeOrder) {
        const error = new Error('La session de table a expire');
        error.status = 410;
        throw error;
    }

    const refreshedExpiresAt = getSessionExpirationDate().toISOString();
    await db.collection(TABLE_SESSION_COLLECTION).doc(session.id).update({
        expires_at: refreshedExpiresAt,
        refreshed_at: new Date().toISOString()
    });

    return {
        ...session,
        expires_at: refreshedExpiresAt,
        refreshed_at: new Date().toISOString()
    };
};

const getValidatedSession = async (sessionToken) => {
    if (!isNonEmptyString(sessionToken)) {
        const error = new Error('session_token est requis');
        error.status = 400;
        throw error;
    }

    const snap = await db
        .collection(TABLE_SESSION_COLLECTION)
        .where('session_token', '==', sessionToken.trim())
        .limit(1)
        .get();

    if (snap.empty) {
        const error = new Error('Session de table introuvable');
        error.status = 404;
        throw error;
    }

    return maybeExtendSessionForActiveOrders(snap.docs[0]);
};

const getOrCreateActiveCartForSession = async (session) => {
    const snap = await db
        .collection(CART_COLLECTION)
        .where('table_session_id', '==', session.id)
        .get();

    const existingCart = snap.docs
        .map(serializeDoc)
        .find((cart) => cart.status === 'active');

    if (existingCart) {
        return existingCart;
    }

    const now = new Date().toISOString();
    const cartRef = db.collection(CART_COLLECTION).doc();
    const cart = {
        id: cartRef.id,
        table_session_id: session.id,
        table_id: session.table_id,
        status: 'active',
        created_at: now,
        updated_at: now,
        createdAt: now,
        updatedAt: now
    };

    await cartRef.set(cart);
    return cart;
};

const buildCartSummary = async (cart) => {
    if (!cart) {
        return null;
    }

    const itemsSnap = await db.collection(CART_ITEM_COLLECTION).where('panier_id', '==', cart.id).get();
    const itemDocs = itemsSnap.docs.map(serializeDoc);
    const actionSnaps = await Promise.all(
        itemDocs.map((item) =>
            db.collection(CART_ITEM_COMPOSITION_COLLECTION)
                .where('panier_item_id', '==', item.id)
                .get()
        )
    );
    const compositionMap = await getCompositionMap(
        actionSnaps.flatMap((snap) => snap.docs.map((doc) => doc.data().composition_id))
    );

    const items = await Promise.all(itemsSnap.docs.map(async (doc) => {
        const item = serializeDoc(doc);
        const actionsSnap = actionSnaps[itemDocs.findIndex((entry) => entry.id === item.id)];

        return {
            ...item,
            total_price: (item.plat_price || 0) * (item.quantity || 0),
            compositions: actionsSnap.docs.map((actionDoc) => {
                const action = serializeDoc(actionDoc);
                return {
                    ...action,
                    composition_name: compositionMap.get(action.composition_id)?.name || action.composition_id
                };
            })
        };
    }));

    return {
        ...cart,
        items,
        total_items: items.reduce((sum, item) => sum + (item.quantity || 0), 0),
        total_price: items.reduce((sum, item) => sum + (item.total_price || 0), 0)
    };
};

const getMenuPayloadForSession = async (session, requestedDay) => {
    const currentDay = getCurrentWeekDay();
    const day = validateRequestedDay(requestedDay);
    const tableDoc = await db.collection(TABLE_COLLECTION).doc(session.table_id).get();

    if (!tableDoc.exists) {
        const error = new Error('Table introuvable');
        error.status = 404;
        throw error;
    }

    const snapshot = await db.collection(PLAT_COLLECTION).orderBy('createdAt', 'desc').get();
    const rawPlats = snapshot.docs.map((doc) => serializeDoc(doc)).filter((plat) => plat.is_available !== false);
    const consultableDays = getConsultableDaysFromPlats(rawPlats);
    const cart = await getOrCreateActiveCartForSession(session);
    const cartSummary = await buildCartSummary(cart);
    const orders = await listSessionOrdersSummary(session.id);

    const plats = await Promise.all(
        snapshot.docs
            .filter((doc) => isPlatAvailableForDay(doc.data(), day))
            .map((doc) => buildPlatResponse(doc, currentDay, day))
    );

    return {
        table: serializeDoc(tableDoc),
        session: buildSessionPayload(session),
        current_day: currentDay,
        requested_day: day,
        can_order: day === currentDay,
        consultable_days: consultableDays,
        plats,
        cart: cartSummary,
        orders
    };
};

const ensureCustomer = async ({ name, phone }) => {
    if (!isNonEmptyString(name) || !isNonEmptyString(phone)) {
        const error = new Error('Le nom et le numero de telephone du client sont requis');
        error.status = 400;
        throw error;
    }

    const cleanPhone = phone.trim();
    const snap = await db.collection(CUSTOMER_COLLECTION).where('phone', '==', cleanPhone).limit(1).get();

    if (!snap.empty) {
        const existing = snap.docs[0];
        const existingData = existing.data();
        if (existingData.name !== name.trim()) {
            await existing.ref.update({ name: name.trim() });
        }
        return serializeDoc(await existing.ref.get());
    }

    const now = new Date().toISOString();
    const customerRef = db.collection(CUSTOMER_COLLECTION).doc();
    const customer = {
        id: customerRef.id,
        name: name.trim(),
        phone: cleanPhone,
        created_at: now,
        createdAt: now
    };

    await customerRef.set(customer);
    return customer;
};

const validateOrderPayload = (payload) => {
    if (!payload || typeof payload !== 'object') {
        const error = new Error('Le corps de la requete doit etre un objet JSON');
        error.status = 400;
        throw error;
    }

    if (!isNonEmptyString(payload.session_token)) {
        const error = new Error('session_token est requis');
        error.status = 400;
        throw error;
    }

    if (!payload.customer || typeof payload.customer !== 'object') {
        const error = new Error('Les informations du client sont requises');
        error.status = 400;
        throw error;
    }

    if (!isNonEmptyString(payload.customer.name) || !isNonEmptyString(payload.customer.phone)) {
        const error = new Error('Le nom et le numero de telephone du client sont requis');
        error.status = 400;
        throw error;
    }

    if (!Array.isArray(payload.items) || payload.items.length === 0) {
        const error = new Error('Au moins un plat doit etre commande');
        error.status = 400;
        throw error;
    }
};

const getOrderSummary = async (orderId) => {
    const orderDoc = await db.collection(ORDER_COLLECTION).doc(orderId).get();
    if (!orderDoc.exists) {
        const error = new Error('Commande introuvable');
        error.status = 404;
        throw error;
    }

    const order = serializeDoc(orderDoc);
    const customerDoc = await db.collection(CUSTOMER_COLLECTION).doc(order.client_id).get();
    const customer = customerDoc.exists ? serializeDoc(customerDoc) : null;

    const itemsSnap = await db
        .collection(ORDER_ITEM_COLLECTION)
        .where('commande_id', '==', orderId)
        .get();

    const itemDocs = itemsSnap.docs.map(serializeDoc);

    const actionSnaps = await Promise.all(
        itemDocs.map((item) =>
            db.collection(ORDER_ITEM_COMPOSITION_COLLECTION).where('commande_item_id', '==', item.id).get()
        )
    );

    const actionsByItemId = new Map();
    actionSnaps.forEach((snap, index) => {
        actionsByItemId.set(itemDocs[index].id, snap.docs.map(serializeDoc));
    });

    const allCompositionIds = [...new Set(
        actionSnaps.flatMap((snap) => snap.docs.map((doc) => doc.data().composition_id)).filter(Boolean)
    )];
    const compositionMap = await getCompositionMap(allCompositionIds);

    const items = itemDocs.map((item) => {
        const timing = buildPreparationState({
            status: order.status,
            estimatedReadyAt: item.estimated_ready_at,
            preparationStartedAt: item.preparation_started_at || order.preparation_started_at,
            prepTime: item.prep_time
        });

        return {
            ...item,
            total_price: (item.plat_price || 0) * (item.quantity || 0),
            ...timing,
            compositions: (actionsByItemId.get(item.id) || []).map((action) => ({
                ...action,
                composition_name: compositionMap.get(action.composition_id)?.name || action.composition_id
            }))
        };
    });

    const activeEstimatedReadyAt = items
        .map((item) => item.estimated_ready_at)
        .filter(Boolean)
        .reduce((max, value) => {
            const timestamp = new Date(value).getTime();
            return timestamp > max ? timestamp : max;
        }, 0);

    const orderTiming = buildPreparationState({
        status: order.status,
        estimatedReadyAt: activeEstimatedReadyAt ? new Date(activeEstimatedReadyAt).toISOString() : null,
        preparationStartedAt: order.preparation_started_at,
        prepTime: Math.max(...items.map((item) => item.preparation_total_minutes || 0), 0)
    });

    const sessionDoc = order.session_id
        ? await db.collection(TABLE_SESSION_COLLECTION).doc(order.session_id).get()
        : null;
    const session = sessionDoc?.exists ? serializeDoc(sessionDoc) : null;

    return {
        ...order,
        customer,
        session: session ? buildSessionPayload(session) : null,
        items,
        total_price: items.reduce((sum, item) => sum + (item.total_price || 0), 0),
        ...orderTiming
    };
};

const listSessionOrdersSummary = async (sessionId) => {
    const snap = await db.collection(ORDER_COLLECTION).where('session_id', '==', sessionId).get();
    const orders = await Promise.all(
        snap.docs
            .map(serializeDoc)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .map((order) => getOrderSummary(order.id))
    );

    return orders;
};

const createOrderFromNormalizedItems = async ({ session, customer, note, normalizedItems, sourceCartId = null }) => {
    const now = new Date().toISOString();
    const orderRef = db.collection(ORDER_COLLECTION).doc();
    const order = {
        id: orderRef.id,
        session_id: session.id,
        session_token: session.session_token,
        table_id: session.table_id,
        client_id: customer.id,
        plat_id: normalizedItems[0]?.plat.id || null,
        status: 'pending',
        note: isNonEmptyString(note) ? note.trim() : '',
        source_cart_id: sourceCartId,
        created_at: now,
        createdAt: now
    };

    await orderRef.set(order);

    for (const item of normalizedItems) {
        const itemRef = db.collection(ORDER_ITEM_COLLECTION).doc();
        const orderItem = {
            id: itemRef.id,
            commande_id: order.id,
            plat_id: item.plat.id,
            quantity: item.quantity,
            plat_name: item.plat.name,
            plat_price: item.plat.price,
            prep_time: item.plat.prep_time,
            estimated_ready_at: null,
            preparation_started_at: null,
            created_at: now,
            createdAt: now
        };

        await itemRef.set(orderItem);

        for (const action of item.composition_actions) {
            const actionRef = db.collection(ORDER_ITEM_COMPOSITION_COLLECTION).doc();
            await actionRef.set({
                id: actionRef.id,
                commande_item_id: itemRef.id,
                composition_id: action.composition_id,
                action: action.action,
                created_at: now,
                createdAt: now
            });
        }
    }

    return getOrderSummary(order.id);
};

exports.startTableSession = async (req, res) => {
    try {
        const table = await getTableByInput(req.body || {});

        if (!table || table.is_active === false) {
            return res.status(404).json({
                success: false,
                message: 'Table introuvable ou inactive'
            });
        }

        const existingSession = await getLatestActiveSessionForTable(table.id);
        if (existingSession) {
            const payload = await getMenuPayloadForSession(existingSession, getCurrentWeekDay());
            return res.status(200).json({
                success: true,
                message: 'Session de table existante reutilisee',
                data: payload
            });
        }

        const now = new Date().toISOString();
        const expiresAt = getSessionExpirationDate().toISOString();
        const sessionRef = db.collection(TABLE_SESSION_COLLECTION).doc();
        const session = {
            id: sessionRef.id,
            table_id: table.id,
            session_token: crypto.randomBytes(24).toString('hex'),
            expires_at: expiresAt,
            created_at: now,
            createdAt: now
        };

        await sessionRef.set(session);

        const payload = await getMenuPayloadForSession(session, getCurrentWeekDay());

        return res.status(201).json({
            success: true,
            message: 'Session de table creee avec succes',
            data: payload
        });
    } catch (error) {
        logger.error('startTableSession error', { error: error.message });
        return res.status(error.status || 500).json({
            success: false,
            message: 'Erreur lors de la creation de la session de table',
            error: error.message
        });
    }
};

exports.getSessionMenu = async (req, res) => {
    try {
        const session = await getValidatedSession(req.params.sessionToken);
        const payload = await getMenuPayloadForSession(session, req.query.day);

        return res.status(200).json({
            success: true,
            data: payload
        });
    } catch (error) {
        logger.error('getSessionMenu error', { error: error.message, sessionToken: req.params.sessionToken });
        return res.status(error.status || 500).json({
            success: false,
            message: 'Erreur lors de la recuperation du menu de session',
            error: error.message
        });
    }
};

exports.getPlatDetail = async (req, res) => {
    try {
        const session = await getValidatedSession(req.query.session_token);
        const currentDay = getCurrentWeekDay();
        const requestedDay = validateRequestedDay(req.query.day || currentDay);
        const platDoc = await db.collection(PLAT_COLLECTION).doc(req.params.id).get();

        if (!platDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Plat introuvable'
            });
        }

        const tableDoc = await db.collection(TABLE_COLLECTION).doc(session.table_id).get();

        return res.status(200).json({
            success: true,
            data: {
                table: tableDoc.exists ? serializeDoc(tableDoc) : null,
                session: buildSessionPayload(session),
                current_day: currentDay,
                requested_day: requestedDay,
                plat: await buildPlatResponse(platDoc, currentDay, requestedDay)
            }
        });
    } catch (error) {
        logger.error('getPlatDetail error', { error: error.message, id: req.params.id });
        return res.status(error.status || 500).json({
            success: false,
            message: 'Erreur lors de la recuperation du detail du plat',
            error: error.message
        });
    }
};

exports.getCart = async (req, res) => {
    try {
        const session = await getValidatedSession(req.params.sessionToken);
        const cart = await getOrCreateActiveCartForSession(session);
        const summary = await buildCartSummary(cart);
        const orders = await listSessionOrdersSummary(session.id);

        return res.status(200).json({
            success: true,
            data: {
                session: buildSessionPayload(session),
                cart: summary,
                orders
            }
        });
    } catch (error) {
        logger.error('getCart error', { error: error.message, sessionToken: req.params.sessionToken });
        return res.status(error.status || 500).json({
            success: false,
            message: 'Erreur lors de la recuperation du panier',
            error: error.message
        });
    }
};

exports.addCartItem = async (req, res) => {
    try {
        const session = await getValidatedSession(req.body.session_token);
        const currentDay = getCurrentWeekDay();

        if (!isNonEmptyString(req.body.plat_id) || typeof req.body.quantity !== 'number' || req.body.quantity < 1) {
            return res.status(400).json({
                success: false,
                message: 'plat_id et quantity >= 1 sont requis'
            });
        }

        const platDoc = await db.collection(PLAT_COLLECTION).doc(req.body.plat_id.trim()).get();
        if (!platDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Plat introuvable'
            });
        }

        const plat = serializeDoc(platDoc);
        if (!isPlatAvailableForDay(plat, currentDay)) {
            return res.status(400).json({
                success: false,
                message: 'Ce plat n est pas commandable aujourd hui'
            });
        }

        const cart = await getOrCreateActiveCartForSession(session);
        const now = new Date().toISOString();
        const itemRef = db.collection(CART_ITEM_COLLECTION).doc();
        const item = {
            id: itemRef.id,
            panier_id: cart.id,
            plat_id: plat.id,
            plat_name: plat.name,
            plat_price: plat.price,
            quantity: req.body.quantity,
            created_at: now,
            updated_at: now,
            createdAt: now,
            updatedAt: now
        };

        await itemRef.set(item);

        const compositionActions = Array.isArray(req.body.composition_actions) ? req.body.composition_actions : [];
        for (const action of compositionActions) {
            if (!isNonEmptyString(action.composition_id) || !isNonEmptyString(action.action)) {
                continue;
            }

            const actionRef = db.collection(CART_ITEM_COMPOSITION_COLLECTION).doc();
            await actionRef.set({
                id: actionRef.id,
                panier_item_id: item.id,
                composition_id: action.composition_id.trim(),
                action: action.action.trim().toLowerCase(),
                created_at: now,
                createdAt: now
            });
        }

        await db.collection(CART_COLLECTION).doc(cart.id).update({
            updated_at: now,
            updatedAt: now
        });

        return res.status(201).json({
            success: true,
            message: 'Plat ajoute au panier',
            data: {
                cart: await buildCartSummary(await getOrCreateActiveCartForSession(session))
            }
        });
    } catch (error) {
        logger.error('addCartItem error', { error: error.message });
        return res.status(error.status || 500).json({
            success: false,
            message: 'Erreur lors de l ajout au panier',
            error: error.message
        });
    }
};

exports.updateCartItem = async (req, res) => {
    try {
        const session = await getValidatedSession(req.body.session_token);
        const cart = await getOrCreateActiveCartForSession(session);
        const itemRef = db.collection(CART_ITEM_COLLECTION).doc(req.params.itemId);
        const itemDoc = await itemRef.get();

        if (!itemDoc.exists || itemDoc.data().panier_id !== cart.id) {
            return res.status(404).json({
                success: false,
                message: 'Element de panier introuvable'
            });
        }

        const quantity = typeof req.body.quantity === 'number' ? req.body.quantity : itemDoc.data().quantity;
        if (quantity < 1) {
            return res.status(400).json({
                success: false,
                message: 'quantity doit etre >= 1'
            });
        }

        const now = new Date().toISOString();
        await itemRef.update({
            quantity,
            updated_at: now,
            updatedAt: now
        });

        const existingActions = await db
            .collection(CART_ITEM_COMPOSITION_COLLECTION)
            .where('panier_item_id', '==', req.params.itemId)
            .get();
        for (const doc of existingActions.docs) {
            await doc.ref.delete();
        }

        const compositionActions = Array.isArray(req.body.composition_actions) ? req.body.composition_actions : [];
        for (const action of compositionActions) {
            if (!isNonEmptyString(action.composition_id) || !isNonEmptyString(action.action)) {
                continue;
            }

            const actionRef = db.collection(CART_ITEM_COMPOSITION_COLLECTION).doc();
            await actionRef.set({
                id: actionRef.id,
                panier_item_id: req.params.itemId,
                composition_id: action.composition_id.trim(),
                action: action.action.trim().toLowerCase(),
                created_at: now,
                createdAt: now
            });
        }

        await db.collection(CART_COLLECTION).doc(cart.id).update({
            updated_at: now,
            updatedAt: now
        });

        return res.status(200).json({
            success: true,
            message: 'Element du panier mis a jour',
            data: {
                cart: await buildCartSummary(cart)
            }
        });
    } catch (error) {
        logger.error('updateCartItem error', { error: error.message, itemId: req.params.itemId });
        return res.status(error.status || 500).json({
            success: false,
            message: 'Erreur lors de la mise a jour du panier',
            error: error.message
        });
    }
};

exports.removeCartItem = async (req, res) => {
    try {
        const session = await getValidatedSession(req.query.session_token);
        const cart = await getOrCreateActiveCartForSession(session);
        const itemRef = db.collection(CART_ITEM_COLLECTION).doc(req.params.itemId);
        const itemDoc = await itemRef.get();

        if (!itemDoc.exists || itemDoc.data().panier_id !== cart.id) {
            return res.status(404).json({
                success: false,
                message: 'Element de panier introuvable'
            });
        }

        const actionsSnap = await db
            .collection(CART_ITEM_COMPOSITION_COLLECTION)
            .where('panier_item_id', '==', req.params.itemId)
            .get();
        for (const doc of actionsSnap.docs) {
            await doc.ref.delete();
        }

        await itemRef.delete();

        return res.status(200).json({
            success: true,
            message: 'Element retire du panier',
            data: {
                cart: await buildCartSummary(cart)
            }
        });
    } catch (error) {
        logger.error('removeCartItem error', { error: error.message, itemId: req.params.itemId });
        return res.status(error.status || 500).json({
            success: false,
            message: 'Erreur lors de la suppression de l element du panier',
            error: error.message
        });
    }
};

exports.createOrder = async (req, res) => {
    try {
        validateOrderPayload(req.body);

        const session = await getValidatedSession(req.body.session_token);
        const currentDay = getCurrentWeekDay();
        const customer = await ensureCustomer(req.body.customer);

        const normalizedItems = [];

        for (const item of req.body.items) {
            if (!isNonEmptyString(item.plat_id) || typeof item.quantity !== 'number' || item.quantity < 1) {
                return res.status(400).json({
                    success: false,
                    message: 'Chaque item doit contenir plat_id et quantity >= 1'
                });
            }

            const platDoc = await db.collection(PLAT_COLLECTION).doc(item.plat_id.trim()).get();
            if (!platDoc.exists) {
                return res.status(404).json({
                    success: false,
                    message: `Plat introuvable: ${item.plat_id}`
                });
            }

            const plat = serializeDoc(platDoc);
            if (!isPlatAvailableForDay(plat, currentDay)) {
                return res.status(400).json({
                    success: false,
                    message: `Le plat ${plat.name} n est pas commandable aujourd hui`
                });
            }

            const platCompositions = await getPlatCompositions(plat.id);
            const compositionIds = new Set(platCompositions.map((composition) => composition.id));
            const compositionActions = Array.isArray(item.composition_actions) ? item.composition_actions : [];

            const normalizedActions = [];
            for (const action of compositionActions) {
                if (!isNonEmptyString(action.composition_id) || !isNonEmptyString(action.action)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Chaque composition action doit contenir composition_id et action'
                    });
                }

                const normalizedAction = action.action.trim().toLowerCase();
                if (!['removed', 'added'].includes(normalizedAction)) {
                    return res.status(400).json({
                        success: false,
                        message: `Action invalide: ${action.action}`
                    });
                }

                if (normalizedAction === 'removed' && !compositionIds.has(action.composition_id.trim())) {
                    return res.status(400).json({
                        success: false,
                        message: 'Impossible de retirer une composition qui n appartient pas au plat'
                    });
                }

                normalizedActions.push({
                    composition_id: action.composition_id.trim(),
                    action: normalizedAction
                });
            }

            normalizedItems.push({
                plat,
                quantity: item.quantity,
                composition_actions: normalizedActions
            });
        }
        const summary = await createOrderFromNormalizedItems({
            session,
            customer,
            note: req.body.note,
            normalizedItems
        });

        return res.status(201).json({
            success: true,
            message: 'Commande envoyee avec succes',
            data: {
                session: buildSessionPayload(session),
                order: summary
            }
        });
    } catch (error) {
        logger.error('createOrder error', { error: error.message });
        return res.status(error.status || 500).json({
            success: false,
            message: 'Erreur lors de la creation de la commande',
            error: error.message
        });
    }
};

exports.checkoutCart = async (req, res) => {
    try {
        if (!req.body || typeof req.body !== 'object') {
            return res.status(400).json({ success: false, message: 'Corps de requete invalide' });
        }

        const session = await getValidatedSession(req.body.session_token);
        const cart = await getOrCreateActiveCartForSession(session);
        const cartSummary = await buildCartSummary(cart);

        if (!cartSummary.items.length) {
            return res.status(400).json({
                success: false,
                message: 'Le panier est vide'
            });
        }

        const customer = await ensureCustomer(req.body.customer || {});
        const currentDay = getCurrentWeekDay();
        const normalizedItems = [];

        for (const item of cartSummary.items) {
            const platDoc = await db.collection(PLAT_COLLECTION).doc(item.plat_id).get();
            if (!platDoc.exists) {
                return res.status(404).json({
                    success: false,
                    message: `Plat introuvable: ${item.plat_id}`
                });
            }

            const plat = serializeDoc(platDoc);
            if (!isPlatAvailableForDay(plat, currentDay)) {
                return res.status(400).json({
                    success: false,
                    message: `Le plat ${plat.name} n est pas commandable aujourd hui`
                });
            }

            normalizedItems.push({
                plat,
                quantity: item.quantity,
                composition_actions: (item.compositions || []).map((composition) => ({
                    composition_id: composition.composition_id,
                    action: composition.action
                }))
            });
        }

        const order = await createOrderFromNormalizedItems({
            session,
            customer,
            note: req.body.note,
            normalizedItems,
            sourceCartId: cart.id
        });

        const now = new Date().toISOString();
        await db.collection(CART_COLLECTION).doc(cart.id).update({
            status: 'converted',
            updated_at: now,
            updatedAt: now
        });

        const nextCart = await getOrCreateActiveCartForSession(session);

        return res.status(201).json({
            success: true,
            message: 'Commande envoyee a partir du panier',
            data: {
                session: buildSessionPayload(session),
                cart: await buildCartSummary(nextCart),
                order,
                orders: await listSessionOrdersSummary(session.id)
            }
        });
    } catch (error) {
        logger.error('checkoutCart error', { error: error.message });
        return res.status(error.status || 500).json({
            success: false,
            message: 'Erreur lors de la validation du panier',
            error: error.message
        });
    }
};

exports.getOrderStatus = async (req, res) => {
    try {
        const session = await getValidatedSession(req.query.session_token);
        const summary = await getOrderSummary(req.params.id);

        if (summary.table_id !== session.table_id) {
            return res.status(403).json({
                success: false,
                message: 'Cette commande ne correspond pas a la table de la session'
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                session: buildSessionPayload(session),
                order: summary
            }
        });
    } catch (error) {
        logger.error('getOrderStatus error', { error: error.message, id: req.params.id });
        return res.status(error.status || 500).json({
            success: false,
            message: 'Erreur lors de la recuperation de la commande',
            error: error.message
        });
    }
};

exports.listSessionOrders = async (req, res) => {
    try {
        const session = await getValidatedSession(req.query.session_token);
        const orders = await listSessionOrdersSummary(session.id);

        return res.status(200).json({
            success: true,
            data: {
                session: buildSessionPayload(session),
                orders
            }
        });
    } catch (error) {
        logger.error('listSessionOrders error', { error: error.message });
        return res.status(error.status || 500).json({
            success: false,
            message: 'Erreur lors de la recuperation des commandes de session',
            error: error.message
        });
    }
};
