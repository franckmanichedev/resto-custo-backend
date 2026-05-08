const env = require('./config/env');
const app = require('./app');
const logger = require('./shared/utils/logger');
const { execSync } = require('child_process');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const socketHelper = require('./shared/socket');

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

const server = http.createServer(app);

// Attach Socket.io
const io = new Server(server, {
    cors: {
        origin: true,
        methods: ['GET', 'POST']
    }
});

socketHelper.init(io);

io.on('connection', (socket) => {
    logger.info('Socket connected', { id: socket.id });

    socket.on('join_room', (room) => {
        try {
            if (!room) return;
            socket.join(room);
            logger.info('Socket joined room', { id: socket.id, room });
        } catch (err) {
            logger.warn('join_room error', { err: err.message });
        }
    });

    socket.on('disconnect', () => {
        logger.info('Socket disconnected', { id: socket.id });
    });
});

server.listen(env.port, () => {
    logger.info(`Serveur démarré sur ${getPublicBaseUrl()}`);
    logger.info(`API URL: ${getPublicBaseUrl()}/api`);
});
