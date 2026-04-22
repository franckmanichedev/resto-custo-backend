const env = require('./config/env');
const app = require('./app');
const logger = require('./shared/utils/logger');
const { execSync } = require('child_process');
const path = require('path');

const syncFrontendSrc = () => {
    try {
        const syncScript = path.resolve(__dirname, '../../resto-qrcode-frontend/scripts/sync-public-src.cjs');
        execSync(`node "${syncScript}"`, { stdio: 'inherit' });
    } catch (error) {
        logger.warn('sync-public-src skipped', { error: error.message });
    }
};

const getPublicBaseUrl = () => {
    if (process.env.RENDER_EXTERNAL_URL) {
        return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
    }

    if (process.env.NODE_ENV === 'production') {
        return 'https://resto-custo-backend.onrender.com';
    }

    return `http://localhost:${env.port}`;
};

syncFrontendSrc();

app.listen(env.port, () => {
    logger.info(`Serveur démarré sur ${getPublicBaseUrl()}`);
    logger.info(`API URL: ${getPublicBaseUrl()}/api`);
});
