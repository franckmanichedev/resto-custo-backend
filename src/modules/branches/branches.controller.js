class BranchesController {
    constructor({ branchesService }) {
        this.branchesService = branchesService;
    }

    create = async (req, res, next) => {
        try {
            const data = await this.branchesService.create(req.body);
            res.status(201).json({ success: true, message: 'Branche creee avec succes', data });
        } catch (error) {
            next(error);
        }
    };

    list = async (req, res, next) => {
        try {
            const data = await this.branchesService.list(req.query);
            res.status(200).json({ success: true, count: data.length, data });
        } catch (error) {
            next(error);
        }
    };

    getById = async (req, res, next) => {
        try {
            const data = await this.branchesService.getById(req.params.id);
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    };

    update = async (req, res, next) => {
        try {
            const data = await this.branchesService.update(req.params.id, req.body);
            res.status(200).json({ success: true, message: 'Branche mise a jour avec succes', data });
        } catch (error) {
            next(error);
        }
    };

    delete = async (req, res, next) => {
        try {
            await this.branchesService.delete(req.params.id);
            res.status(200).json({ success: true, message: 'Branche desactivee avec succes' });
        } catch (error) {
            next(error);
        }
    };
}

module.exports = BranchesController;
