const express = require('express');
const tableController = require('../controller/tableController');
const verifyFirebaseToken = require('../middlewares/verifyFirebaseToken');
const requireRole = require('../middlewares/requireRole');
const validateRequest = require('../middlewares/validateRequest');
const { createTableSchema, updateTableSchema } = require('../config/validationSchemas');

const router = express.Router();

router.get('/menu/by-code/:qrCode', tableController.getTableMenuByQrCode);
router.get('/menu/:id', tableController.getTableMenu);

router.get(
    '/',
    verifyFirebaseToken,
    requireRole(['admin']),
    tableController.listTables
);

router.get(
    '/:id',
    verifyFirebaseToken,
    requireRole(['admin']),
    tableController.getTableById
);

router.post(
    '/',
    verifyFirebaseToken,
    requireRole(['admin']),
    validateRequest(createTableSchema),
    tableController.createTable
);

router.put(
    '/:id',
    verifyFirebaseToken,
    requireRole(['admin']),
    validateRequest(updateTableSchema),
    tableController.updateTable
);

router.delete(
    '/:id',
    verifyFirebaseToken,
    requireRole(['admin']),
    tableController.deleteTable
);

module.exports = router;
