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

    // Construction d'un résumé de commande avec tous les détails nécessaires pour l'affichage et la gestion
    async buildOrderSummary(orderOrId, restaurantId) {
        // Si on reçoit un ID, on récupère la commande complète depuis le repository, sinon on utilise directement l'objet fourni
        const order = typeof orderOrId === 'string'
            ? await this.orderRepository.findOrderById(orderOrId)
            : orderOrId;

        // Vérification de l'existence de la commande et de son appartenance au restaurant (tenant) courant
        if (!order || !matchesRestaurantScope(order, restaurantId)) {
            throw new AppError('Commande introuvable', 404);
        }

        // Récupération parallèle des données liées à la commande : client, table, session et items
        const [customer, table, session, itemDocs] = await Promise.all([
            order.client_id ? this.orderRepository.findCustomerById(order.client_id) : null,
            order.table_id ? this.orderRepository.findTableById(order.table_id) : null,
            order.session_id ? this.orderRepository.findSessionById(order.session_id) : null,
            this.orderRepository.listOrderItems(order.id)
        ]);

        // Récupération des actions de composition pour les items de la commande
        const actionDocsByItemId = await this.orderRepository.listOrderItemCompositionsBatch(
            itemDocs.map((item) => item.id)
        );

        // Extraction des IDs de compositions uniques à partir des actions pour faire une requête optimisée
        const compositionIds = [...new Set(
            [...actionDocsByItemId.values()].flatMap((items) => items.map((action) => action.composition_id)).filter(Boolean)
        )];

        // Récupération des détails des compositions en une seule requête pour éviter les requêtes N+1
        const compositions = await this.orderRepository.findCompositionsByIds(compositionIds);
        const compositionMap = new Map(compositions.map((item) => [item.id, item]));

        // Construction de la liste des items de la commande avec tous les détails nécessaires pour l'affichage et le suivi de la préparation
        const items = itemDocs.map((item) => {
            // Calcul de l'état de préparation de chaque item en fonction de son statut, des temps estimés et des temps de préparation
            const timing = buildPreparationState({
                status: order.status,
                estimatedReadyAt: item.estimated_ready_at,
                preparationStartedAt: item.preparation_started_at || order.preparation_started_at,
                prepTime: item.prep_time
            });

            // Ajout des détails de composition à chaque item pour permettre l'affichage des personnalisations et des modifications demandées par le client
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

        // Calcul de l'heure estimée de préparation la plus éloignée parmi les items pour donner une estimation globale de la commande
        const activeEstimatedReadyAt = items
            .map((item) => item.estimated_ready_at)
            .filter(Boolean)
            .reduce((max, value) => {
                const timestamp = new Date(value).getTime();
                return timestamp > max ? timestamp : max;
            }, 0);
        
        // Calcul de l'état de préparation global de la commande en fonction des items et de leur état individuel
        const orderTiming = buildPreparationState({
            status: order.status,
            estimatedReadyAt: activeEstimatedReadyAt ? new Date(activeEstimatedReadyAt).toISOString() : null,
            preparationStartedAt: order.preparation_started_at,
            prepTime: Math.max(...items.map((item) => item.preparation_total_minutes || 0), 0)
        });

        // Construction de l'entité de commande finale avec tous les détails nécessaires pour l'affichage et la gestion dans le système
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

    // Liste des commandes avec possibilité de filtrer par statut et de s'assurer que seules les commandes du restaurant courant sont retournées
    async listOrders(query, restaurantId) {
        const statusFilter = typeof query.status === 'string' ? query.status.trim().toLowerCase() : '';
        const orders = filterByRestaurantScope(await this.orderRepository.listOrders(), restaurantId)
            .filter((order) => !statusFilter || order.status === statusFilter);

        return Promise.all(orders.map((order) => this.buildOrderSummary(order, restaurantId)));
    }

    // Récupération d'une commande par ID avec tous les détails nécessaires pour l'affichage et la gestion
    async getById(id, restaurantId) {
        return this.buildOrderSummary(id, restaurantId);
    }

    // Mise à jour du statut d'une commande avec validation du statut, vérification de l'existence de la commande et de son appartenance au restaurant, et mise à jour des temps de préparation des items si nécessaire
    async updateStatus(id, status, restaurantId) {
        // Validation du statut fourni pour s'assurer qu'il est parmi les statuts autorisés et éviter les erreurs de logique métier
        if (!ALLOWED_ORDER_STATUSES.includes(status)) {
            throw new AppError('Statut invalide', 400);
        }

        // Récupération de la commande pour vérifier son existence et son appartenance au restaurant avant de procéder à la mise à jour
        const currentOrder = await this.orderRepository.findOrderById(id);
        if (!currentOrder || !matchesRestaurantScope(currentOrder, restaurantId)) {
            throw new AppError('Commande introuvable', 404);
        }

        // Construction du payload de mise à jour avec les nouveaux statuts et les temps de mise à jour pour assurer une traçabilité et une gestion correcte des états de la commande
        const now = new Date().toISOString();
        const updatePayload = {
            status,
            updated_at: now,
            updatedAt: now
        };

        // Si le statut passe à "preparing", on démarre le temps de préparation et on calcule les temps estimés pour chaque item en fonction de leur temps de préparation individuel
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

        // Si le statut repasse à "pending", on réinitialise les temps de préparation et les temps estimés pour chaque item pour refléter le fait que la préparation a été interrompue ou annulée
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

    // Méthode utilitaire pour s'assurer qu'un client existe ou en créer un nouveau à partir des informations fournies, avec validation des données et respect du scope du restaurant
    async ensureCustomer({ name, phone }, restaurantId) {
        // Validation des données d'entrée pour s'assurer que le nom et le numéro de téléphone sont fournis et éviter la création de clients avec des données incomplètes
        if (!isNonEmptyString(name) || !isNonEmptyString(phone)) {
            throw new AppError('Le nom et le numero de telephone du client sont requis', 400);
        }

        // Nettoyage du numéro de téléphone pour éviter les problèmes de formatage et permettre la réutilisation des clients existants même si le format du numéro varie légèrement (ex: espaces, tirets)
        const cleanPhone = phone.trim();
        const existing = await this.orderRepository.findCustomerByPhone(cleanPhone);
        
        // Si un client existe déjà avec ce numéro de téléphone et qu'il appartient au restaurant courant, on le retourne (après éventuellement mettre à jour son nom si celui fourni est différent) pour éviter la création de doublons et permettre la réutilisation des clients existants
        if (existing && matchesRestaurantScope(existing, restaurantId)) {
            if (existing.name !== name.trim()) {
                return this.orderRepository.updateCustomer(existing.id, { name: name.trim() });
            }

            return existing;
        }

        // Si aucun client n'existe avec ce numéro de téléphone, ou si le client existant n'appartient pas au restaurant courant, on en crée un nouveau avec les informations fournies et le scope du restaurant pour assurer une bonne organisation des données et permettre la réutilisation de ce client pour les commandes futures
        const now = new Date().toISOString();
        const ref = this.orderRepository.createCustomerRef();

        // Création d'un nouveau client avec les informations fournies et le scope du restaurant pour assurer une bonne organisation des données et permettre la réutilisation de ce client pour les commandes futures
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

    // Liste des commandes d'une session avec tous les détails nécessaires pour l'affichage et la gestion, filtrées par restaurant pour assurer que seules les commandes du restaurant courant sont retournées
    async listSessionOrdersSummary(sessionId, restaurantId) {
        const orders = filterByRestaurantScope(await this.orderRepository.listOrdersBySession(sessionId), restaurantId)
            .sort((a, b) => new Date(b.created_at || b.createdAt).getTime() - new Date(a.created_at || a.createdAt).getTime());

        return Promise.all(orders.map((order) => this.buildOrderSummary(order, restaurantId)));
    }

    // Vérification de l'existence de commandes actives (non terminées) pour une session donnée, filtrées par restaurant pour assurer que seules les commandes du restaurant courant sont prises en compte
    async hasActiveOrderForSession(sessionId, restaurantId) {
        const orders = filterByRestaurantScope(await this.orderRepository.listOrdersBySession(sessionId), restaurantId);
        return orders.some((order) => ACTIVE_ORDER_STATUSES.includes(order.status));
    }

    // Création d'une commande à partir d'une liste d'items normalisés (avec les détails nécessaires pour la création de la commande et de ses items), avec validation des données, respect du scope du restaurant, et construction de la commande finale avec tous les détails nécessaires pour l'affichage et la gestion dans le système
    async createOrderFromNormalizedItems({ session, customer, note, normalizedItems, sourceCartId = null, restaurantId }) {
        const now = new Date().toISOString();

        try {
            // On utilise le SDK Firestore via le repository pour démarrer une transaction
            const orderId = await this.orderRepository.firestore.runTransaction(async (transaction) => {
                const orderRef = this.orderRepository.createOrderRef();
                const orderData = withRestaurantScope({
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

                // 1. Enregistrement de la commande principale
                transaction.set(orderRef, orderData);

                for (const item of normalizedItems) {
                    const itemRef = this.orderRepository.createOrderItemRef();
                    const orderItem = {
                        id: itemRef.id,
                        commande_id: orderRef.id,
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

                    // 2. Enregistrement de chaque item de commande
                    transaction.set(itemRef, orderItem);

                    for (const action of item.composition_actions) {
                        const actionRef = this.orderRepository.createOrderItemCompositionRef();
                        const compositionData = {
                            id: actionRef.id,
                            commande_item_id: itemRef.id,
                            composition_id: action.composition_id,
                            action: action.action,
                            created_at: now,
                            createdAt: now
                        };
                        // 3. Enregistrement des détails de composition
                        transaction.set(actionRef, compositionData);
                    }
                }
                return orderRef.id;
            });

            // Une fois la transaction validée, on construit le résumé complet
            return this.buildOrderSummary(orderId, restaurantId);
        } catch (error) {
            // En cas d'erreur dans la transaction, Firestore annule tout automatiquement
            console.error('Erreur transaction création commande:', error);
            throw new AppError('Échec de la validation de votre commande. Veuillez réessayer.', 500);
        }
    }
}

module.exports = OrderService;
