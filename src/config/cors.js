const env = require('./env');
const logger = require('../shared/utils/logger');
const AppError = require('../shared/errors/AppError');

const DEFAULT_FRONTEND_URLS = {
    development: 'http://localhost:5173',
    production: 'https://resto-custo.netlify.app'
};

const getFrontendUrl = () => {
    const envName = env.nodeEnv === 'production' ? 'production' : 'development';
    return (
        process.env[`FRONTEND_URL_${envName.toUpperCase()}`] ||
        process.env.FRONTEND_URL ||
        DEFAULT_FRONTEND_URLS[envName]
    );
};

const getAllowedOrigins = () => {
    const envName = env.nodeEnv === 'production' ? 'production' : 'development';
    const origins = new Set([
        getFrontendUrl(),
        process.env.FRONTEND_URL,
        process.env.FRONTEND_URL_DEVELOPMENT,
        process.env.FRONTEND_URL_PRODUCTION
    ].filter(Boolean));

    if (envName === 'development') {
        origins.add('http://localhost:5173');
        origins.add('http://127.0.0.1:5173');
        origins.add('http://localhost:3000');
        origins.add('http://127.0.0.1:3000');
    }

    return [...origins];
};

const corsOptions = {
    origin(origin, callback) {
        const allowedOrigins = getAllowedOrigins();
        const allowed = !origin || allowedOrigins.includes(origin);

        logger.info('CORS origin check', {
            env: env.nodeEnv,
            origin: origin || 'no-origin',
            allowed,
            allowedOrigins
        });

        if (allowed) {
            return callback(null, true);
        }

        return callback(new AppError(`CORS not allowed for origin: ${origin}`, 403));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'x-tenant-id',
        'x-restaurant-id',
        'x-organization-id',
        'x-branch-id'
    ],
    preflightContinue: false,
    optionsSuccessStatus: 204,
    maxAge: 86400
};

module.exports = {
    corsOptions,
    getAllowedOrigins
};
