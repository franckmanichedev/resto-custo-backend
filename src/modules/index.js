const createAuthModule = require('./auth');
const createUserModule = require('./user');
const createCompositionModule = require('./composition');
const createCategoryModule = require('./category');
const createOrderModule = require('./order');
const createClientsModule = require('./clients');
const createPlatModule = require('./plat');
const createTableModule = require('./table');
const createSessionModule = require('./session');
const createOrganizationsModule = require('./organizations');
const createBranchesModule = require('./branches');
const createImpersonationModule = require('./impersonation');

module.exports = () => {
    const authModule = createAuthModule();
    const userModule = createUserModule();
    const organizationsModule = createOrganizationsModule();
    const branchesModule = createBranchesModule({
        organizationsRepository: organizationsModule.organizationsRepository
    });
    const impersonationModule = createImpersonationModule();
    const compositionModule = createCompositionModule();
    const categoryModule = createCategoryModule();
    const orderModule = createOrderModule();
    const clientsModule = createClientsModule({ orderRepository: orderModule.orderRepository });
    const platModule = createPlatModule({
        compositionRepository: compositionModule.compositionRepository,
        categoryRepository: categoryModule.categoryRepository
    });
    const tableModule = createTableModule({
        platService: platModule.platService
    });
    const sessionModule = createSessionModule({
        tableRepository: tableModule.tableRepository,
        platService: platModule.platService,
        orderService: orderModule.orderService
    });

    return {
        authModule,
        userModule,
        organizationsModule,
        branchesModule,
        impersonationModule,
        compositionModule,
        categoryModule,
        orderModule,
        clientsModule,
        platModule,
        tableModule,
        sessionModule
    };
};
