require('dotenv').config();
const express = require('express');
const cors = require('cors');
const logger = require('./utils/logger');

// Routes
const authRoutes = require('./routes/authRoutes');
const platRoutes = require('./routes/platRoute');
const compositionRoutes = require('./routes/compositionRoutes');
const tableRoutes = require('./routes/tableRoutes');
const frontOfficeRoutes = require('./routes/frontOfficeRoutes');
const orderRoutes = require('./routes/orderRoutes');

const app = express();
const PORT = process.env.PORT || 5000;
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

const getPublicBaseUrl = () => {
    if (process.env.RENDER_EXTERNAL_URL) {
        return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
    }

    if (process.env.NODE_ENV === 'production') {
        return 'https://resto-custo-backend.onrender.com';
    }

    return `http://localhost:${PORT}`;
};

// =====================================================
// MIDDLEWARES GLOBAUX
// =====================================================

// Configuration CORS flexible pour developpement
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [...new Set(getAllowedOrigins())];

        // En developpement, permettre toutes les origines locales
        if (process.env.NODE_ENV === 'development') {
            return callback(null, true);
        }

        // En production, verifier l'origine
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('CORS not allowed'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logger middleware
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        contentType: req.headers['content-type']
    });
    next();
});

// =====================================================
// ROUTES PUBLIQUES
// =====================================================
app.use('/api/auth', authRoutes);
app.use('/api/plats', platRoutes);
app.use('/api/compositions', compositionRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/front-office', frontOfficeRoutes);
app.use('/api/orders', orderRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// =====================================================
// ERROR HANDLING MIDDLEWARE
// =====================================================
app.use((err, req, res, next) => {
    logger.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method
    });

    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Une erreur interne s\'est produite',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// 404 Handler
app.use((req, res) => {
    logger.warn('Route not found', { path: req.path, method: req.method });
    res.status(404).json({
        success: false,
        message: 'Route non trouvee'
    });
});

// =====================================================
// DEMARRAGE DU SERVEUR
// =====================================================
app.listen(PORT, () => {
    logger.info(`Server listening on ${getPublicBaseUrl()}`);
    logger.info(`API URL: ${getPublicBaseUrl()}/api`);
    logger.info(`Frontend URL: ${getFrontendUrl()}`);
});

module.exports = app;
