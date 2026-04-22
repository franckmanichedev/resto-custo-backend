class UserController {
    constructor({ userService }) {
        this.userService = userService;
    }

    getProfile = async (req, res, next) => {
        try {
            const user = await this.userService.getById(req.params.id);
            res.status(200).json({ success: true, data: user });
        } catch (error) {
            next(error);
        }
    };

    getAuthenticatedProfile = async (req, res, next) => {
        try {
            const user = await this.userService.getAuthenticatedUser(req.user);
            res.status(200).json({ success: true, data: user });
        } catch (error) {
            next(error);
        }
    };

    updateProfile = async (req, res, next) => {
        try {
            const user = await this.userService.updateProfile(req.params.id, req.body);
            res.status(200).json({
                success: true,
                message: 'Profil utilisateur mis a jour avec succes',
                data: user
            });
        } catch (error) {
            next(error);
        }
    };
}

module.exports = UserController;
