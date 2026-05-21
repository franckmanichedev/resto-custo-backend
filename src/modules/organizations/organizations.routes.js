const express = require('express');
const verifyFirebaseToken = require('../../shared/middlewares/verifyFirebaseToken');
const requireRole = require('../../shared/middlewares/requireRole');
const validateRequest = require('../../shared/middlewares/validateRequest');
const resolveSaasScope = require('../../shared/middlewares/resolveSaasScope');
const { ROLES } = require('../../shared/constants/roles');
const { createOrganizationSchema, updateOrganizationSchema } = require('./organizations.schema');

const platformRoles = [ROLES.PLATFORM_OWNER, ROLES.PLATFORM_ADMIN, ROLES.PLATFORM_SUPPORT];
const writeRoles = [ROLES.PLATFORM_OWNER, ROLES.PLATFORM_ADMIN];

module.exports = ({ organizationsController }) => {
    const router = express.Router();

    // Routes SaaS preparatoires: aucune collection metier historique n est modifiee ici.
    router.get('/', verifyFirebaseToken, requireRole(platformRoles), resolveSaasScope(), organizationsController.list);
    router.get('/:id', verifyFirebaseToken, requireRole(platformRoles), resolveSaasScope(), organizationsController.getById);
    router.post(
        '/',
        verifyFirebaseToken,
        requireRole(writeRoles),
        resolveSaasScope(),
        validateRequest(createOrganizationSchema),
        organizationsController.create
    );
    router.put(
        '/:id',
        verifyFirebaseToken,
        requireRole(writeRoles),
        resolveSaasScope(),
        validateRequest(updateOrganizationSchema),
        organizationsController.update
    );
    router.delete('/:id', verifyFirebaseToken, requireRole(ROLES.PLATFORM_OWNER), resolveSaasScope(), organizationsController.delete);

    return router;
};
