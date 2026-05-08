const express = require('express');
const verifyFirebaseToken = require('../../shared/middlewares/verifyFirebaseToken');
const requireTenantScope = require('../../shared/middlewares/requireTenantScope');
const requireRole = require('../../shared/middlewares/requireRole');

module.exports = ({ clientsController }) => {
    const router = express.Router();

    // Liste des clients enrichie (RFM-like)
    router.get('/', verifyFirebaseToken, requireTenantScope(), requireRole(['admin']), clientsController.listClients);

    return router;
};
