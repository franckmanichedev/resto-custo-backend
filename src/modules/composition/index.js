const CompositionRepository = require('./composition.repository');
const CompositionService = require('./composition.service');
const CompositionController = require('./composition.controller');
const createCompositionRoutes = require('./composition.routes');

module.exports = () => {
    const compositionRepository = new CompositionRepository();
    const compositionService = new CompositionService({ compositionRepository });
    const compositionController = new CompositionController({ compositionService });

    return {
        compositionRepository,
        compositionService,
        compositionController,
        router: createCompositionRoutes({ compositionController })
    };
};
