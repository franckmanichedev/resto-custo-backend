const { db } = require('../config/firebase');
const logger = require('../utils/logger');

const ORDER_COLLECTION = 'commandes';
const ORDER_ITEM_COLLECTION = 'commande_items';
const ORDER_ITEM_COMPOSITION_COLLECTION = 'commande_item_compositions';
const CUSTOMER_COLLECTION = 'customers';
const TABLE_COLLECTION = 'tables';
const TABLE_SESSION_COLLECTION = 'table_sessions';
const COMPOSITION_COLLECTION = 'compositions';

const ALLOWED_STATUSES = ['pending', 'preparing', 'served', 'cancelled'];

const serializeDoc = (doc) => ({
    id: doc.id,
    ...doc.data()
});

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

const getOrderSummary = async (orderDoc) => {
    const order = typeof orderDoc.data === 'function' ? serializeDoc(orderDoc) : orderDoc;
    const customerDoc = await db.collection(CUSTOMER_COLLECTION).doc(order.client_id).get();
    const tableDoc = await db.collection(TABLE_COLLECTION).doc(order.table_id).get();
    const itemsSnap = await db.collection(ORDER_ITEM_COLLECTION).where('commande_id', '==', order.id).get();
    const itemDocs = itemsSnap.docs.map(serializeDoc);
    const actionSnaps = await Promise.all(itemDocs.map(async (item) =>
        db.collection(ORDER_ITEM_COMPOSITION_COLLECTION)
            .where('commande_item_id', '==', item.id)
            .get()
    ));

    const allCompositionIds = [...new Set(
        actionSnaps.flatMap((snap) => snap.docs.map((doc) => doc.data().composition_id)).filter(Boolean)
    )];
    const compositionMap = await getCompositionMap(allCompositionIds);
    const sessionDoc = order.session_id
        ? await db.collection(TABLE_SESSION_COLLECTION).doc(order.session_id).get()
        : null;

    const items = itemDocs.map((item, index) => {
        const actionsSnap = actionSnaps[index];
        const actions = actionsSnap.docs.map(serializeDoc);
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
            compositions: actions.map((action) => ({
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

    return {
        ...order,
        customer: customerDoc.exists ? serializeDoc(customerDoc) : null,
        table: tableDoc.exists ? serializeDoc(tableDoc) : null,
        session: sessionDoc?.exists ? buildSessionPayload(serializeDoc(sessionDoc)) : null,
        items,
        total_price: items.reduce((sum, item) => sum + (item.total_price || 0), 0),
        ...orderTiming
    };
};

exports.listOrders = async (req, res) => {
    try {
        const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : '';
        const snap = await db.collection(ORDER_COLLECTION).orderBy('createdAt', 'desc').get();
        const orders = await Promise.all(
            snap.docs
                .map(serializeDoc)
                .filter((order) => !statusFilter || order.status === statusFilter)
                .map((order) => getOrderSummary(order))
        );

        return res.status(200).json({
            success: true,
            count: orders.length,
            data: orders
        });
    } catch (error) {
        logger.error('listOrders error', { error: error.message });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la recuperation des commandes',
            error: error.message
        });
    }
};

exports.getOrderById = async (req, res) => {
    try {
        const doc = await db.collection(ORDER_COLLECTION).doc(req.params.id).get();
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Commande introuvable'
            });
        }

        return res.status(200).json({
            success: true,
            data: await getOrderSummary(doc)
        });
    } catch (error) {
        logger.error('getOrderById error', { error: error.message, id: req.params.id });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la recuperation de la commande',
            error: error.message
        });
    }
};

exports.updateOrderStatus = async (req, res) => {
    try {
        const status = typeof req.body?.status === 'string' ? req.body.status.trim().toLowerCase() : '';
        if (!ALLOWED_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Statut invalide'
            });
        }

        const orderRef = db.collection(ORDER_COLLECTION).doc(req.params.id);
        const doc = await orderRef.get();
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Commande introuvable'
            });
        }

        const currentOrder = serializeDoc(doc);
        const now = new Date().toISOString();
        const updatePayload = {
            status,
            updated_at: now,
            updatedAt: now
        };

        if (status === 'preparing') {
            updatePayload.preparation_started_at = now;

            const itemsSnap = await db.collection(ORDER_ITEM_COLLECTION).where('commande_id', '==', currentOrder.id).get();
            await Promise.all(itemsSnap.docs.map(async (itemDoc) => {
                const item = serializeDoc(itemDoc);
                const estimatedReadyAt = new Date(
                    new Date(now).getTime() + (item.prep_time || 0) * 60 * 1000
                ).toISOString();

                await itemDoc.ref.update({
                    preparation_started_at: now,
                    estimated_ready_at: estimatedReadyAt
                });
            }));
        }

        if (status === 'pending') {
            updatePayload.preparation_started_at = null;

            const itemsSnap = await db.collection(ORDER_ITEM_COLLECTION).where('commande_id', '==', currentOrder.id).get();
            await Promise.all(itemsSnap.docs.map((itemDoc) =>
                itemDoc.ref.update({
                    preparation_started_at: null,
                    estimated_ready_at: null
                })
            ));
        }

        await orderRef.update(updatePayload);

        const updatedDoc = await orderRef.get();
        return res.status(200).json({
            success: true,
            message: 'Statut de commande mis a jour',
            data: await getOrderSummary(updatedDoc)
        });
    } catch (error) {
        logger.error('updateOrderStatus error', { error: error.message, id: req.params.id });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la mise a jour du statut',
            error: error.message
        });
    }
};
