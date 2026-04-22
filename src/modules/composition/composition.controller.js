const { resolveRestaurantId } = require('../../shared/utils/tenant');

class CompositionController {
    constructor({ compositionService }) {
        this.compositionService = compositionService;
    }

    createComposition = async (req, res, next) => {
        try {
            const data = await this.compositionService.create(req.body, resolveRestaurantId(req));
            res.status(201).json({
                success: true,
                message: 'Composition creee avec succes',
                data
            });
        } catch (error) {
            next(error);
        }
    };

    listCompositions = async (req, res, next) => {
        try {
            const data = await this.compositionService.list(req.query, resolveRestaurantId(req));
            res.status(200).json({ success: true, count: data.length, data });
        } catch (error) {
            next(error);
        }
    };

    getCompositionById = async (req, res, next) => {
        try {
            const data = await this.compositionService.getById(req.params.id, resolveRestaurantId(req));
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    };

    updateComposition = async (req, res, next) => {
        try {
            const data = await this.compositionService.update(req.params.id, req.body, resolveRestaurantId(req));
            res.status(200).json({
                success: true,
                message: 'Composition mise a jour avec succes',
                data
            });
        } catch (error) {
            next(error);
        }
    };

    deleteComposition = async (req, res, next) => {
        try {
            await this.compositionService.delete(req.params.id, resolveRestaurantId(req));
            res.status(200).json({
                success: true,
                message: 'Composition supprimee avec succes'
            });
        } catch (error) {
            next(error);
        }
    };
}

module.exports = CompositionController;
