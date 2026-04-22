const CategoryRepository = require('./category.repository');
const CategoryService = require('./category.service');
const CategoryController = require('./category.controller');
const createCategoryRoutes = require('./category.routes');
const storageService = require('../../infrastructure/storage/firebaseStorage');

module.exports = () => {
    const categoryRepository = new CategoryRepository();
    const categoryService = new CategoryService({ categoryRepository, storageService });
    const categoryController = new CategoryController({ categoryService });

    return {
        categoryRepository,
        categoryService,
        categoryController,
        router: createCategoryRoutes({ categoryController })
    };
};
