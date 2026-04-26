const express = require('express');
const verifyFirebaseToken = require('../../shared/middlewares/verifyFirebaseToken');
const requireTenantScope = require('../../shared/middlewares/requireTenantScope');
const requireRole = require('../../shared/middlewares/requireRole');
const validateRequest = require('../../shared/middlewares/validateRequest');
const { updateOrderStatusSchema } = require('./order.schema');

module.exports = ({ orderController }) => {
    const router = express.Router();

    // Gestion des commandes - Admin, Kitchen Staff
    router.get('/', verifyFirebaseToken, requireTenantScope(), requireRole(['admin', 'kitchen_staff']), orderController.listOrders);
    router.get('/:id', verifyFirebaseToken, requireTenantScope(), requireRole(['admin', 'kitchen_staff']), orderController.getOrderById);
    
    // Mise à jour du statut - Admin, Kitchen Staff
    router.put(
        '/:id/status',
        verifyFirebaseToken,
        requireTenantScope(),
        requireRole(['admin', 'kitchen_staff']),
        validateRequest(updateOrderStatusSchema),
        orderController.updateOrderStatus
    );

    return router;
};
