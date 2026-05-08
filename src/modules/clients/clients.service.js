class ClientsService {
    constructor({ orderRepository }) {
        this.orderRepository = orderRepository;
    }

    // Retourne la liste des clients enrichie avec des métriques RFM basiques
    async listClients({ restaurantId, tenantId, params = {} } = {}) {
        // Récupérer tous les clients pour le restaurant/tenant
        const customerQuery = this.orderRepository.customerCollection;

        let customersSnapshot;
        try {
            customersSnapshot = await customerQuery.where('restaurant_id', '==', restaurantId).get();
        } catch (err) {
            // Si l'index n'existe pas ou aucun champ restaurant_id, fall back sur l'ensemble
            customersSnapshot = await customerQuery.get();
        }

        const customers = customersSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

        // Récupérer les commandes du restaurant (filtrage sur le restaurant évite des scans multiples)
        const ordersSnapshot = await this.orderRepository.orderCollection.where('restaurant_id', '==', restaurantId).get();
        const orders = ordersSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

        // Agréger par customer_id en mémoire (une requête sur commandes + une sur clients évite le N+1)
        const statsByCustomer = new Map();

        orders.forEach((order) => {
            const cid = order.customer_id || order.customerId || null;
            if (!cid) return; // ignore commandes sans client

            const current = statsByCustomer.get(cid) || { total_spent: 0, order_count: 0, last_visit: null };
            const amount = Number(order.total_price || order.total || 0) || 0;
            current.total_spent += amount;
            current.order_count += 1;

            const created = new Date(order.createdAt || order.created_at || order.updatedAt || order.updated_at || Date.now());
            if (!current.last_visit || created.getTime() > new Date(current.last_visit).getTime()) {
                current.last_visit = created.toISOString();
            }

            statsByCustomer.set(cid, current);
        });

        // Fusionner clients avec stats (clients sans commandes restent présents)
        const result = customers.map((c) => {
            const s = statsByCustomer.get(c.id) || { total_spent: 0, order_count: 0, last_visit: null };
            return {
                id: c.id,
                name: c.name || c.displayName || '',
                phone: c.phone || c.telephone || '',
                restaurant_id: c.restaurant_id || null,
                tenant_id: c.tenant_id || null,
                total_spent: s.total_spent,
                order_count: s.order_count,
                last_visit: s.last_visit
            };
        });

        return result;
    }
}

module.exports = ClientsService;
