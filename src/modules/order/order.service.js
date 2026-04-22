const AppError = require('../../shared/errors/AppError');
const OrderEntity = require('../../core/entities/Order');
const { ACTIVE_ORDER_STATUSES, ALLOWED_ORDER_STATUSES } = require('../../shared/constants/business');
const { buildSessionPayload, buildPreparationState } = require('../../core/use-cases/orderFlow');
const { filterByRestaurantScope, matchesRestaurantScope, withRestaurantScope } = require('../../shared/utils/tenant');
const { isNonEmptyString } = require('../../shared/utils/normalizers');

class OrderService {
    constructor({ orderRepository }) {
        this.orderRepository = orderRepository;
    }

    async buildOrderSummary(orderOrId, restaurantId) {
        const order = typeof orderOrId === 'string'
            ? await this.orderRepository.findOrderById(orderOrId)
            : orderOrId;

        if (!order || !matchesRestaurantScope(order, restaurantId)) {
            throw new AppError('Commande introuvable', 404);
        }

        const [customer, table, session, itemDocs] = await Promise.all([
            order.client_id ? this.orderRepository.findCustomerById(order.client_id) : null,
            order.table_id ? this.orderRepository.findTableById(order.table_id) : null,
            order.session_id ? this.orderRepository.findSessionById(order.session_id) : null,
            this.orderRepository.listOrderItems(order.id)
        ]);

        const actionDocsByItemId = await this.orderRepository.listOrderItemCompositionsBatch(
            itemDocs.map((item) => item.id)
        );

        const compositionIds = [...new Set(
            [...actionDocsByItemId.values()].flatMap((items) => items.map((action) => action.composition_id)).filter(Boolean)
        )];
        const compositions = await this.orderRepository.findCompositionsByIds(compositionIds);
        const compositionMap = new Map(compositions.map((item) => [item.id, item]));

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
                compositions: (actionDocsByItemId.get(item.id) || []).map((action) => ({
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

        return OrderEntity.create({
            ...order,
            customer,
            table,
            session: session ? buildSessionPayload(session) : null,
            items,
            total_price: items.reduce((sum, item) => sum + (item.total_price || 0), 0),
            ...orderTiming
        });
    }

    async listOrders(query, restaurantId) {
        const statusFilter = typeof query.status === 'string' ? query.status.trim().toLowerCase() : '';
        const orders = filterByRestaurantScope(await this.orderRepository.listOrders(), restaurantId)
            .filter((order) => !statusFilter || order.status === statusFilter);

        return Promise.all(orders.map((order) => this.buildOrderSummary(order, restaurantId)));
    }

    async getById(id, restaurantId) {
        return this.buildOrderSummary(id, restaurantId);
    }

    async updateStatus(id, status, restaurantId) {
        if (!ALLOWED_ORDER_STATUSES.includes(status)) {
            throw new AppError('Statut invalide', 400);
        }

        const currentOrder = await this.orderRepository.findOrderById(id);
        if (!currentOrder || !matchesRestaurantScope(currentOrder, restaurantId)) {
            throw new AppError('Commande introuvable', 404);
        }

        const now = new Date().toISOString();
        const updatePayload = {
            status,
            updated_at: now,
            updatedAt: now
        };

        const items = await this.orderRepository.listOrderItems(currentOrder.id);
        if (status === 'preparing') {
            updatePayload.preparation_started_at = now;

            await Promise.all(items.map((item) => {
                const estimatedReadyAt = new Date(
                    new Date(now).getTime() + (item.prep_time || 0) * 60 * 1000
                ).toISOString();

                return this.orderRepository.updateOrderItem(item.id, {
                    preparation_started_at: now,
                    estimated_ready_at: estimatedReadyAt
                });
            }));
        }

        if (status === 'pending') {
            updatePayload.preparation_started_at = null;

            await Promise.all(items.map((item) => this.orderRepository.updateOrderItem(item.id, {
                preparation_started_at: null,
                estimated_ready_at: null
            })));
        }

        await this.orderRepository.updateOrder(id, updatePayload);
        return this.buildOrderSummary(id, restaurantId);
    }

    async ensureCustomer({ name, phone }, restaurantId) {
        if (!isNonEmptyString(name) || !isNonEmptyString(phone)) {
            throw new AppError('Le nom et le numero de telephone du client sont requis', 400);
        }

        const cleanPhone = phone.trim();
        const existing = await this.orderRepository.findCustomerByPhone(cleanPhone);
        if (existing && matchesRestaurantScope(existing, restaurantId)) {
            if (existing.name !== name.trim()) {
                return this.orderRepository.updateCustomer(existing.id, { name: name.trim() });
            }

            return existing;
        }

        const now = new Date().toISOString();
        const ref = this.orderRepository.createCustomerRef();
        const customer = withRestaurantScope({
            id: ref.id,
            name: name.trim(),
            phone: cleanPhone,
            created_at: now,
            createdAt: now
        }, restaurantId);

        await this.orderRepository.createCustomer(ref.id, customer);
        return customer;
    }

    async listSessionOrdersSummary(sessionId, restaurantId) {
        const orders = filterByRestaurantScope(await this.orderRepository.listOrdersBySession(sessionId), restaurantId)
            .sort((a, b) => new Date(b.created_at || b.createdAt).getTime() - new Date(a.created_at || a.createdAt).getTime());

        return Promise.all(orders.map((order) => this.buildOrderSummary(order, restaurantId)));
    }

    async hasActiveOrderForSession(sessionId, restaurantId) {
        const orders = filterByRestaurantScope(await this.orderRepository.listOrdersBySession(sessionId), restaurantId);
        return orders.some((order) => ACTIVE_ORDER_STATUSES.includes(order.status));
    }

    async createOrderFromNormalizedItems({ session, customer, note, normalizedItems, sourceCartId = null, restaurantId }) {
        const now = new Date().toISOString();
        const orderRef = this.orderRepository.createOrderRef();
        const order = withRestaurantScope({
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
        }, restaurantId);

        await this.orderRepository.createOrder(orderRef.id, order);

        for (const item of normalizedItems) {
            const itemRef = this.orderRepository.createOrderItemRef();
            const orderItem = {
                id: itemRef.id,
                commande_id: order.id,
                plat_id: item.plat.id,
                quantity: item.quantity,
                plat_name: item.plat.name,
                plat_price: item.plat.price,
                kind: item.plat.kind || item.plat.category || 'plat',
                categorie_id: item.plat.categorie_id || null,
                categorie_name: item.plat.categorie_name || null,
                type_categorie_id: item.plat.type_categorie_id || null,
                type_categorie_name: item.plat.type_categorie_name || null,
                prep_time: item.plat.prep_time,
                estimated_ready_at: null,
                preparation_started_at: null,
                created_at: now,
                createdAt: now
            };

            await this.orderRepository.createOrderItem(itemRef.id, orderItem);

            for (const action of item.composition_actions) {
                const actionRef = this.orderRepository.createOrderItemCompositionRef();
                await this.orderRepository.createOrderItemComposition(actionRef.id, {
                    id: actionRef.id,
                    commande_item_id: itemRef.id,
                    composition_id: action.composition_id,
                    action: action.action,
                    created_at: now,
                    createdAt: now
                });
            }
        }

        return this.buildOrderSummary(order.id, restaurantId);
    }
}

module.exports = OrderService;
