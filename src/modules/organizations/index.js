const OrganizationsRepository = require('./organizations.repository');
const OrganizationsService = require('./organizations.service');
const OrganizationsController = require('./organizations.controller');
const createOrganizationsRoutes = require('./organizations.routes');

module.exports = () => {
    const organizationsRepository = new OrganizationsRepository();
    const organizationsService = new OrganizationsService({ organizationsRepository });
    const organizationsController = new OrganizationsController({ organizationsService });

    return {
        organizationsRepository,
        organizationsService,
        organizationsController,
        router: createOrganizationsRoutes({ organizationsController })
    };
};
