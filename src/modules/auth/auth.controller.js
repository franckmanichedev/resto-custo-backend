class AuthController {
    constructor({ authService, userController, saasAuthOnboardingService }) {
        this.authService = authService;
        this.userController = userController;
        this.saasAuthOnboardingService = saasAuthOnboardingService;
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
            const result = await this.authService.signup(req.body, {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                requestId: req.requestId
            });
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

    registerOrganization = async (req, res, next) => {
        try {
            const result = await this.saasAuthOnboardingService.registerOrganization(req.body, {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                requestId: req.requestId
            });
            res.status(result.statusCode).json({
                success: true,
                message: result.message,
                data: result.data
            });
        } catch (error) {
            next(error);
        }
    };

    registerFranchise = async (req, res, next) => {
        try {
            const result = await this.saasAuthOnboardingService.registerFranchise(req.body, {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                requestId: req.requestId
            });
            res.status(result.statusCode).json({
                success: true,
                message: result.message,
                data: result.data
            });
        } catch (error) {
            next(error);
        }
    };

    createInvitation = async (req, res, next) => {
        try {
            const result = await this.saasAuthOnboardingService.createInvitation(req.body, req.user, {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                requestId: req.requestId
            });
            res.status(result.statusCode).json({
                success: true,
                message: result.message,
                data: result.data
            });
        } catch (error) {
            next(error);
        }
    };

    revokeInvitation = async (req, res, next) => {
        try {
            const result = await this.saasAuthOnboardingService.revokeInvitation(req.params.id, req.user, {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                requestId: req.requestId
            });
            res.status(200).json({
                success: true,
                message: result.message,
                data: result.data
            });
        } catch (error) {
            next(error);
        }
    };

    acceptInvitation = async (req, res, next) => {
        try {
            const result = await this.saasAuthOnboardingService.acceptInvitation(req.body, {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                requestId: req.requestId
            });
            res.status(result.statusCode).json({
                success: true,
                message: result.message,
                data: result.data
            });
        } catch (error) {
            next(error);
        }
    };

    bootstrapPlatformOwner = async (req, res, next) => {
        try {
            const result = await this.saasAuthOnboardingService.bootstrapPlatformOwner(req.body, {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                requestId: req.requestId
            });
            res.status(result.statusCode).json({
                success: true,
                message: result.message,
                data: result.data
            });
        } catch (error) {
            next(error);
        }
    };

    resendVerificationEmail = async (req, res, next) => {
        try {
            const result = await this.authService.resendVerificationEmail(req.body, {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                requestId: req.requestId
            });
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    };

    requestPasswordReset = async (req, res, next) => {
        try {
            const result = await this.authService.requestPasswordReset(req.body, {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                requestId: req.requestId
            });
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    };

    confirmPasswordReset = async (req, res, next) => {
        try {
            const result = await this.authService.confirmPasswordReset(req.body, {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                requestId: req.requestId
            });
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    };

    validateResetCode = async (req, res, next) => {
        try {
            const result = await this.authService.validateResetCode(req.body.oobCode);
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    };

    applyAction = async (req, res, next) => {
        try {
            const result = await this.authService.applyAction(req.body.code);
            res.status(200).json(result);
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
            const result = await this.authService.login(req.body, {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                requestId: req.requestId
            });
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
            const result = await this.saasAuthOnboardingService.getMe(req.user);
            res.status(200).json(result);
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
