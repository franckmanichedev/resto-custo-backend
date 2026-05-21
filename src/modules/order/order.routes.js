const express = require('express');
const verifyFirebaseToken = require('../../shared/middlewares/verifyFirebaseToken');
const requireTenantScope = require('../../shared/middlewares/requireTenantScope');
const resolveSaasScope = require('../../shared/middlewares/resolveSaasScope');
const requireRole = require('../../shared/middlewares/requireRole');
const validateRequest = require('../../shared/middlewares/validateRequest');
const { updateOrderStatusSchema } = require('./order.schema');

const authBusinessScope = [verifyFirebaseToken, requireTenantScope(), resolveSaasScope({ allowMissing: true })];

module.exports = ({ orderController }) => {
    const router = express.Router();

    // Gestion des commandes - Admin, Kitchen Staff
    router.get('/', ...authBusinessScope, requireRole(['admin', 'kitchen_staff', 'kitchen', 'branch_manager']), orderController.listOrders);
    router.get('/:id', ...authBusinessScope, requireRole(['admin', 'kitchen_staff', 'kitchen', 'branch_manager']), orderController.getOrderById);
    
    // Mise à jour du statut - Admin, Kitchen Staff
    router.put(
        '/:id/status',
        ...authBusinessScope,
        requireRole(['admin', 'kitchen_staff', 'kitchen', 'branch_manager']),
        validateRequest(updateOrderStatusSchema),
        orderController.updateOrderStatus
    );

    return router;
};
