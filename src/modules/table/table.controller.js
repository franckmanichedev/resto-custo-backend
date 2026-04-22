const { resolveRestaurantId } = require('../../shared/utils/tenant');

class TableController {
    constructor({ tableService }) {
        this.tableService = tableService;
    }

    createTable = async (req, res, next) => {
        try {
            const data = await this.tableService.create(req.body, resolveRestaurantId(req));
            res.status(201).json({ success: true, message: 'Table creee avec succes', data });
        } catch (error) {
            next(error);
        }
    };

    listTables = async (req, res, next) => {
        try {
            const data = await this.tableService.list(resolveRestaurantId(req));
            res.status(200).json({ success: true, count: data.length, data });
        } catch (error) {
            next(error);
        }
    };

    getTableById = async (req, res, next) => {
        try {
            const data = await this.tableService.getById(req.params.id, resolveRestaurantId(req));
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    };

    updateTable = async (req, res, next) => {
        try {
            const data = await this.tableService.update(req.params.id, req.body, resolveRestaurantId(req));
            res.status(200).json({ success: true, message: 'Table mise a jour avec succes', data });
        } catch (error) {
            next(error);
        }
    };

    deleteTable = async (req, res, next) => {
        try {
            await this.tableService.delete(req.params.id, resolveRestaurantId(req));
            res.status(200).json({ success: true, message: 'Table supprimee avec succes' });
        } catch (error) {
            next(error);
        }
    };

    getTableMenu = async (req, res, next) => {
        try {
            const data = await this.tableService.getMenu(req.params.id, resolveRestaurantId(req));
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    };

    getTableMenuByQrCode = async (req, res, next) => {
        try {
            const data = await this.tableService.getMenuByQrCode(req.params.qrCode, resolveRestaurantId(req));
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    };
}

module.exports = TableController;
