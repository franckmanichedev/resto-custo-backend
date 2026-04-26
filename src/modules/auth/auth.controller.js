class AuthController {
    constructor({ authService, userController }) {
        this.authService = authService;
        this.userController = userController;
    }

    createUserFromToken = async (req, res, next) => {
        try {
            const result = await this.authService.createUserFromToken(req.user);
            res.status(result.statusCode).json({ success: true, message: result.message, data: result.data });
        } catch (error) {
            next(error);
        }
    };

    createUserWithEmail = async (req, res, next) => {
        try {
            const result = await this.authService.signup(req.body);
            res.status(result.statusCode).json({
                success: true,
                message: result.message,
                data: result.data,
                customToken: result.customToken,
                idToken: result.idToken,
                refreshToken: result.refreshToken,
                expiresIn: result.expiresIn
            });
        } catch (error) {
            next(error);
        }
    };

    checkEmailExists = async (req, res, next) => {
        try {
            const result = await this.authService.checkEmailExists(req.body.email);
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    };

    loginWithEmailPassword = async (req, res, next) => {
        try {
            const result = await this.authService.login(req.body);
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    };

    logout = async (req, res, next) => {
        try {
            const result = this.authService.logout(req.body);
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    };

    getAuthenticatedUser = async (req, res, next) => {
        try {
            await this.userController.getAuthenticatedProfile(req, res);
        } catch (error) {
            next(error);
        }
    };

    getProfile = async (req, res, next) => {
        try {
            await this.userController.getProfile(req, res);
        } catch (error) {
            next(error);
        }
    };

    updateProfile = async (req, res, next) => {
        try {
            await this.userController.updateProfile(req, res);
        } catch (error) {
            next(error);
        }
    };
}

module.exports = AuthController;
