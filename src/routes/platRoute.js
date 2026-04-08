const express = require('express');
const platController = require('../controller/platController');
const verifyFirebaseToken = require('../middlewares/verifyFirebaseToken');
const requireRole = require('../middlewares/requireRole');
const validateRequest = require('../middlewares/validateRequest');
const parseMultipartPayload = require('../middlewares/parseMultipartPayload');
const { createPlatSchema, updatePlatSchema } = require('../config/validationSchemas');
const multer = require('multer');

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) {
            return cb(null, true);
        }

        return cb(new Error('Seules les images sont autorisees'));
    }
});

router.get('/', platController.listPlats);
router.get('/:id', platController.getPlatById);

router.post(
    '/',
    verifyFirebaseToken,
    requireRole(['admin']),
    upload.single('image'),
    parseMultipartPayload,
    validateRequest(createPlatSchema),
    platController.createPlat
);

router.put(
    '/:id',
    verifyFirebaseToken,
    requireRole(['admin']),
    upload.single('image'),
    parseMultipartPayload,
    validateRequest(updatePlatSchema),
    platController.updatePlat
);

router.patch(
    '/:id/toggle',
    verifyFirebaseToken,
    requireRole(['admin']),
    platController.togglePlatAvailability
);

router.delete(
    '/:id',
    verifyFirebaseToken,
    requireRole(['admin']),
    platController.deletePlat
);

module.exports = router;
