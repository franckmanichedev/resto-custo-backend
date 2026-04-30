const express = require('express');
const validateRequest = require('../../shared/middlewares/validateRequest');
const { startTableSessionSchema, jsonBodySchema } = require('./session.schema');

module.exports = ({ sessionController }) => {
    const router = express.Router();

    router.post('/session/start', validateRequest(startTableSessionSchema), sessionController.startTableSession);
    router.get('/menu/:sessionToken', sessionController.getSessionMenu);
    router.get('/plats/:id', sessionController.getPlatDetail);
    router.get('/cart/:sessionToken', sessionController.getCart);
    router.post('/cart/items', validateRequest(jsonBodySchema), sessionController.addCartItem);
    router.put('/cart/items/:itemId', validateRequest(jsonBodySchema), sessionController.updateCartItem);
    router.delete('/cart/items/:itemId', sessionController.removeCartItem);
    router.post('/cart/checkout', validateRequest(jsonBodySchema), sessionController.checkoutCart);
    router.post('/orders', validateRequest(jsonBodySchema), sessionController.createOrder);
    router.get('/orders', sessionController.listSessionOrders);
    router.get('/orders/:id', sessionController.getOrderStatus);
    router.post('/session/:sessionId/terminate', sessionController.terminateSession);

    return router;
};
