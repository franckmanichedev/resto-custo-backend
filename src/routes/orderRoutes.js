const express = require('express');
const orderController = require('../controller/orderController');
const verifyFirebaseToken = require('../middlewares/verifyFirebaseToken');
const requireRole = require('../middlewares/requireRole');

const router = express.Router();

router.get('/', verifyFirebaseToken, requireRole(['admin']), orderController.listOrders);
router.get('/:id', verifyFirebaseToken, requireRole(['admin']), orderController.getOrderById);
router.put('/:id/status', verifyFirebaseToken, requireRole(['admin']), orderController.updateOrderStatus);

module.exports = router;
