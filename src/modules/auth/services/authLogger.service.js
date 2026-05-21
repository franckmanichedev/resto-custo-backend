const { AUTH_LOGS } = require('../../../shared/constants/collections');
const {
    AUTH_SEVERITY,
    AUTH_EVENT_STATUS,
    EVENT_DEFAULT_SEVERITY
} = require('../../../shared/constants/authEvents');

class AuthLoggerService {
    constructor({ db, logger }) {
        this.db = db;
        this.logger = logger;
    }

    async logEvent(event = {}) {
        if (!this.db) {
            this.logger?.warn('AuthLoggerService missing db instance', { event });
            return null;
        }

        const payload = {
            eventType: event.eventType || 'auth_event',
            userId: event.userId || null,
            firebaseUid: event.firebaseUid || null,
            actorId: event.actorId || null,
            email: event.email || null,
            role: event.role || null,
            organizationId: event.organizationId || null,
            branchId: event.branchId || null,
            ip: event.ip || null,
            userAgent: event.userAgent || null,
            geolocation: event.geolocation || {
                country: null,
                region: null,
                city: null,
                source: 'placeholder'
            },
            requestId: event.requestId || event.correlationId || null,
            severity: event.severity || EVENT_DEFAULT_SEVERITY[event.eventType] || AUTH_SEVERITY.INFO,
            suspiciousActivity: event.suspiciousActivity === true,
            status: event.status || AUTH_EVENT_STATUS.SUCCESS,
            metadata: event.metadata || {},
            createdAt: new Date().toISOString()
        };

        try {
            await this.db.collection(AUTH_LOGS).add(payload);
            return payload;
        } catch (error) {
            this.logger?.error('Failed to write auth log', {
                errorMessage: error?.message,
                errorCode: error?.code,
                payload
            });
            return null;
        }
    }
}

module.exports = AuthLoggerService;
