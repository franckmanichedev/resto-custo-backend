const express = require('express');
const frontOfficeController = require('../controller/frontOfficeController');

const router = express.Router();

router.post('/session/start', frontOfficeController.startTableSession);
router.get('/menu/:sessionToken', frontOfficeController.getSessionMenu);
router.get('/plats/:id', frontOfficeController.getPlatDetail);
router.get('/cart/:sessionToken', frontOfficeController.getCart);
router.post('/cart/items', frontOfficeController.addCartItem);
router.put('/cart/items/:itemId', frontOfficeController.updateCartItem);
router.delete('/cart/items/:itemId', frontOfficeController.removeCartItem);
router.post('/cart/checkout', frontOfficeController.checkoutCart);
router.post('/orders', frontOfficeController.createOrder);
router.get('/orders', frontOfficeController.listSessionOrders);
router.get('/orders/:id', frontOfficeController.getOrderStatus);

module.exports = router;
