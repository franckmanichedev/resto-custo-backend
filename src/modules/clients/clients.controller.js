class ClientsController {
    constructor({ clientsService }) {
        this.clientsService = clientsService;
        this.listClients = this.listClients.bind(this);
    }

    async listClients(req, res, next) {
        try {
            const restaurantId = req.restaurantId;
            const tenantId = req.tenantId;
            const params = req.query || {};

            const data = await this.clientsService.listClients({ restaurantId, tenantId, params });

            res.status(200).json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = ClientsController;
