const UserRepository = require('./user.repository');
const UserService = require('./user.service');
const UserController = require('./user.controller');
const createUserRoutes = require('./user.routes');

module.exports = () => {
    const userRepository = new UserRepository();
    const userService = new UserService({ userRepository });
    const userController = new UserController({ userService });

    return {
        userController,
        router: createUserRoutes({ userController })
    };
};
