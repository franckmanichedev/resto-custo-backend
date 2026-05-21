const AuthRepository = require('./auth.repository');
const AuthService = require('./auth.service');
const AuthController = require('./auth.controller');
const UserRepository = require('../user/user.repository');
const UserService = require('../user/user.service');
const UserController = require('../user/user.controller');
const AuthLoggerService = require('./services/authLogger.service');
const FirebaseAuthService = require('./services/firebaseAuth.service');
const SaaSAuthOnboardingService = require('./services/saasAuthOnboarding.service');
const createAuthRoutes = require('./auth.routes');
const env = require('../../config/env');
const { db } = require('../../infrastructure/firebase/firebaseAdmin');
const logger = require('../../shared/utils/logger');

module.exports = () => {
    const userRepository = new UserRepository();
    const authRepository = new AuthRepository();
    const authLoggerService = new AuthLoggerService({ db, logger });
    const firebaseAuthService = new FirebaseAuthService({ db, logger });
    const userService = new UserService({ userRepository });
    const userController = new UserController({ userService });
    const authService = new AuthService({
        authRepository,
        userRepository,
        firebaseApiKey: env.firebaseApiKey,
        authLoggerService,
        firebaseAuthService
    });
    const saasAuthOnboardingService = new SaaSAuthOnboardingService({
        db,
        logger,
        authRepository,
        userRepository,
        firebaseAuthService,
        authLoggerService,
        authService
    });
    const authController = new AuthController({
        authService,
        userController,
        saasAuthOnboardingService
    });

    return {
        authController,
        authService,
        saasAuthOnboardingService,
        router: createAuthRoutes({ authController })
    };
};
