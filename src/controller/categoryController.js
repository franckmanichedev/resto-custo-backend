const { db } = require('../config/firebase');
const logger = require('../utils/logger');

const CATEGORY_COLLECTION = 'categories';
const TYPE_CATEGORY_COLLECTION = 'type_categories';
const ALLOWED_KINDS = ['plat', 'boisson'];

const normalizeName = (value = '') =>
    value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();

const serializeDoc = (doc) => ({
    id: doc.id,
    ...doc.data()
});

const validateKind = (kind) => {
    const normalized = String(kind || '').trim().toLowerCase();
    return ALLOWED_KINDS.includes(normalized) ? normalized : null;
};

exports.createCategory = async (req, res) => {
    try {
        const now = new Date().toISOString();
        const name = req.body.name.trim();
        const kind = validateKind(req.body.kind);
        const normalizedName = normalizeName(name);

        const existingSnap = await db
            .collection(CATEGORY_COLLECTION)
            .where('normalized_name', '==', normalizedName)
            .where('kind', '==', kind)
            .limit(1)
            .get();

        if (!existingSnap.empty) {
            return res.status(409).json({
                success: false,
                message: 'Cette categorie existe deja',
                data: serializeDoc(existingSnap.docs[0])
            });
        }

        const ref = db.collection(CATEGORY_COLLECTION).doc();
        const category = {
            id: ref.id,
            name,
            normalized_name: normalizedName,
            kind,
            description: req.body.description || '',
            is_active: req.body.is_active ?? true,
            createdAt: now,
            updatedAt: now
        };

        await ref.set(category);

        return res.status(201).json({
            success: true,
            message: 'Categorie creee avec succes',
            data: category
        });
    } catch (error) {
        logger.error('createCategory error', { error: error.message });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la creation de la categorie',
            error: error.message
        });
    }
};

exports.listCategories = async (req, res) => {
    try {
        const kindFilter = validateKind(req.query.kind);
        const search = typeof req.query.search === 'string' ? normalizeName(req.query.search) : '';
        const snapshot = await db.collection(CATEGORY_COLLECTION).orderBy('name').get();

        let categories = snapshot.docs.map(serializeDoc);

        if (kindFilter) {
            categories = categories.filter((category) => category.kind === kindFilter);
        }

        if (search) {
            categories = categories.filter((category) =>
                [category.name, category.normalized_name].filter(Boolean).some((value) => normalizeName(value).includes(search))
            );
        }

        return res.status(200).json({
            success: true,
            count: categories.length,
            data: categories
        });
    } catch (error) {
        logger.error('listCategories error', { error: error.message });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la recuperation des categories',
            error: error.message
        });
    }
};

exports.getCategoryById = async (req, res) => {
    try {
        const doc = await db.collection(CATEGORY_COLLECTION).doc(req.params.id).get();
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Categorie introuvable'
            });
        }

        return res.status(200).json({
            success: true,
            data: serializeDoc(doc)
        });
    } catch (error) {
        logger.error('getCategoryById error', { error: error.message, id: req.params.id });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la recuperation de la categorie',
            error: error.message
        });
    }
};

exports.updateCategory = async (req, res) => {
    try {
        const ref = db.collection(CATEGORY_COLLECTION).doc(req.params.id);
        const doc = await ref.get();

        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Categorie introuvable'
            });
        }

        const updates = {
            ...req.body,
            updatedAt: new Date().toISOString()
        };

        if (updates.name) {
            updates.name = updates.name.trim();
            updates.normalized_name = normalizeName(updates.name);
        }

        if (updates.kind) {
            updates.kind = validateKind(updates.kind);
        }

        if (updates.normalized_name && updates.kind) {
            const existingSnap = await db
                .collection(CATEGORY_COLLECTION)
                .where('normalized_name', '==', updates.normalized_name)
                .where('kind', '==', updates.kind)
                .limit(1)
                .get();

            if (!existingSnap.empty && existingSnap.docs[0].id !== req.params.id) {
                return res.status(409).json({
                    success: false,
                    message: 'Une autre categorie utilise deja ce nom pour ce type'
                });
            }
        }

        await ref.update(updates);
        const updatedDoc = await ref.get();

        return res.status(200).json({
            success: true,
            message: 'Categorie mise a jour avec succes',
            data: serializeDoc(updatedDoc)
        });
    } catch (error) {
        logger.error('updateCategory error', { error: error.message, id: req.params.id });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la mise a jour de la categorie',
            error: error.message
        });
    }
};

exports.deleteCategory = async (req, res) => {
    try {
        const ref = db.collection(CATEGORY_COLLECTION).doc(req.params.id);
        const doc = await ref.get();

        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Categorie introuvable'
            });
        }

        const [menuItemsSnap, typeCategoriesSnap] = await Promise.all([
            db.collection('menu_items').where('categorie_id', '==', req.params.id).limit(1).get(),
            db.collection(TYPE_CATEGORY_COLLECTION).where('categorie_id', '==', req.params.id).limit(1).get()
        ]);

        if (!menuItemsSnap.empty || !typeCategoriesSnap.empty) {
            return res.status(409).json({
                success: false,
                message: 'Impossible de supprimer cette categorie car elle est encore utilisee'
            });
        }

        await ref.delete();

        return res.status(200).json({
            success: true,
            message: 'Categorie supprimee avec succes'
        });
    } catch (error) {
        logger.error('deleteCategory error', { error: error.message, id: req.params.id });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la suppression de la categorie',
            error: error.message
        });
    }
};

exports.createTypeCategory = async (req, res) => {
    try {
        const now = new Date().toISOString();
        const categoryDoc = await db.collection(CATEGORY_COLLECTION).doc(req.body.categorie_id).get();

        if (!categoryDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Categorie parente introuvable'
            });
        }

        const name = req.body.name.trim();
        const normalizedName = normalizeName(name);
        const existingSnap = await db
            .collection(TYPE_CATEGORY_COLLECTION)
            .where('categorie_id', '==', req.body.categorie_id)
            .where('normalized_name', '==', normalizedName)
            .limit(1)
            .get();

        if (!existingSnap.empty) {
            return res.status(409).json({
                success: false,
                message: 'Ce type de categorie existe deja',
                data: serializeDoc(existingSnap.docs[0])
            });
        }

        const ref = db.collection(TYPE_CATEGORY_COLLECTION).doc();
        const typeCategory = {
            id: ref.id,
            categorie_id: req.body.categorie_id,
            name,
            normalized_name: normalizedName,
            description: req.body.description || '',
            is_active: req.body.is_active ?? true,
            createdAt: now,
            updatedAt: now
        };

        await ref.set(typeCategory);

        return res.status(201).json({
            success: true,
            message: 'Type de categorie cree avec succes',
            data: typeCategory
        });
    } catch (error) {
        logger.error('createTypeCategory error', { error: error.message });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la creation du type de categorie',
            error: error.message
        });
    }
};

exports.listTypeCategories = async (req, res) => {
    try {
        const categoryId = typeof req.query.categorie_id === 'string' ? req.query.categorie_id.trim() : '';
        const search = typeof req.query.search === 'string' ? normalizeName(req.query.search) : '';
        const snapshot = await db.collection(TYPE_CATEGORY_COLLECTION).orderBy('name').get();

        let typeCategories = snapshot.docs.map(serializeDoc);

        if (categoryId) {
            typeCategories = typeCategories.filter((item) => item.categorie_id === categoryId);
        }

        if (search) {
            typeCategories = typeCategories.filter((item) =>
                [item.name, item.normalized_name].filter(Boolean).some((value) => normalizeName(value).includes(search))
            );
        }

        return res.status(200).json({
            success: true,
            count: typeCategories.length,
            data: typeCategories
        });
    } catch (error) {
        logger.error('listTypeCategories error', { error: error.message });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la recuperation des types de categorie',
            error: error.message
        });
    }
};

exports.getTypeCategoryById = async (req, res) => {
    try {
        const doc = await db.collection(TYPE_CATEGORY_COLLECTION).doc(req.params.id).get();
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Type de categorie introuvable'
            });
        }

        return res.status(200).json({
            success: true,
            data: serializeDoc(doc)
        });
    } catch (error) {
        logger.error('getTypeCategoryById error', { error: error.message, id: req.params.id });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la recuperation du type de categorie',
            error: error.message
        });
    }
};

exports.updateTypeCategory = async (req, res) => {
    try {
        const ref = db.collection(TYPE_CATEGORY_COLLECTION).doc(req.params.id);
        const doc = await ref.get();

        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Type de categorie introuvable'
            });
        }

        const current = serializeDoc(doc);
        const updates = {
            ...req.body,
            updatedAt: new Date().toISOString()
        };

        if (updates.categorie_id) {
            const categoryDoc = await db.collection(CATEGORY_COLLECTION).doc(updates.categorie_id).get();
            if (!categoryDoc.exists) {
                return res.status(404).json({
                    success: false,
                    message: 'Categorie parente introuvable'
                });
            }
        }

        if (updates.name) {
            updates.name = updates.name.trim();
            updates.normalized_name = normalizeName(updates.name);
        }

        if (updates.normalized_name || updates.categorie_id) {
            const targetCategoryId = updates.categorie_id || current.categorie_id;
            const targetNormalizedName = updates.normalized_name || current.normalized_name;
            const existingSnap = await db
                .collection(TYPE_CATEGORY_COLLECTION)
                .where('categorie_id', '==', targetCategoryId)
                .where('normalized_name', '==', targetNormalizedName)
                .limit(1)
                .get();

            if (!existingSnap.empty && existingSnap.docs[0].id !== req.params.id) {
                return res.status(409).json({
                    success: false,
                    message: 'Un autre type de categorie utilise deja ce nom pour cette categorie'
                });
            }
        }

        await ref.update(updates);
        const updatedDoc = await ref.get();

        return res.status(200).json({
            success: true,
            message: 'Type de categorie mis a jour avec succes',
            data: serializeDoc(updatedDoc)
        });
    } catch (error) {
        logger.error('updateTypeCategory error', { error: error.message, id: req.params.id });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la mise a jour du type de categorie',
            error: error.message
        });
    }
};

exports.deleteTypeCategory = async (req, res) => {
    try {
        const ref = db.collection(TYPE_CATEGORY_COLLECTION).doc(req.params.id);
        const doc = await ref.get();

        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Type de categorie introuvable'
            });
        }

        const menuItemsSnap = await db.collection('menu_items').where('type_categorie_id', '==', req.params.id).limit(1).get();
        if (!menuItemsSnap.empty) {
            return res.status(409).json({
                success: false,
                message: 'Impossible de supprimer ce type de categorie car il est encore utilise'
            });
        }

        await ref.delete();

        return res.status(200).json({
            success: true,
            message: 'Type de categorie supprime avec succes'
        });
    } catch (error) {
        logger.error('deleteTypeCategory error', { error: error.message, id: req.params.id });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la suppression du type de categorie',
            error: error.message
        });
    }
};
