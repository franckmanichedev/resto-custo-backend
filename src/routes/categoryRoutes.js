const express = require('express');
const categoryController = require('../controller/categoryController');
const verifyFirebaseToken = require('../middlewares/verifyFirebaseToken');
const requireRole = require('../middlewares/requireRole');
const validateRequest = require('../middlewares/validateRequest');
const {
    createCategorySchema,
    updateCategorySchema,
    createTypeCategorySchema,
    updateTypeCategorySchema
} = require('../config/validationSchemas');

const router = express.Router();

router.get('/types/all', categoryController.listTypeCategories);
router.get('/types/all/:id', categoryController.getTypeCategoryById);
router.post('/types/all', verifyFirebaseToken, requireRole(['admin']), validateRequest(createTypeCategorySchema), categoryController.createTypeCategory);
router.put('/types/all/:id', verifyFirebaseToken, requireRole(['admin']), validateRequest(updateTypeCategorySchema), categoryController.updateTypeCategory);
router.delete('/types/all/:id', verifyFirebaseToken, requireRole(['admin']), categoryController.deleteTypeCategory);

router.get('/', categoryController.listCategories);
router.post('/', verifyFirebaseToken, requireRole(['admin']), validateRequest(createCategorySchema), categoryController.createCategory);
router.get('/:id/types', async (req, res, next) => {
    req.query.categorie_id = req.params.id;
    return categoryController.listTypeCategories(req, res, next);
});
router.get('/:id', categoryController.getCategoryById);
router.put('/:id', verifyFirebaseToken, requireRole(['admin']), validateRequest(updateCategorySchema), categoryController.updateCategory);
router.delete('/:id', verifyFirebaseToken, requireRole(['admin']), categoryController.deleteCategory);

module.exports = router;
