const express = require('express');
const verifyFirebaseToken = require('../../shared/middlewares/verifyFirebaseToken');
const requireRole = require('../../shared/middlewares/requireRole');
const validateRequest = require('../../shared/middlewares/validateRequest');
const { createCompositionSchema, updateCompositionSchema } = require('./composition.schema');

module.exports = ({ compositionController }) => {
    const router = express.Router();

    // Lecture des compositions - Public
    router.get('/', compositionController.listCompositions);
    router.get('/:id', compositionController.getCompositionById);
    
    // Création - Admin, Menu Manager
    router.post(
        '/',
        verifyFirebaseToken,
        requireRole(['admin', 'menu_manager']),
        validateRequest(createCompositionSchema),
        compositionController.createComposition
    );
    
    // Mise à jour - Admin, Menu Manager
    router.put(
        '/:id',
        verifyFirebaseToken,
        requireRole(['admin', 'menu_manager']),
        validateRequest(updateCompositionSchema),
        compositionController.updateComposition
    );
    
    // Suppression - Admin uniquement
    router.delete(
        '/:id',
        verifyFirebaseToken,
        requireRole(['admin', 'menu_manager']),
        compositionController.deleteComposition
    );

    return router;
};
