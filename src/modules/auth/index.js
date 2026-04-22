const AuthRepository = require('./auth.repository');
const AuthService = require('./auth.service');
const AuthController = require('./auth.controller');
const UserRepository = require('../user/user.repository');
const UserService = require('../user/user.service');
const UserController = require('../user/user.controller');
const createAuthRoutes = require('./auth.routes');
const env = require('../../config/env');

module.exports = () => {
    const userRepository = new UserRepository();
    const authRepository = new AuthRepository();
    const userService = new UserService({ userRepository });
    const userController = new UserController({ userService });
    const authService = new AuthService({
        authRepository,
        userRepository,
        firebaseApiKey: env.firebaseApiKey
    });
    const authController = new AuthController({ authService, userController });

    return {
        authController,
        router: createAuthRoutes({ authController })
    };
};
