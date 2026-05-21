const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = require('./shared/utils/logger');
const { corsOptions } = require('./config/cors');
const createModules = require('./modules');
const createContextRouters = require('./routes/contextRouters');

const modules = createModules();
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
const {
    platformRouter,
    restaurantRouter,
    clientRouter
} = createContextRouters(modules);

const verifyFirebaseToken = require('./shared/middlewares/verifyFirebaseToken');
const requireTenantScope = require('./shared/middlewares/requireTenantScope');
const resolveSaasScope = require('./shared/middlewares/resolveSaasScope');
const requestContext = require('./shared/middlewares/requestContext');

const app = express();

const corsMiddleware = cors(corsOptions);
app.use(corsMiddleware);
app.options(/.*/, corsMiddleware);

const frontendRoot = path.resolve(__dirname, '../../resto-qrcode-frontend');
const frontendPublicRoot = path.join(frontendRoot, 'public');
const frontendSrcRoot = path.join(frontendRoot, 'src');
const API_PREFIXES = ['/api', '/api/v1'];

// Serve the public pages at `/client/...` and keep source modules available at `/src/...`.
app.use('/src', express.static(frontendSrcRoot));
app.use('/public', express.static(frontendPublicRoot));
app.use(express.static(frontendPublicRoot));

// Serve static files from the frontend
app.use(express.static(path.resolve(__dirname, '../../resto-qrcode-frontend')));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestContext);
app.use(resolveSaasScope({ allowMissing: true }));

app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        contentType: req.headers['content-type'],
        requestId: req.requestId
    });
    next();
});

API_PREFIXES.forEach((prefix) => {
    app.use(`${prefix}/platform`, platformRouter);
    // Protect restaurant context routes: require authenticated user within tenant scope
    app.use(`${prefix}/restaurant`, verifyFirebaseToken, requireTenantScope(), resolveSaasScope({ allowMissing: true }), restaurantRouter);
    // Client context remains public (used by public frontend)
    app.use(`${prefix}/client`, clientRouter);

    app.use(`${prefix}/auth`, authModule.router);
    app.use(`${prefix}/users`, userModule.router);
    app.use(`${prefix}/plats`, platModule.router);
    app.use(`${prefix}/compositions`, compositionModule.router);
    app.use(`${prefix}/categories`, categoryModule.router);
    app.use(`${prefix}/tables`, tableModule.router);
    app.use(`${prefix}/front-office`, sessionModule.router);
    app.use(`${prefix}/orders`, orderModule.router);

    app.get(`${prefix}/health`, (req, res) => {
        res.status(200).json({ status: 'OK', message: 'Serveur en cours d\'execution' });
    });
});

// Error handler middleware (doit être après toutes les routes)
const errorHandler = require('./shared/middlewares/errorHandler');
app.use(errorHandler);

app.use((err, req, res, next) => {
    logger.error('Erreur non gérée', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method
    });

    res.status(err.statusCode || err.status || 500).json({
        success: false,
        message: err.message || 'Une erreur interne s\'est produite',
        ...(err.details ? { details: err.details } : {}),
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

app.use((req, res) => {
    logger.warn('Route not found', { path: req.path, method: req.method });
    res.status(404).json({
        success: false,
        message: 'Route non trouvee'
    });
});

module.exports = app;
