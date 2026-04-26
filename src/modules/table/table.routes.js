const express = require('express');
const verifyFirebaseToken = require('../../shared/middlewares/verifyFirebaseToken');
const requireTenantScope = require('../../shared/middlewares/requireTenantScope');
const requireRole = require('../../shared/middlewares/requireRole');
const validateRequest = require('../../shared/middlewares/validateRequest');
const { createTableSchema, updateTableSchema } = require('./table.schema');

module.exports = ({ tableController }) => {
    const router = express.Router();

    // Menu par code QR - Public (pour les clients)
    router.get('/menu/by-code/:qrCode', tableController.getTableMenuByQrCode);
    router.get('/menu/:id', tableController.getTableMenu);
    
    // Gestion des tables - Admin uniquement
    router.get('/', verifyFirebaseToken, requireTenantScope(), requireRole('admin'), tableController.listTables);
    router.get('/:id', verifyFirebaseToken, requireTenantScope(), requireRole('admin'), tableController.getTableById);
    router.post(
        '/',
        verifyFirebaseToken,
        requireTenantScope(),
        requireRole(['admin', 'menu_manager']),
        validateRequest(createTableSchema),
        tableController.createTable
    );
    router.put(
        '/:id',
        verifyFirebaseToken,
        requireTenantScope(),
        requireRole(['admin', 'menu_manager']),
        validateRequest(updateTableSchema),
        tableController.updateTable
    );
    router.delete(
        '/:id',
        verifyFirebaseToken,
        requireTenantScope(),
        requireRole(['admin', 'menu_manager']),
        tableController.deleteTable
    );

    return router;
};
