const { resolveRestaurantId } = require('../../shared/utils/tenant');

class SessionController {
    constructor({ sessionService }) {
        this.sessionService = sessionService;
    }

    startTableSession = async (req, res, next) => {
        try {
            const result = await this.sessionService.startTableSession(req.body, resolveRestaurantId(req));
            res.status(result.statusCode).json({ success: true, message: result.message, data: result.data });
        } catch (error) {
            next(error);
        }
    };

    getSessionMenu = async (req, res, next) => {
        try {
            const data = await this.sessionService.getSessionMenu(req.params.sessionToken, req.query.day, resolveRestaurantId(req));
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    };

    getPlatDetail = async (req, res, next) => {
        try {
            const data = await this.sessionService.getPlatDetail(req.params.id, req.query, resolveRestaurantId(req));
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    };

    getCart = async (req, res, next) => {
        try {
            const data = await this.sessionService.getCart(req.params.sessionToken, resolveRestaurantId(req));
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    };

    addCartItem = async (req, res, next) => {
        try {
            const data = await this.sessionService.addCartItem(req.body, resolveRestaurantId(req));
            res.status(201).json({ success: true, message: 'Item(s) ajoute(s) au panier', data });
        } catch (error) {
            next(error);
        }
    };

    updateCartItem = async (req, res, next) => {
        try {
            const data = await this.sessionService.updateCartItem(req.params.itemId, req.body, resolveRestaurantId(req));
            res.status(200).json({ success: true, message: 'Element du panier mis a jour', data });
        } catch (error) {
            next(error);
        }
    };

    removeCartItem = async (req, res, next) => {
        try {
            const data = await this.sessionService.removeCartItem(req.params.itemId, req.query.session_token, resolveRestaurantId(req));
            res.status(200).json({ success: true, message: 'Element retire du panier', data });
        } catch (error) {
            next(error);
        }
    };

    createOrder = async (req, res, next) => {
        try {
            const data = await this.sessionService.createOrder(req.body, resolveRestaurantId(req));
            res.status(201).json({ success: true, message: 'Commande envoyee avec succes', data });
        } catch (error) {
            next(error);
        }
    };

    checkoutCart = async (req, res, next) => {
        try {
            const data = await this.sessionService.checkoutCart(req.body, resolveRestaurantId(req));
            res.status(201).json({ success: true, message: 'Commande envoyee a partir du panier', data });
        } catch (error) {
            next(error);
        }
    };

    getOrderStatus = async (req, res, next) => {
        try {
            const data = await this.sessionService.getOrderStatus(req.params.id, req.query.session_token, resolveRestaurantId(req));
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    };

    listSessionOrders = async (req, res, next) => {
        try {
            const data = await this.sessionService.listSessionOrders(req.query.session_token, resolveRestaurantId(req));
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    };

    terminateSession = async (req, res, next) => {
        try {
            const { sessionId } = req.params;
            const restaurantId = resolveRestaurantId(req);
            const result = await this.sessionService.forceTerminateSession(sessionId, restaurantId);
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    };
}

module.exports = SessionController;
