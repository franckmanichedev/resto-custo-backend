const express = require('express');
const verifyFirebaseToken = require('../shared/middlewares/verifyFirebaseToken');
const requireRole = require('../shared/middlewares/requireRole');
const { ROLES } = require('../shared/constants/roles');

const mountIfAvailable = (router, path, moduleRef) => {
    if (moduleRef?.router) {
        router.use(path, moduleRef.router);
    }
};

module.exports = (modules = {}) => {
    const {
        authModule,
        userModule,
        compositionModule,
        categoryModule,
        orderModule,
        platModule,
        tableModule,
        sessionModule
    } = modules;

    const platformRouter = express.Router();
    platformRouter.get('/health', verifyFirebaseToken, requireRole([
        ROLES.PLATFORM_OWNER,
        ROLES.PLATFORM_ADMIN,
        ROLES.PLATFORM_SUPPORT
    ]), (req, res) => {
        res.status(200).json({
            success: true,
            context: 'platform',
            message: 'Plateforme accessible',
            role: req.user?.role || null
        });
    });

    const restaurantRouter = express.Router();
    mountIfAvailable(restaurantRouter, '/auth', authModule);
    mountIfAvailable(restaurantRouter, '/users', userModule);
    mountIfAvailable(restaurantRouter, '/compositions', compositionModule);
    mountIfAvailable(restaurantRouter, '/categories', categoryModule);
    mountIfAvailable(restaurantRouter, '/plats', platModule);
    mountIfAvailable(restaurantRouter, '/tables', tableModule);
    mountIfAvailable(restaurantRouter, '/orders', orderModule);

    const clientRouter = express.Router();
    mountIfAvailable(clientRouter, '/auth', authModule);
    mountIfAvailable(clientRouter, '/session', sessionModule);
    mountIfAvailable(clientRouter, '/categories', categoryModule);
    mountIfAvailable(clientRouter, '/plats', platModule);
    mountIfAvailable(clientRouter, '/tables', tableModule);
    mountIfAvailable(clientRouter, '/orders', orderModule);

    return {
        platformRouter,
        restaurantRouter,
        clientRouter
    };
};
