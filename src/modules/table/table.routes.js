const express = require('express');
const verifyFirebaseToken = require('../../shared/middlewares/verifyFirebaseToken');
const requireTenantScope = require('../../shared/middlewares/requireTenantScope');
const resolveSaasScope = require('../../shared/middlewares/resolveSaasScope');
const requireRole = require('../../shared/middlewares/requireRole');
const validateRequest = require('../../shared/middlewares/validateRequest');
const { createTableSchema, updateTableSchema } = require('./table.schema');

const authBusinessScope = [verifyFirebaseToken, requireTenantScope(), resolveSaasScope({ allowMissing: true })];

module.exports = ({ tableController }) => {
    const router = express.Router();

    // Menu par code QR - Public (pour les clients)
    router.get('/menu/by-code/:qrCode', tableController.getTableMenuByQrCode);
    router.get('/menu/:id', tableController.getTableMenu);
    
    // Gestion des tables - Admin uniquement
    router.get('/', ...authBusinessScope, requireRole('admin'), tableController.listTables);
    router.get('/:id', ...authBusinessScope, requireRole('admin'), tableController.getTableById);
    router.post(
        '/',
        ...authBusinessScope,
        requireRole(['admin', 'menu_manager']),
        validateRequest(createTableSchema),
        tableController.createTable
    );
    router.put(
        '/:id',
        ...authBusinessScope,
        requireRole(['admin', 'menu_manager']),
        validateRequest(updateTableSchema),
        tableController.updateTable
    );
    router.delete(
        '/:id',
        ...authBusinessScope,
        requireRole(['admin', 'menu_manager']),
        tableController.deleteTable
    );

    return router;
};
