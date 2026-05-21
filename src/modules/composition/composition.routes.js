const express = require('express');
const verifyFirebaseToken = require('../../shared/middlewares/verifyFirebaseToken');
const requireTenantScope = require('../../shared/middlewares/requireTenantScope');
const resolveSaasScope = require('../../shared/middlewares/resolveSaasScope');
const requireRole = require('../../shared/middlewares/requireRole');
const validateRequest = require('../../shared/middlewares/validateRequest');
const { createCompositionSchema, updateCompositionSchema } = require('./composition.schema');

const authBusinessScope = [verifyFirebaseToken, requireTenantScope(), resolveSaasScope({ allowMissing: true })];

module.exports = ({ compositionController }) => {
    const router = express.Router();

    // Lecture des compositions - Public
    router.get('/', compositionController.listCompositions);
    router.get('/:id', compositionController.getCompositionById);
    
    // Création - Admin, Menu Manager
    router.post(
        '/',
        ...authBusinessScope,
        requireRole(['admin', 'menu_manager']),
        validateRequest(createCompositionSchema),
        compositionController.createComposition
    );
    
    // Mise à jour - Admin, Menu Manager
    router.put(
        '/:id',
        ...authBusinessScope,
        requireRole(['admin', 'menu_manager']),
        validateRequest(updateCompositionSchema),
        compositionController.updateComposition
    );
    
    // Suppression - Admin uniquement
    router.delete(
        '/:id',
        ...authBusinessScope,
        requireRole(['admin', 'menu_manager']),
        compositionController.deleteComposition
    );

    return router;
};
