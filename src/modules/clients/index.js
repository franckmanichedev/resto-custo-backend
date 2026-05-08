const ClientsService = require('./clients.service');
const ClientsController = require('./clients.controller');
const createClientsRoutes = require('./clients.routes');

module.exports = ({ orderRepository } = {}) => {
    const clientsService = new ClientsService({ orderRepository });
    const clientsController = new ClientsController({ clientsService });

    return {
        clientsService,
        clientsController,
        router: createClientsRoutes({ clientsController })
    };
};
