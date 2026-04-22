const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = require('./shared/utils/logger');
const AppError = require('./shared/errors/AppError');
const createModules = require('./modules');

const DEFAULT_FRONTEND_URLS = {
    development: 'http://localhost:3000',
    production: 'https://resto-custo.netlify.app'
};

const getFrontendUrl = () => {
    const env = process.env.NODE_ENV === 'production' ? 'production' : 'development';
    return process.env[`FRONTEND_URL_${env.toUpperCase()}`]
        || process.env.FRONTEND_URL
        || DEFAULT_FRONTEND_URLS[env];
};

const getAllowedOrigins = () => ([
    getFrontendUrl(),
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://192.168.56.1:3000',
    'http://192.168.43.95:3000'
].filter(Boolean));

const {
    authModule,
    userModule,
    compositionModule,
    categoryModule,
    orderModule,
    platModule,
    tableModule,
    sessionModule
} = createModules();

const app = express();
const frontendRoot = path.resolve(__dirname, '../../resto-qrcode-frontend');
const frontendPublicRoot = path.join(frontendRoot, 'public');
const frontendSrcRoot = path.join(frontendRoot, 'src');

// Serve the public pages at `/client/...` and keep source modules available at `/src/...`.
app.use('/src', express.static(frontendSrcRoot));
app.use('/public', express.static(frontendPublicRoot));
app.use(express.static(frontendPublicRoot));

// Serve static files from the frontend
app.use(express.static(path.resolve(__dirname, '../../resto-qrcode-frontend')));

app.use(cors({
    origin(origin, callback) {
        const allowedOrigins = [...new Set(getAllowedOrigins())];

        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new AppError('CORS not allowed', 403));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        contentType: req.headers['content-type']
    });
    next();
});

app.use('/api/auth', authModule.router);
app.use('/api/users', userModule.router);
app.use('/api/plats', platModule.router);
app.use('/api/compositions', compositionModule.router);
app.use('/api/categories', categoryModule.router);
app.use('/api/tables', tableModule.router);
app.use('/api/front-office', sessionModule.router);
app.use('/api/orders', orderModule.router);

app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'Serveur en cours d\'execution' });
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
