const express = require('express');
const platController = require('../controller/platController');
const verifyFirebaseToken = require('../middlewares/verifyFirebaseToken');
const requireRole = require('../middlewares/requireRole');
const validateRequest = require('../middlewares/validateRequest');
const { createPlatSchema, updatePlatSchema } = require('../config/validationSchemas');

const router = express.Router();

router.get('/', platController.listPlats);
router.get('/:id', platController.getPlatById);

router.post(
    '/',
    verifyFirebaseToken,
    requireRole(['admin']),
    validateRequest(createPlatSchema),
    platController.createPlat
);

router.put(
    '/:id',
    verifyFirebaseToken,
    requireRole(['admin']),
    validateRequest(updatePlatSchema),
    platController.updatePlat
);

router.delete(
    '/:id',
    verifyFirebaseToken,
    requireRole(['admin']),
    platController.deletePlat
);

module.exports = router;
