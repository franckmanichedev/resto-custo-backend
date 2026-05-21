const { db } = require('../../infrastructure/firebase/firebaseAdmin');
const logger = require('../../shared/utils/logger');
const ImpersonationService = require('../../services/impersonationService');
const ImpersonationController = require('./impersonation.controller');
const createImpersonationRoutes = require('./impersonation.routes');

module.exports = () => {
    const impersonationService = new ImpersonationService({ db, logger });
    const impersonationController = new ImpersonationController({ impersonationService });

    return {
        impersonationService,
        impersonationController,
        router: createImpersonationRoutes({ impersonationController })
    };
};
