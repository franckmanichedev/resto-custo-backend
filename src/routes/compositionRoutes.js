const express = require('express');
const compositionController = require('../controller/compositionController');
const verifyFirebaseToken = require('../middlewares/verifyFirebaseToken');
const requireRole = require('../middlewares/requireRole');
const validateRequest = require('../middlewares/validateRequest');
const {
    createCompositionSchema,
    updateCompositionSchema
} = require('../config/validationSchemas');

const router = express.Router();

router.get('/', compositionController.listCompositions);
router.get('/:id', compositionController.getCompositionById);

router.post(
    '/',
    verifyFirebaseToken,
    requireRole(['admin']),
    validateRequest(createCompositionSchema),
    compositionController.createComposition
);

router.put(
    '/:id',
    verifyFirebaseToken,
    requireRole(['admin']),
    validateRequest(updateCompositionSchema),
    compositionController.updateComposition
);

router.delete(
    '/:id',
    verifyFirebaseToken,
    requireRole(['admin']),
    compositionController.deleteComposition
);

module.exports = router;
