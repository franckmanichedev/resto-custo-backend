const crypto = require('crypto');

module.exports = function requestContext(req, res, next) {
    const incoming = req.headers['x-request-id'] || req.headers['x-correlation-id'];
    const requestId = typeof incoming === 'string' && incoming.trim()
        ? incoming.trim().slice(0, 128)
        : crypto.randomUUID();

    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
};
