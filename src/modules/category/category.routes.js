const express = require('express');
const multer = require('multer');
const verifyFirebaseToken = require('../../shared/middlewares/verifyFirebaseToken');
const requireRole = require('../../shared/middlewares/requireRole');
const validateRequest = require('../../shared/middlewares/validateRequest');
const parseMultipartPayload = require('../../shared/middlewares/parseMultipartPayload');
const {
    createCategorySchema,
    updateCategorySchema,
    createTypeCategorySchema,
    updateTypeCategorySchema
} = require('./category.schema');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) {
            return cb(null, true);
        }

        return cb(new Error('Seules les images sont autorisees'));
    }
});

module.exports = ({ categoryController }) => {
    const router = express.Router();

    // Type Catégories - Lecture publique
    router.get('/types/all', categoryController.listTypeCategories);
    router.get('/types/all/:id', categoryController.getTypeCategoryById);
    
    // Type Catégories - Création et modification - Admin, Menu Manager
    router.post(
        '/types/all',
        verifyFirebaseToken,
        requireRole(['admin', 'menu_manager']),
        upload.single('image'),
        parseMultipartPayload,
        validateRequest(createTypeCategorySchema),
        categoryController.createTypeCategory
    );
    router.put(
        '/types/all/:id',
        verifyFirebaseToken,
        requireRole(['admin', 'menu_manager']),
        upload.single('image'),
        parseMultipartPayload,
        validateRequest(updateTypeCategorySchema),
        categoryController.updateTypeCategory
    );
    router.delete(
        '/types/all/:id',
        verifyFirebaseToken,
        requireRole('admin'),
        categoryController.deleteTypeCategory
    );

    // Catégories - Lecture publique
    router.get('/', categoryController.listCategories);
    router.get('/:id', categoryController.getCategoryById);
    
    // Catégories - Création et modification - Admin, Menu Manager
    router.post(
        '/',
        verifyFirebaseToken,
        requireRole(['admin', 'menu_manager']),
        upload.single('image'),
        parseMultipartPayload,
        validateRequest(createCategorySchema),
        categoryController.createCategory
    );
    router.get('/:id/types', async (req, res, next) => {
        try {
            req.query.categorie_id = req.params.id;
            await categoryController.listTypeCategories(req, res);
        } catch (error) {
            next(error);
        }
    });
    router.put(
        '/:id',
        verifyFirebaseToken,
        requireRole(['admin', 'menu_manager']),
        upload.single('image'),
        parseMultipartPayload,
        validateRequest(updateCategorySchema),
        categoryController.updateCategory
    );
    router.delete(
        '/:id',
        verifyFirebaseToken,
        requireRole(['admin', 'menu_manager']),
        categoryController.deleteCategory
    );

    return router;
};
