const express = require('express');
const verifyFirebaseToken = require('../../shared/middlewares/verifyFirebaseToken');
const requireRole = require('../../shared/middlewares/requireRole');
const validateRequest = require('../../shared/middlewares/validateRequest');
const { updateOrderStatusSchema } = require('./order.schema');

module.exports = ({ orderController }) => {
    const router = express.Router();

    // Gestion des commandes - Admin, Kitchen Staff
    router.get('/', verifyFirebaseToken, requireRole(['admin', 'kitchen_staff']), orderController.listOrders);
    router.get('/:id', verifyFirebaseToken, requireRole(['admin', 'kitchen_staff']), orderController.getOrderById);
    
    // Mise à jour du statut - Admin, Kitchen Staff
    router.put(
        '/:id/status',
        verifyFirebaseToken,
        requireRole(['admin', 'kitchen_staff']),
        validateRequest(updateOrderStatusSchema),
        orderController.updateOrderStatus
    );

    return router;
};
