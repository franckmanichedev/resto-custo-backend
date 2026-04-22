const { resolveRestaurantId } = require('../../shared/utils/tenant');

class PlatController {
    constructor({ platService }) {
        this.platService = platService;
    }

    createPlat = async (req, res, next) => {
        try {
            const data = await this.platService.create(req.body, req.file, resolveRestaurantId(req));
            res.status(201).json({ success: true, message: 'Plat cree avec succes', data });
        } catch (error) {
            next(error);
        }
    };

    listPlats = async (req, res, next) => {
        try {
            const data = await this.platService.list(req.query, resolveRestaurantId(req));
            res.status(200).json({ success: true, count: data.length, data });
        } catch (error) {
            next(error);
        }
    };

    getPlatById = async (req, res, next) => {
        try {
            const data = await this.platService.getById(req.params.id, resolveRestaurantId(req));
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    };

    updatePlat = async (req, res, next) => {
        try {
            const data = await this.platService.update(req.params.id, req.body, req.file, resolveRestaurantId(req));
            res.status(200).json({ success: true, message: 'Plat mis a jour avec succes', data });
        } catch (error) {
            next(error);
        }
    };

    deletePlat = async (req, res, next) => {
        try {
            await this.platService.delete(req.params.id, resolveRestaurantId(req));
            res.status(200).json({ success: true, message: 'Plat supprime avec succes' });
        } catch (error) {
            next(error);
        }
    };

    togglePlatAvailability = async (req, res, next) => {
        try {
            const data = await this.platService.toggleAvailability(req.params.id, resolveRestaurantId(req));
            res.status(200).json({ success: true, message: 'Disponibilite mise a jour avec succes', data });
        } catch (error) {
            next(error);
        }
    };
}

module.exports = PlatController;
