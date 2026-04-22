const createAuthModule = require('./auth');
const createUserModule = require('./user');
const createCompositionModule = require('./composition');
const createCategoryModule = require('./category');
const createOrderModule = require('./order');
const createPlatModule = require('./plat');
const createTableModule = require('./table');
const createSessionModule = require('./session');

module.exports = () => {
    const authModule = createAuthModule();
    const userModule = createUserModule();
    const compositionModule = createCompositionModule();
    const categoryModule = createCategoryModule();
    const orderModule = createOrderModule();
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
        compositionModule,
        categoryModule,
        orderModule,
        platModule,
        tableModule,
        sessionModule
    };
};
