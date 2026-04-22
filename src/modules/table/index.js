const TableRepository = require('./table.repository');
const TableService = require('./table.service');
const TableController = require('./table.controller');
const createTableRoutes = require('./table.routes');

module.exports = ({ platService }) => {
    const tableRepository = new TableRepository();
    const tableService = new TableService({ tableRepository, platService });
    const tableController = new TableController({ tableService });

    return {
        tableRepository,
        tableService,
        tableController,
        router: createTableRoutes({ tableController })
    };
};
