// Utility to redact sensitive fields in objects before logging
const sensitiveFields = ['password', 'idToken', 'refreshToken', 'privateKey'];

const sanitize = (obj, depth = 2) => {
    if (depth === 0) return '[REDACTED]';
    if (!obj || typeof obj !== 'object') return obj;

    const sanitized = Array.isArray(obj) ? [...obj] : { ...obj };
    for (const key in sanitized) {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
            sanitized[key] = '[REDACTED]';
        } else if (typeof sanitized[key] === 'object') {
            sanitized[key] = sanitize(sanitized[key], depth - 1);
        }
    }
    return sanitized;
};

module.exports = sanitize;
