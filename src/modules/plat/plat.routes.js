const express = require('express');
const multer = require('multer');
const verifyFirebaseToken = require('../../shared/middlewares/verifyFirebaseToken');
const requireTenantScope = require('../../shared/middlewares/requireTenantScope');
const requireRole = require('../../shared/middlewares/requireRole');
const validateRequest = require('../../shared/middlewares/validateRequest');
const parseMultipartPayload = require('../../shared/middlewares/parseMultipartPayload');
const { createPlatSchema, updatePlatSchema } = require('./plat.schema');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) {
            return cb(null, true);
        }

        return cb(new Error('Seules les images sont autorisees'));
    }
});

module.exports = ({ platController }) => {
    const router = express.Router();

    // Lecture des plats - Public (tous les rôles)
    router.get('/', platController.listPlats);
    router.get('/:id', platController.getPlatById);
    
    // Création de plat - Admin, Menu Manager
    router.post(
        '/',
        verifyFirebaseToken,
        requireTenantScope(),
        requireRole(['admin', 'menu_manager']),
        upload.single('image'),
        parseMultipartPayload,
        validateRequest(createPlatSchema),
        platController.createPlat
    );
    
    // Mise à jour de plat - Admin, Menu Manager
    router.put(
        '/:id',
        verifyFirebaseToken,
        requireTenantScope(),
        requireRole(['admin', 'menu_manager']),
        upload.single('image'),
        parseMultipartPayload,
        validateRequest(updatePlatSchema),
        platController.updatePlat
    );
    
    // Toggle disponibilité - Admin, Menu Manager
    router.patch(
        '/:id/toggle',
        verifyFirebaseToken,
        requireTenantScope(),
        requireRole(['admin', 'menu_manager']),
        platController.togglePlatAvailability
    );
    
    // Suppression de plat - Admin uniquement
    router.delete(
        '/:id',
        verifyFirebaseToken,
        requireTenantScope(),
        requireRole(['admin', 'menu_manager']),
        platController.deletePlat
    );

    return router;
};
