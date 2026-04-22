const OrderRepository = require('./order.repository');
const OrderService = require('./order.service');
const OrderController = require('./order.controller');
const createOrderRoutes = require('./order.routes');

module.exports = () => {
    const orderRepository = new OrderRepository();
    const orderService = new OrderService({ orderRepository });
    const orderController = new OrderController({ orderService });

    return {
        orderRepository,
        orderService,
        orderController,
        router: createOrderRoutes({ orderController })
    };
};
