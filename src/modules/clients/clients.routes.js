const express = require('express');
const verifyFirebaseToken = require('../../shared/middlewares/verifyFirebaseToken');
const requireTenantScope = require('../../shared/middlewares/requireTenantScope');
const resolveSaasScope = require('../../shared/middlewares/resolveSaasScope');
const requireRole = require('../../shared/middlewares/requireRole');

const authBusinessScope = [verifyFirebaseToken, requireTenantScope(), resolveSaasScope({ allowMissing: true })];

module.exports = ({ clientsController }) => {
    const router = express.Router();

    // Liste des clients enrichie (RFM-like)
    router.get('/', ...authBusinessScope, requireRole(['admin']), clientsController.listClients);

    return router;
};
