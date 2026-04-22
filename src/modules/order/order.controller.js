const { resolveRestaurantId } = require('../../shared/utils/tenant');

class OrderController {
    constructor({ orderService }) {
        this.orderService = orderService;
    }

    listOrders = async (req, res, next) => {
        try {
            const data = await this.orderService.listOrders(req.query, resolveRestaurantId(req));
            res.status(200).json({ success: true, count: data.length, data });
        } catch (error) {
            next(error);
        }
    };

    getOrderById = async (req, res, next) => {
        try {
            const data = await this.orderService.getById(req.params.id, resolveRestaurantId(req));
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    };

    updateOrderStatus = async (req, res, next) => {
        try {
            const data = await this.orderService.updateStatus(req.params.id, req.body.status, resolveRestaurantId(req));
            res.status(200).json({ success: true, message: 'Statut de commande mis a jour', data });
        } catch (error) {
            next(error);
        }
    };
}

module.exports = OrderController;
