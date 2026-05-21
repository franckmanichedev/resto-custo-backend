class ImpersonationController {
    constructor({ impersonationService }) {
        this.impersonationService = impersonationService;
    }

    start = async (req, res, next) => {
        try {
            const data = await this.impersonationService.start(req.user, req.body);
            res.status(201).json({ success: true, message: 'Impersonation demarree', data });
        } catch (error) {
            next(error);
        }
    };

    end = async (req, res, next) => {
        try {
            const data = await this.impersonationService.end(req.user, req.params.id);
            res.status(200).json({ success: true, message: 'Impersonation terminee', data });
        } catch (error) {
            next(error);
        }
    };
}

module.exports = ImpersonationController;
