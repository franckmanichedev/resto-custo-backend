const { resolveRestaurantId } = require('../../shared/utils/tenant');

class CategoryController {
    constructor({ categoryService }) {
        this.categoryService = categoryService;
    }

    createCategory = async (req, res, next) => {
        try {
            const data = await this.categoryService.createCategory(req.body, req.file, resolveRestaurantId(req));
            res.status(201).json({ success: true, message: 'Categorie creee avec succes', data });
        } catch (error) {
            next(error);
        }
    };

    listCategories = async (req, res, next) => {
        try {
            const data = await this.categoryService.listCategories(req.query, resolveRestaurantId(req));
            res.status(200).json({ success: true, count: data.length, data });
        } catch (error) {
            next(error);
        }
    };

    getCategoryById = async (req, res, next) => {
        try {
            const data = await this.categoryService.getCategoryById(req.params.id, resolveRestaurantId(req));
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    };

    updateCategory = async (req, res, next) => {
        try {
            const data = await this.categoryService.updateCategory(req.params.id, req.body, req.file, resolveRestaurantId(req));
            res.status(200).json({ success: true, message: 'Categorie mise a jour avec succes', data });
        } catch (error) {
            next(error);
        }
    };

    deleteCategory = async (req, res, next) => {
        try {
            await this.categoryService.deleteCategory(req.params.id, resolveRestaurantId(req));
            res.status(200).json({ success: true, message: 'Categorie supprimee avec succes' });
        } catch (error) {
            next(error);
        }
    };

    createTypeCategory = async (req, res, next) => {
        try {
            const data = await this.categoryService.createTypeCategory(req.body, req.file, resolveRestaurantId(req));
            res.status(201).json({ success: true, message: 'Type de categorie cree avec succes', data });
        } catch (error) {
            next(error);
        }
    };

    listTypeCategories = async (req, res, next) => {
        try {
            const data = await this.categoryService.listTypeCategories(req.query, resolveRestaurantId(req));
            res.status(200).json({ success: true, count: data.length, data });
        } catch (error) {
            next(error);
        }
    };

    getTypeCategoryById = async (req, res, next) => {
        try {
            const data = await this.categoryService.getTypeCategoryById(req.params.id, resolveRestaurantId(req));
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    };

    updateTypeCategory = async (req, res, next) => {
        try {
            const data = await this.categoryService.updateTypeCategory(req.params.id, req.body, req.file, resolveRestaurantId(req));
            res.status(200).json({ success: true, message: 'Type de categorie mis a jour avec succes', data });
        } catch (error) {
            next(error);
        }
    };

    deleteTypeCategory = async (req, res, next) => {
        try {
            await this.categoryService.deleteTypeCategory(req.params.id, resolveRestaurantId(req));
            res.status(200).json({ success: true, message: 'Type de categorie supprime avec succes' });
        } catch (error) {
            next(error);
        }
    };
}

module.exports = CategoryController;
