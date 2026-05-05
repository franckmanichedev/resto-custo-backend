const crypto = require('crypto');
const AppError = require('../../shared/errors/AppError');
const SessionEntity = require('../../core/entities/Session');
const { WEEK_DAYS, SESSION_DURATION_MINUTES } = require('../../shared/constants/business');
const { buildSessionPayload } = require('../../core/use-cases/orderFlow');
const { getCurrentWeekDay, isMenuItemAvailableForDay } = require('../../core/use-cases/menuCatalog');
const {
    DEFAULT_RESTAURANT_ID,
    filterByRestaurantScope,
    matchesRestaurantScope,
    withRestaurantScope
} = require('../../shared/utils/tenant');
const { isNonEmptyString } = require('../../shared/utils/normalizers');

const getScopedRestaurantId = (entity) => (
    entity?.restaurant_id
    || entity?.restaurantId
    || entity?.tenant_id
    || entity?.tenantId
    || null
);

const normalizeCompositionActions = (actions = []) => (actions || [])
    .filter((action) => isNonEmptyString(action.composition_id) && isNonEmptyString(action.action))
    .map((action) => ({
        composition_id: action.composition_id.trim(),
        action: action.action.trim().toLowerCase()
    }))
    .sort((a, b) => `${a.composition_id}:${a.action}`.localeCompare(`${b.composition_id}:${b.action}`));

const getCompositionSignature = (actions = []) =>
    normalizeCompositionActions(actions)
        .map((action) => `${action.composition_id}:${action.action}`)
        .join('|');

class SessionService {
    constructor({ sessionRepository, tableRepository, platService, orderService }) {
        this.sessionRepository = sessionRepository;
        this.tableRepository = tableRepository;
        this.platService = platService;
        this.orderService = orderService;
    }

    validateRequestedDay(day) {
        if (!day) {
            return getCurrentWeekDay();
        }

        const normalized = String(day).trim().toLowerCase();
        if (!WEEK_DAYS.includes(normalized)) {
            throw new AppError('Jour invalide', 400);
        }

        return normalized;
    }

    getSessionExpirationDate() {
        return new Date(Date.now() + SESSION_DURATION_MINUTES * 60 * 1000);
    }

    normalizeCartLineItems(payload) {
        if (Array.isArray(payload.line_items) && payload.line_items.length > 0) {
            const lineItems = payload.line_items
                .filter((item) => item && typeof item === 'object')
                .map((item) => ({
                    quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1,
                    composition_actions: Array.isArray(item.composition_actions) ? item.composition_actions : []
                }));

            if (!lineItems.length) {
                throw new AppError('line_items doit contenir au moins une personnalisation valide', 400);
            }

            return lineItems;
        }

        if (!isNonEmptyString(payload.plat_id) || typeof payload.quantity !== 'number' || payload.quantity < 1) {
            throw new AppError('plat_id et quantity >= 1 sont requis', 400);
        }

        return Array.from({ length: payload.quantity }, () => ({
            quantity: 1,
            composition_actions: Array.isArray(payload.composition_actions) ? payload.composition_actions : []
        }));
    }

    async getTableByInput(payload, restaurantId) {
        if (isNonEmptyString(payload.table_id)) {
            const table = await this.tableRepository.findById(payload.table_id.trim());
            // Allow match when table belongs to restaurant scope OR when request came without a specific restaurant scope
            if (table && (matchesRestaurantScope(table, restaurantId) || restaurantId === DEFAULT_RESTAURANT_ID)) {
                return table;
            }
        }

        if (isNonEmptyString(payload.qr_code)) {
            // If no explicit restaurantId provided (default), don't filter by scope so public QR codes still resolve
            const rawTables = await this.tableRepository.findByQrCode(payload.qr_code.trim());
            const tables = restaurantId === DEFAULT_RESTAURANT_ID
                ? rawTables
                : filterByRestaurantScope(rawTables, restaurantId);

            if (tables.length > 0) {
                return tables[0];
            }
        }

        return null;
    }

    resolveEffectiveRestaurantId(requestedRestaurantId, scopedEntity) {
        if (requestedRestaurantId && requestedRestaurantId !== DEFAULT_RESTAURANT_ID) {
            return requestedRestaurantId;
        }

        return getScopedRestaurantId(scopedEntity) || requestedRestaurantId || DEFAULT_RESTAURANT_ID;
    }

    async maybeExtendSessionForActiveOrders(session, restaurantId) {
        if (new Date(session.expires_at).getTime() > Date.now()) {
            return session;
        }

        if (!(await this.orderService.hasActiveOrderForSession(session.id, restaurantId))) {
            throw new AppError('La session de table a expire', 410);
        }

        const refreshedExpiresAt = this.getSessionExpirationDate().toISOString();
        const refreshedAt = new Date().toISOString();
        await this.sessionRepository.updateSession(session.id, {
            expires_at: refreshedExpiresAt,
            refreshed_at: refreshedAt
        });

        return {
            ...session,
            expires_at: refreshedExpiresAt,
            refreshed_at: refreshedAt,
            _extended: true
        };
    }

    async getLatestActiveSessionForTable(tableId, restaurantId) {
        const sessions = filterByRestaurantScope(await this.sessionRepository.listSessionsByTable(tableId), restaurantId)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        for (const session of sessions) {
            try {
                return await this.maybeExtendSessionForActiveOrders(session, restaurantId);
            } catch (error) {
                if ((error.statusCode || error.status) !== 410) {
                    throw error;
                }
            }
        }

        return null;
    }

    async getValidatedSession(sessionToken, restaurantId) {
        if (!isNonEmptyString(sessionToken)) {
            throw new AppError('session_token est requis', 400);
        }

        const session = await this.sessionRepository.findSessionByToken(sessionToken.trim());
        if (!session) {
            throw new AppError('Session de table introuvable', 404);
        }

        const effectiveRestaurantId = this.resolveEffectiveRestaurantId(restaurantId, session);
        if (!matchesRestaurantScope(session, effectiveRestaurantId)) {
            throw new AppError('Session de table introuvable', 404);
        }

        return this.maybeExtendSessionForActiveOrders(session, effectiveRestaurantId);
    }

    async getOrCreateActiveCartForSession(session) {
        const carts = await this.sessionRepository.listCartsBySession(session.id);
        const existing = carts.find((cart) => cart.status === 'active');

        if (existing) {
            return existing;
        }

        const now = new Date().toISOString();
        const ref = this.sessionRepository.createCartRef();
        const cart = {
            id: ref.id,
            table_session_id: session.id,
            table_id: session.table_id,
            restaurant_id: session.restaurant_id || null,
            status: 'active',
            created_at: now,
            updated_at: now,
            createdAt: now,
            updatedAt: now
        };

        await this.sessionRepository.createCart(ref.id, cart);
        return cart;
    }

    async buildCartSummary(cart, restaurantId) {
        if (!cart) {
            return null;
        }

        const items = await this.sessionRepository.listCartItems(cart.id);
        const actionDocsByItemId = await this.sessionRepository.listCartItemCompositionsBatch(
            items.map((item) => item.id)
        );

        const compositionIds = [...new Set(
            [...actionDocsByItemId.values()].flatMap((actions) => actions.map((action) => action.composition_id)).filter(Boolean)
        )];
        const compositionMap = new Map(
            filterByRestaurantScope(await this.orderService.orderRepository.findCompositionsByIds(compositionIds), restaurantId)
                .map((composition) => [composition.id, composition])
        );

        const formattedItems = items.map((item) => ({
            ...item,
            total_price: (item.plat_price || 0) * (item.quantity || 0),
            compositions: (actionDocsByItemId.get(item.id) || []).map((action) => ({
                ...action,
                composition_name: compositionMap.get(action.composition_id)?.name || action.composition_id
            }))
        }));

        return {
            ...cart,
            items: formattedItems,
            total_items: formattedItems.reduce((sum, item) => sum + (item.quantity || 0), 0),
            total_price: formattedItems.reduce((sum, item) => sum + (item.total_price || 0), 0)
        };
    }

    async findMatchingCartItem(cartId, platId, compositionActions) {
        const items = (await this.sessionRepository.listCartItems(cartId))
            .filter((item) => item.plat_id === platId);

        if (!items.length) {
            return null;
        }

        const targetSignature = getCompositionSignature(compositionActions);
        const actionDocsByItemId = await this.sessionRepository.listCartItemCompositionsBatch(items.map((item) => item.id));

        return items.find((item) => getCompositionSignature(actionDocsByItemId.get(item.id) || []) === targetSignature) || null;
    }

    async getMenuPayloadForSession(session, requestedDay, restaurantId) {
        const currentDay = getCurrentWeekDay();
        const day = this.validateRequestedDay(requestedDay);
        const table = await this.tableRepository.findById(session.table_id);

        if (!table || !matchesRestaurantScope(table, restaurantId)) {
            throw new AppError('Table introuvable', 404);
        }

        const catalog = await this.platService.getMenuCatalog(restaurantId, day);
        return {
            table,
            session: buildSessionPayload(session),
            current_day: currentDay,
            requested_day: day,
            can_order: day === currentDay,
            consultable_days: catalog.consultableDays,
            plats: catalog.plats,
            cart: null,
            orders: await this.orderService.listSessionOrdersSummary(session.id, restaurantId)
        };
    }

    validateOrderPayload(payload) {
        if (!payload || typeof payload !== 'object') {
            throw new AppError('Le corps de la requete doit etre un objet JSON', 400);
        }

        if (!isNonEmptyString(payload.session_token)) {
            throw new AppError('session_token est requis', 400);
        }

        if (!payload.customer || typeof payload.customer !== 'object') {
            throw new AppError('Les informations du client sont requises', 400);
        }

        if (!isNonEmptyString(payload.customer.name) || !isNonEmptyString(payload.customer.phone)) {
            throw new AppError('Le nom et le numero de telephone du client sont requis', 400);
        }

        if (!Array.isArray(payload.items) || payload.items.length === 0) {
            throw new AppError('Au moins un plat doit etre commande', 400);
        }
    }

    async startTableSession(payload, restaurantId) {
        const table = await this.getTableByInput(payload || {}, restaurantId);
        if (!table || table.is_active === false) {
            throw new AppError('Table introuvable ou inactive', 404);
        }

        const effectiveRestaurantId = this.resolveEffectiveRestaurantId(restaurantId, table);
        const existingSession = await this.getLatestActiveSessionForTable(table.id, effectiveRestaurantId);
        if (existingSession) {
            return {
                statusCode: 200,
                message: 'Session de table existante reutilisee',
                data: await this.getMenuPayloadForSession(existingSession, getCurrentWeekDay(), effectiveRestaurantId)
            };
        }

        const now = new Date().toISOString();
        const ref = this.sessionRepository.createSessionRef();
        const session = SessionEntity.create(withRestaurantScope({
            id: ref.id,
            table_id: table.id,
            session_token: crypto.randomBytes(24).toString('hex'),
            expires_at: this.getSessionExpirationDate().toISOString(),
            created_at: now,
            createdAt: now
        }, effectiveRestaurantId));

        await this.sessionRepository.createSession(ref.id, session);

        return {
            statusCode: 201,
            message: 'Session de table creee avec succes',
            data: await this.getMenuPayloadForSession(session, getCurrentWeekDay(), effectiveRestaurantId)
        };
    }

    async getSessionMenu(sessionToken, day, restaurantId) {
        const session = await this.getValidatedSession(sessionToken, restaurantId);
        const effectiveRestaurantId = this.resolveEffectiveRestaurantId(restaurantId, session);
        return this.getMenuPayloadForSession(session, day, effectiveRestaurantId);
    }

    async getPlatDetail(platId, query, restaurantId) {
        const session = await this.getValidatedSession(query.session_token, restaurantId);
        const effectiveRestaurantId = this.resolveEffectiveRestaurantId(restaurantId, session);
        const currentDay = getCurrentWeekDay();
        const requestedDay = this.validateRequestedDay(query.day || currentDay);
        const [table, plat] = await Promise.all([
            this.tableRepository.findById(session.table_id),
            this.platService.getById(platId, effectiveRestaurantId, { currentDay, requestedDay })
        ]);

        return {
            table,
            session: buildSessionPayload(session),
            current_day: currentDay,
            requested_day: requestedDay,
            plat
        };
    }

    async listAllPlatsForSession(sessionToken, query = {}, restaurantId) {
        const session = await this.getValidatedSession(sessionToken, restaurantId);
        const effectiveRestaurantId = this.resolveEffectiveRestaurantId(restaurantId, session);

        // If query.all is present we return full list, otherwise respect filters in query
        const plats = await this.platService.list(query || {}, effectiveRestaurantId, {});

        return { session: buildSessionPayload(session), plats };
    }

    async getCart(sessionToken, restaurantId) {
        const session = await this.getValidatedSession(sessionToken, restaurantId);
        const effectiveRestaurantId = this.resolveEffectiveRestaurantId(restaurantId, session);
        const cart = await this.getOrCreateActiveCartForSession(session);

        return {
            session: buildSessionPayload(session),
            cart: await this.buildCartSummary(cart, effectiveRestaurantId),
            orders: await this.orderService.listSessionOrdersSummary(session.id, effectiveRestaurantId)
        };
    }

    async addCartItem(payload, restaurantId) {
        const session = await this.getValidatedSession(payload.session_token, restaurantId);
        const effectiveRestaurantId = this.resolveEffectiveRestaurantId(restaurantId, session);
        const currentDay = getCurrentWeekDay();
        const normalizedLineItems = this.normalizeCartLineItems(payload);

        if (!isNonEmptyString(payload.plat_id)) {
            throw new AppError('plat_id est requis', 400);
        }

        const plat = await this.platService.getById(payload.plat_id.trim(), effectiveRestaurantId, { currentDay });
        if (!isMenuItemAvailableForDay(plat, currentDay)) {
            throw new AppError('Ce plat n est pas commandable aujourd hui', 400);
        }

        const cart = await this.getOrCreateActiveCartForSession(session);
        const now = new Date().toISOString();

        for (const lineItem of normalizedLineItems) {
            const actions = normalizeCompositionActions(lineItem.composition_actions);
            const matchingItem = await this.findMatchingCartItem(cart.id, plat.id, actions);
            if (matchingItem) {
                await this.sessionRepository.updateCartItem(matchingItem.id, {
                    quantity: Number(matchingItem.quantity || 0) + Number(lineItem.quantity || 1),
                    updated_at: now,
                    updatedAt: now
                });
                continue;
            }

            const itemRef = this.sessionRepository.createCartItemRef();
            await this.sessionRepository.createCartItem(itemRef.id, {
                id: itemRef.id,
                panier_id: cart.id,
                plat_id: plat.id,
                plat_name: plat.name,
                plat_price: plat.price,
                quantity: lineItem.quantity,
                created_at: now,
                updated_at: now,
                createdAt: now,
                updatedAt: now
            });

            await this.sessionRepository.replaceCartItemCompositions(itemRef.id, actions.map((action) => ({
                ...action,
                created_at: now,
                createdAt: now
            })));
        }

        await this.sessionRepository.updateCart(cart.id, { updated_at: now, updatedAt: now });
        return { cart: await this.buildCartSummary(await this.getOrCreateActiveCartForSession(session), effectiveRestaurantId) };
    }

    async updateCartItem(itemId, payload, restaurantId) {
        const session = await this.getValidatedSession(payload.session_token, restaurantId);
        const effectiveRestaurantId = this.resolveEffectiveRestaurantId(restaurantId, session);
        const cart = await this.getOrCreateActiveCartForSession(session);
        const item = await this.sessionRepository.findCartItemById(itemId);

        if (!item || item.panier_id !== cart.id) {
            throw new AppError('Element de panier introuvable', 404);
        }

        const quantity = typeof payload.quantity === 'number' ? payload.quantity : item.quantity;
        if (quantity < 1) {
            throw new AppError('quantity doit etre >= 1', 400);
        }

        const now = new Date().toISOString();
        await this.sessionRepository.updateCartItem(itemId, { quantity, updated_at: now, updatedAt: now });

        const actions = (Array.isArray(payload.composition_actions) ? payload.composition_actions : [])
            .filter((action) => isNonEmptyString(action.composition_id) && isNonEmptyString(action.action))
            .map((action) => ({
                composition_id: action.composition_id.trim(),
                action: action.action.trim().toLowerCase(),
                created_at: now,
                createdAt: now
            }));

        await this.sessionRepository.replaceCartItemCompositions(itemId, actions);
        await this.sessionRepository.updateCart(cart.id, { updated_at: now, updatedAt: now });
        return { cart: await this.buildCartSummary(cart, effectiveRestaurantId) };
    }

    async removeCartItem(itemId, sessionToken, restaurantId) {
        const session = await this.getValidatedSession(sessionToken, restaurantId);
        const effectiveRestaurantId = this.resolveEffectiveRestaurantId(restaurantId, session);
        const cart = await this.getOrCreateActiveCartForSession(session);
        const item = await this.sessionRepository.findCartItemById(itemId);

        if (!item || item.panier_id !== cart.id) {
            throw new AppError('Element de panier introuvable', 404);
        }

        await this.sessionRepository.deleteCartItemCompositions(itemId);
        await this.sessionRepository.deleteCartItem(itemId);
        return { cart: await this.buildCartSummary(cart, effectiveRestaurantId) };
    }

    async createOrder(payload, restaurantId) {
        this.validateOrderPayload(payload);

        const session = await this.getValidatedSession(payload.session_token, restaurantId);
        const effectiveRestaurantId = this.resolveEffectiveRestaurantId(restaurantId, session);
        const currentDay = getCurrentWeekDay();
        const customer = await this.orderService.ensureCustomer(payload.customer, effectiveRestaurantId);
        const normalizedItems = [];

        for (const item of payload.items) {
            if (!isNonEmptyString(item.plat_id) || typeof item.quantity !== 'number' || item.quantity < 1) {
                throw new AppError('Chaque item doit contenir plat_id et quantity >= 1', 400);
            }

            const plat = await this.platService.getById(item.plat_id.trim(), effectiveRestaurantId, { currentDay });
            if (!isMenuItemAvailableForDay(plat, currentDay)) {
                throw new AppError(`Le plat ${plat.name} n est pas commandable aujourd hui`, 400);
            }

            const compositionIds = new Set((plat.compositions || []).map((composition) => composition.id));
            const normalizedActions = [];

            for (const action of (Array.isArray(item.composition_actions) ? item.composition_actions : [])) {
                if (!isNonEmptyString(action.composition_id) || !isNonEmptyString(action.action)) {
                    throw new AppError('Chaque composition action doit contenir composition_id et action', 400);
                }

                const normalizedAction = action.action.trim().toLowerCase();
                if (!['removed', 'added'].includes(normalizedAction)) {
                    throw new AppError(`Action invalide: ${action.action}`, 400);
                }

                if (normalizedAction === 'removed' && !compositionIds.has(action.composition_id.trim())) {
                    throw new AppError('Impossible de retirer une composition qui n appartient pas au plat', 400);
                }

                normalizedActions.push({
                    composition_id: action.composition_id.trim(),
                    action: normalizedAction
                });
            }

            normalizedItems.push({ plat, quantity: item.quantity, composition_actions: normalizedActions });
        }

        const order = await this.orderService.createOrderFromNormalizedItems({
            session,
            customer,
            note: payload.note,
            normalizedItems,
            restaurantId: effectiveRestaurantId
        });

        return {
            session: buildSessionPayload(session),
            order,
            orders: await this.orderService.listSessionOrdersSummary(session.id, effectiveRestaurantId)
        };
    }

    async checkoutCart(payload, restaurantId) {
        if (!payload || typeof payload !== 'object') {
            throw new AppError('Corps de requete invalide', 400);
        }

        const session = await this.getValidatedSession(payload.session_token, restaurantId);
        const effectiveRestaurantId = this.resolveEffectiveRestaurantId(restaurantId, session);
        const cart = await this.getOrCreateActiveCartForSession(session);
        const cartSummary = await this.buildCartSummary(cart, effectiveRestaurantId);

        if (!cartSummary.items.length) {
            throw new AppError('Le panier est vide', 400);
        }

        const customer = await this.orderService.ensureCustomer(payload.customer || {}, effectiveRestaurantId);
        const currentDay = getCurrentWeekDay();
        const normalizedItems = [];

        for (const item of cartSummary.items) {
            const plat = await this.platService.getById(item.plat_id, effectiveRestaurantId, { currentDay });
            if (!isMenuItemAvailableForDay(plat, currentDay)) {
                throw new AppError(`Le plat ${plat.name} n est pas commandable aujourd hui`, 400);
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

        const order = await this.orderService.createOrderFromNormalizedItems({
            session,
            customer,
            note: payload.note,
            normalizedItems,
            sourceCartId: cart.id,
            restaurantId: effectiveRestaurantId
        });

        const now = new Date().toISOString();
        await this.sessionRepository.updateCart(cart.id, {
            status: 'converted',
            updated_at: now,
            updatedAt: now
        });

        const nextCart = await this.getOrCreateActiveCartForSession(session);
        return {
            session: buildSessionPayload(session),
            cart: await this.buildCartSummary(nextCart, effectiveRestaurantId),
            order,
            orders: await this.orderService.listSessionOrdersSummary(session.id, effectiveRestaurantId)
        };
    }

    async getOrderStatus(orderId, sessionToken, restaurantId) {
        const session = await this.getValidatedSession(sessionToken, restaurantId);
        const effectiveRestaurantId = this.resolveEffectiveRestaurantId(restaurantId, session);
        const order = await this.orderService.getById(orderId, effectiveRestaurantId);

        if (order.table_id !== session.table_id) {
            throw new AppError('Cette commande ne correspond pas a la table de la session', 403);
        }

        return {
            session: buildSessionPayload(session),
            order
        };
    }

    async listSessionOrders(sessionToken, restaurantId) {
        const session = await this.getValidatedSession(sessionToken, restaurantId);
        const effectiveRestaurantId = this.resolveEffectiveRestaurantId(restaurantId, session);
        return {
            session: buildSessionPayload(session),
            orders: await this.orderService.listSessionOrdersSummary(session.id, effectiveRestaurantId)
        };
    }

    /**
     * Ferme manuellement une session de table par l'administrateur.
     * Respecte strictement le scope du restaurant.
     */
    async forceTerminateSession(sessionId, restaurantId) {
        // 1. Récupération de la session via le repository
        const session = await this.sessionRepository.findSessionById(sessionId);

        // 2. Vérification de l'existence et de l'appartenance au restaurant (Ta logique stricte)
        if (!session || !matchesRestaurantScope(session, restaurantId)) {
            throw new AppError('Session introuvable ou accès non autorisé', 404);
        }

        // 3. Fermeture : On met la date d'expiration dans le passé pour invalider le token instantanément
        const now = new Date();
        const updatePayload = {
            expires_at: new Date(now.getTime() - 1000).toISOString(), // Expire il y a 1 seconde
            updatedAt: now.toISOString(),
            terminated_by: 'admin' // Pour la traçabilité
        };

        await this.sessionRepository.updateSession(sessionId, updatePayload);
        
        return { success: true, message: 'La table est désormais libérée' };
    }
}

module.exports = SessionService;
