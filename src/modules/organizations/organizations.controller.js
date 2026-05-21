class OrganizationsController {
    constructor({ organizationsService }) {
        this.organizationsService = organizationsService;
    }

    create = async (req, res, next) => {
        try {
            const data = await this.organizationsService.create(req.body);
            res.status(201).json({ success: true, message: 'Organisation creee avec succes', data });
        } catch (error) {
            next(error);
        }
    };

    list = async (req, res, next) => {
        try {
            const data = await this.organizationsService.list(req.query);
            res.status(200).json({ success: true, count: data.length, data });
        } catch (error) {
            next(error);
        }
    };

    getById = async (req, res, next) => {
        try {
            const data = await this.organizationsService.getById(req.params.id);
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    };

    update = async (req, res, next) => {
        try {
            const data = await this.organizationsService.update(req.params.id, req.body);
            res.status(200).json({ success: true, message: 'Organisation mise a jour avec succes', data });
        } catch (error) {
            next(error);
        }
    };

    delete = async (req, res, next) => {
        try {
            await this.organizationsService.delete(req.params.id);
            res.status(200).json({ success: true, message: 'Organisation desactivee avec succes' });
        } catch (error) {
            next(error);
        }
    };
}

module.exports = OrganizationsController;
