const AppError = require('../errors/AppError');
const logger = require('../utils/logger');
const { AUTH_EVENTS, AUTH_EVENT_STATUS } = require('../constants/authEvents');

const buckets = new Map();
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const getIp = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || 'unknown-ip';
};

const buildAuthKey = (scope) => (req) => {
    const email = normalizeEmail(req.body?.email || req.body?.data?.email);
    const uid = req.user?.uid || req.user?.id || req.body?.uid || 'anonymous';
    return [
        scope,
        `ip:${getIp(req)}`,
        email ? `email:${email}` : null,
        uid !== 'anonymous' ? `user:${uid}` : null
    ].filter(Boolean).join('|');
};

const cleanup = (now) => {
    for (const [key, bucket] of buckets.entries()) {
        if (bucket.resetAt < now && (!bucket.blockedUntil || bucket.blockedUntil < now)) {
            buckets.delete(key);
        }
    }
};

const createRateLimiter = ({
    scope,
    windowMs,
    max,
    cooldownMs,
    suspiciousThreshold = max * 2,
    keyGenerator = buildAuthKey(scope)
}) => (req, res, next) => {
    if (process.env.DISABLE_AUTH_RATE_LIMIT === 'true') {
        return next();
    }

    const now = Date.now();
    cleanup(now);

    const key = keyGenerator(req);
    const current = buckets.get(key);
    const bucket = current && current.resetAt > now
        ? current
        : { count: 0, resetAt: now + windowMs, blockedUntil: 0, violations: current?.violations || 0 };

    if (bucket.blockedUntil && bucket.blockedUntil > now) {
        const retryAfterSeconds = Math.ceil((bucket.blockedUntil - now) / 1000);
        res.setHeader('Retry-After', String(retryAfterSeconds));
        logger.warn('Auth rate limit blocked request', {
            eventType: AUTH_EVENTS.RATE_LIMIT_BLOCKED,
            status: AUTH_EVENT_STATUS.BLOCKED,
            scope,
            key,
            requestId: req.requestId,
            retryAfterSeconds
        });
        return next(new AppError('Trop de tentatives. Reessayez plus tard.', 429, {
            code: 'AUTH_RATE_LIMITED',
            retryAfterSeconds
        }));
    }

    bucket.count += 1;
    if (bucket.count > max) {
        bucket.violations += 1;
        const penalty = cooldownMs * Math.max(1, bucket.violations);
        bucket.blockedUntil = now + penalty;
        buckets.set(key, bucket);

        const retryAfterSeconds = Math.ceil(penalty / 1000);
        res.setHeader('Retry-After', String(retryAfterSeconds));
        logger.warn('Auth rate limit threshold exceeded', {
            eventType: AUTH_EVENTS.RATE_LIMIT_BLOCKED,
            status: AUTH_EVENT_STATUS.BLOCKED,
            scope,
            key,
            requestId: req.requestId,
            retryAfterSeconds,
            suspicious: bucket.count >= suspiciousThreshold
        });
        return next(new AppError('Trop de tentatives. Reessayez plus tard.', 429, {
            code: 'AUTH_RATE_LIMITED',
            retryAfterSeconds
        }));
    }

    buckets.set(key, bucket);
    return next();
};

module.exports = {
    createRateLimiter,
    authRateLimiters: {
        login: createRateLimiter({ scope: 'login', windowMs: 10 * 60 * 1000, max: 8, cooldownMs: 15 * 60 * 1000 }),
        signup: createRateLimiter({ scope: 'signup', windowMs: 60 * 60 * 1000, max: 6, cooldownMs: 30 * 60 * 1000 }),
        passwordReset: createRateLimiter({ scope: 'password_reset', windowMs: 60 * 60 * 1000, max: 5, cooldownMs: 30 * 60 * 1000 }),
        verification: createRateLimiter({ scope: 'verification', windowMs: 60 * 60 * 1000, max: 5, cooldownMs: 20 * 60 * 1000 }),
        invitation: createRateLimiter({ scope: 'invitation', windowMs: 60 * 60 * 1000, max: 20, cooldownMs: 20 * 60 * 1000 }),
        invitationAccept: createRateLimiter({ scope: 'invitation_accept', windowMs: 60 * 60 * 1000, max: 10, cooldownMs: 20 * 60 * 1000 }),
        bootstrap: createRateLimiter({ scope: 'bootstrap_platform_owner', windowMs: 24 * 60 * 60 * 1000, max: 3, cooldownMs: 24 * 60 * 60 * 1000 })
    },
    __resetAuthRateLimitBuckets: () => buckets.clear()
};
