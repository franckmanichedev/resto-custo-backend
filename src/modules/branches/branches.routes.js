const express = require('express');
const verifyFirebaseToken = require('../../shared/middlewares/verifyFirebaseToken');
const requireRole = require('../../shared/middlewares/requireRole');
const validateRequest = require('../../shared/middlewares/validateRequest');
const resolveSaasScope = require('../../shared/middlewares/resolveSaasScope');
const { ROLES } = require('../../shared/constants/roles');
const { createBranchSchema, updateBranchSchema } = require('./branches.schema');

const platformRoles = [ROLES.PLATFORM_OWNER, ROLES.PLATFORM_ADMIN, ROLES.PLATFORM_SUPPORT];
const writeRoles = [ROLES.PLATFORM_OWNER, ROLES.PLATFORM_ADMIN];

module.exports = ({ branchesController }) => {
    const router = express.Router();

    // Une branche represente le restaurant operationnel dans l architecture cible.
    router.get('/', verifyFirebaseToken, requireRole(platformRoles), resolveSaasScope(), branchesController.list);
    router.get('/:id', verifyFirebaseToken, requireRole(platformRoles), resolveSaasScope(), branchesController.getById);
    router.post(
        '/',
        verifyFirebaseToken,
        requireRole(writeRoles),
        resolveSaasScope(),
        validateRequest(createBranchSchema),
        branchesController.create
    );
    router.put(
        '/:id',
        verifyFirebaseToken,
        requireRole(writeRoles),
        resolveSaasScope(),
        validateRequest(updateBranchSchema),
        branchesController.update
    );
    router.delete('/:id', verifyFirebaseToken, requireRole(ROLES.PLATFORM_OWNER), resolveSaasScope(), branchesController.delete);

    return router;
};
