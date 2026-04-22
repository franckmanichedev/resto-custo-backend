const PlatRepository = require('./plat.repository');
const PlatService = require('./plat.service');
const PlatController = require('./plat.controller');
const createPlatRoutes = require('./plat.routes');
const storageService = require('../../infrastructure/storage/firebaseStorage');

module.exports = ({ compositionRepository, categoryRepository }) => {
    const platRepository = new PlatRepository();
    const platService = new PlatService({
        platRepository,
        compositionRepository,
        categoryRepository,
        storageService
    });
    const platController = new PlatController({ platService });

    return {
        platRepository,
        platService,
        platController,
        router: createPlatRoutes({ platController })
    };
};
