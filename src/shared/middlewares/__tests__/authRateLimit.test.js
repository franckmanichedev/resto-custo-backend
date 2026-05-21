const AppError = require('../../errors/AppError');
const { createRateLimiter, __resetAuthRateLimitBuckets } = require('../authRateLimit');

const createReq = (email = 'owner@example.com') => ({
    ip: '127.0.0.1',
    headers: {},
    body: { email },
    user: null,
    requestId: 'req_1',
    socket: {}
});

const createRes = () => ({
    headers: {},
    setHeader(key, value) {
        this.headers[key] = value;
    }
});

describe('authRateLimit middleware', () => {
    beforeEach(() => {
        __resetAuthRateLimitBuckets();
        delete process.env.DISABLE_AUTH_RATE_LIMIT;
    });

    test('bloque au-dela du seuil avec Retry-After', () => {
        const limiter = createRateLimiter({
            scope: 'test',
            windowMs: 60_000,
            max: 2,
            cooldownMs: 30_000
        });
        const next = jest.fn();
        const res = createRes();

        limiter(createReq(), res, next);
        limiter(createReq(), res, next);
        limiter(createReq(), res, next);

        expect(next).toHaveBeenCalledTimes(3);
        const error = next.mock.calls[2][0];
        expect(error).toBeInstanceOf(AppError);
        expect(error.statusCode).toBe(429);
        expect(res.headers['Retry-After']).toBe('30');
    });

    test('isole les buckets par email', () => {
        const limiter = createRateLimiter({
            scope: 'test',
            windowMs: 60_000,
            max: 1,
            cooldownMs: 30_000
        });
        const next = jest.fn();

        limiter(createReq('a@example.com'), createRes(), next);
        limiter(createReq('b@example.com'), createRes(), next);

        expect(next).toHaveBeenCalledWith();
        expect(next).toHaveBeenCalledTimes(2);
    });
});
