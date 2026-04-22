const SessionRepository = require('./session.repository');
const SessionService = require('./session.service');
const SessionController = require('./session.controller');
const createSessionRoutes = require('./session.routes');

module.exports = ({ tableRepository, platService, orderService }) => {
    const sessionRepository = new SessionRepository();
    const sessionService = new SessionService({
        sessionRepository,
        tableRepository,
        platService,
        orderService
    });
    const sessionController = new SessionController({ sessionService });

    return {
        sessionRepository,
        sessionService,
        sessionController,
        router: createSessionRoutes({ sessionController })
    };
};
