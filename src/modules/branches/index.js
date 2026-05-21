const BranchesRepository = require('./branches.repository');
const BranchesService = require('./branches.service');
const BranchesController = require('./branches.controller');
const createBranchesRoutes = require('./branches.routes');

module.exports = ({ organizationsRepository }) => {
    const branchesRepository = new BranchesRepository();
    const branchesService = new BranchesService({ branchesRepository, organizationsRepository });
    const branchesController = new BranchesController({ branchesService });

    return {
        branchesRepository,
        branchesService,
        branchesController,
        router: createBranchesRoutes({ branchesController })
    };
};
