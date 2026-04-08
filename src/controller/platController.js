const crypto = require('crypto');
const { db, storageBucket } = require('../config/firebase');
const logger = require('../utils/logger');

const MENU_ITEM_COLLECTION = 'menu_items';
const COMPOSITION_COLLECTION = 'compositions';
const MENU_ITEM_COMPOSITION_COLLECTION = 'menu_item_compositions';
const CATEGORY_COLLECTION = 'categories';
const TYPE_CATEGORY_COLLECTION = 'type_categories';
const DEFAULT_KIND = 'plat';

const normalizeCompositionName = (value = '') =>
    value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();

const normalizeKind = (value = '') => {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'boisson' ? 'boisson' : 'plat';
};

const serializeDoc = (doc) => ({
    id: doc.id,
    ...doc.data()
});

const buildStorageFileUrl = (filePath, token) =>
    `https://firebasestorage.googleapis.com/v0/b/${storageBucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`;

const uploadPlatImage = async (file, menuItemId) => {
    if (!file) {
        return '';
    }

    if (!storageBucket) {
        const error = new Error('Firebase Storage n est pas configure');
        error.status = 500;
        throw error;
    }

    const safeName = (file.originalname || 'image')
        .replace(/[^a-zA-Z0-9.\-_]/g, '-')
        .replace(/-+/g, '-');
    const token = crypto.randomUUID();
    const filePath = `menu-items/${menuItemId}/${Date.now()}-${safeName}`;
    const storageFile = storageBucket.file(filePath);

    await storageFile.save(file.buffer, {
        resumable: false,
        metadata: {
            contentType: file.mimetype,
            metadata: {
                firebaseStorageDownloadTokens: token
            }
        }
    });

    return buildStorageFileUrl(filePath, token);
};

const getCurrentWeekDay = () => {
    const formatter = new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        timeZone: process.env.APP_TIMEZONE || 'Africa/Douala'
    });

    return formatter.format(new Date()).toLowerCase();
};

const isPlatAvailableForDay = (plat, day = getCurrentWeekDay()) => {
    if (plat.is_available === false) {
        return false;
    }

    if ((plat.availability_mode || 'everyday') !== 'selected_days') {
        return true;
    }

    return Array.isArray(plat.available_days) && plat.available_days.includes(day);
};

const getCompositionByNormalizedName = async (normalizedName) => {
    const snap = await db
        .collection(COMPOSITION_COLLECTION)
        .where('normalized_name', '==', normalizedName)
        .limit(1)
        .get();

    return snap.empty ? null : snap.docs[0];
};

const ensureCompositionExists = async (selection) => {
    if (selection.composition_id) {
        const existingDoc = await db.collection(COMPOSITION_COLLECTION).doc(selection.composition_id).get();
        if (!existingDoc.exists) {
            const error = new Error(`Composition introuvable: ${selection.composition_id}`);
            error.status = 404;
            throw error;
        }

        return serializeDoc(existingDoc);
    }

    const normalizedName = normalizeCompositionName(selection.name);
    const existingDoc = await getCompositionByNormalizedName(normalizedName);

    if (existingDoc) {
        return serializeDoc(existingDoc);
    }

    const now = new Date().toISOString();
    const newRef = db.collection(COMPOSITION_COLLECTION).doc();
    const newComposition = {
        id: newRef.id,
        name: selection.name,
        normalized_name: normalizedName,
        is_allergen: selection.is_allergen || false,
        description: selection.description || '',
        aliases: [],
        is_active: true,
        createdAt: now,
        updatedAt: now
    };

    await newRef.set(newComposition);
    return newComposition;
};

const syncMenuItemCompositions = async (menuItemId, compositionSelections = []) => {
    const resolvedCompositions = [];
    const seenIds = new Set();

    for (const selection of compositionSelections) {
        const composition = await ensureCompositionExists(selection);
        if (!seenIds.has(composition.id)) {
            seenIds.add(composition.id);
            resolvedCompositions.push(composition);
        }
    }

    const linksSnap = await db
        .collection(MENU_ITEM_COMPOSITION_COLLECTION)
        .where('menu_item_id', '==', menuItemId)
        .get();

    const batch = db.batch();

    linksSnap.docs.forEach((doc) => batch.delete(doc.ref));

    const now = new Date().toISOString();
    resolvedCompositions.forEach((composition, index) => {
        const linkRef = db.collection(MENU_ITEM_COMPOSITION_COLLECTION).doc();
        batch.set(linkRef, {
            id: linkRef.id,
            menu_item_id: menuItemId,
            composition_id: composition.id,
            sort_order: index,
            createdAt: now,
            updatedAt: now
        });
    });

    await batch.commit();

    return resolvedCompositions;
};

const getMenuItemCompositions = async (menuItemId) => {
    const linksSnap = await db
        .collection(MENU_ITEM_COMPOSITION_COLLECTION)
        .where('menu_item_id', '==', menuItemId)
        .get();

    if (linksSnap.empty) {
        return [];
    }

    const compositionIds = linksSnap.docs
        .map((doc) => doc.data())
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .map((link) => link.composition_id);
    const compositionDocs = await Promise.all(
        compositionIds.map((compositionId) => db.collection(COMPOSITION_COLLECTION).doc(compositionId).get())
    );

    const compositionMap = new Map(
        compositionDocs
            .filter((doc) => doc.exists)
            .map((doc) => [doc.id, serializeDoc(doc)])
    );

    return compositionIds
        .map((compositionId) => compositionMap.get(compositionId))
        .filter(Boolean);
};

const getCategoryDetails = async (data) => {
    const [categoryDoc, typeCategoryDoc] = await Promise.all([
        data.categorie_id ? db.collection(CATEGORY_COLLECTION).doc(data.categorie_id).get() : null,
        data.type_categorie_id ? db.collection(TYPE_CATEGORY_COLLECTION).doc(data.type_categorie_id).get() : null
    ]);

    return {
        category: categoryDoc?.exists ? serializeDoc(categoryDoc) : null,
        typeCategory: typeCategoryDoc?.exists ? serializeDoc(typeCategoryDoc) : null
    };
};

const buildMenuItemResponse = async (menuItemDoc) => {
    const data = serializeDoc(menuItemDoc);
    const compositions = await getMenuItemCompositions(menuItemDoc.id);
    const taxonomy = await getCategoryDetails(data);
    const kind = normalizeKind(data.kind || data.category || data.legacy_category);
    const categoryName = taxonomy.category?.name || data.categorie_name || data.category || data.legacy_category || kind;

    return {
        ...data,
        kind,
        category: data.category || data.legacy_category || kind,
        categorie_id: data.categorie_id || null,
        categorie_name: categoryName,
        type_categorie_id: data.type_categorie_id || null,
        type_categorie_name: taxonomy.typeCategory?.name || data.type_categorie_name || null,
        category_details: taxonomy.category,
        type_category_details: taxonomy.typeCategory,
        is_available: data.is_available !== false,
        availability_mode: data.availability_mode || 'everyday',
        available_days: Array.isArray(data.available_days) ? data.available_days : [],
        is_available_today: isPlatAvailableForDay(data),
        is_decomposable: compositions.length > 0 || data.is_decomposable === true,
        compositions
    };
};

exports.createPlat = async (req, res) => {
    try {
        const now = new Date().toISOString();
        const menuItemRef = db.collection(MENU_ITEM_COLLECTION).doc();
        const compositionSelections = req.body.compositionSelections || [];
        const imageUrl = req.file
            ? await uploadPlatImage(req.file, menuItemRef.id)
            : (req.body.image_url || '');
        const kind = normalizeKind(req.body.kind || req.body.category || req.body.legacy_category);

        const menuItem = {
            id: menuItemRef.id,
            name: req.body.name,
            description: req.body.description || '',
            price: req.body.price,
            prep_time: req.body.prep_time || 0,
            image_url: imageUrl,
            kind,
            category: req.body.category || kind,
            legacy_category: req.body.category || null,
            categorie_id: req.body.categorie_id || null,
            categorie_name: req.body.categorie_name || null,
            type_categorie_id: req.body.type_categorie_id || null,
            type_categorie_name: req.body.type_categorie_name || null,
            is_promo: req.body.is_promo || false,
            is_available: req.body.is_available !== false,
            availability_mode: req.body.availability_mode || 'everyday',
            available_days: Array.isArray(req.body.available_days) ? req.body.available_days : [],
            is_decomposable: compositionSelections.length > 0 || req.body.is_decomposable === true,
            allow_custom_message: req.body.allow_custom_message ?? true,
            custom_message_hint: req.body.custom_message_hint || '',
            createdAt: now,
            updatedAt: now
        };

        await menuItemRef.set(menuItem);
        const compositions = await syncMenuItemCompositions(menuItem.id, compositionSelections);

        return res.status(201).json({
            success: true,
            message: 'Plat cree avec succes',
            data: {
                ...menuItem,
                is_decomposable: compositions.length > 0 || menuItem.is_decomposable,
                compositions
            }
        });
    } catch (error) {
        logger.error('createPlat error', { error: error.message });
        return res.status(error.status || 500).json({
            success: false,
            message: 'Erreur lors de la creation du plat',
            error: error.message
        });
    }
};

exports.listPlats = async (req, res) => {
    try {
        const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
        const categoryFilter = typeof req.query.category === 'string' ? req.query.category.trim().toLowerCase() : '';
        const kindFilter = typeof req.query.kind === 'string' ? req.query.kind.trim().toLowerCase() : '';
        const categorieIdFilter = typeof req.query.categorie_id === 'string' ? req.query.categorie_id.trim() : '';
        const typeCategorieIdFilter = typeof req.query.type_categorie_id === 'string' ? req.query.type_categorie_id.trim() : '';
        const sortBy = typeof req.query.sort_by === 'string' ? req.query.sort_by.trim().toLowerCase() : 'created_at';
        const sortOrder = req.query.sort_order === 'asc' ? 'asc' : 'desc';
        const onlyDecomposable = req.query.is_decomposable === 'true';
        const availableFilter = req.query.is_available;
        const availableToday = req.query.available_today === 'true';

        const snapshot = await db.collection(MENU_ITEM_COLLECTION).orderBy('createdAt', 'desc').get();
        let plats = await Promise.all(snapshot.docs.map((doc) => buildMenuItemResponse(doc)));

        if (search) {
            plats = plats.filter((plat) => {
                const searchableValues = [plat.name, plat.description]
                    .concat(plat.compositions.map((composition) => composition.name))
                    .filter(Boolean)
                    .map((value) => value.toLowerCase());

                return searchableValues.some((value) => value.includes(search));
            });
        }

        if (categoryFilter) {
            plats = plats.filter((plat) =>
                (plat.category || DEFAULT_KIND) === categoryFilter
                || (plat.kind || DEFAULT_KIND) === categoryFilter
                || (plat.categorie_name || '').trim().toLowerCase() === categoryFilter
            );
        }

        if (kindFilter) {
            plats = plats.filter((plat) => (plat.kind || DEFAULT_KIND) === kindFilter);
        }

        if (categorieIdFilter) {
            plats = plats.filter((plat) => plat.categorie_id === categorieIdFilter);
        }

        if (typeCategorieIdFilter) {
            plats = plats.filter((plat) => plat.type_categorie_id === typeCategorieIdFilter);
        }

        if (onlyDecomposable) {
            plats = plats.filter((plat) => plat.compositions.length > 0 || plat.is_decomposable === true);
        }

        if (availableFilter === 'true') {
            plats = plats.filter((plat) => plat.is_available !== false);
        } else if (availableFilter === 'false') {
            plats = plats.filter((plat) => plat.is_available === false);
        }

        if (availableToday) {
            plats = plats.filter((plat) => plat.is_available_today === true);
        }

        const compareValues = (left, right) => {
            if (typeof left === 'number' && typeof right === 'number') {
                return left - right;
            }

            return String(left || '').localeCompare(String(right || ''), 'fr', { sensitivity: 'base' });
        };

        plats.sort((a, b) => {
            let comparison = 0;

            if (sortBy === 'name') {
                comparison = compareValues(a.name, b.name);
            } else if (sortBy === 'price') {
                comparison = compareValues(Number(a.price || 0), Number(b.price || 0));
            } else if (sortBy === 'category') {
                comparison = compareValues(a.categorie_name || a.category || DEFAULT_KIND, b.categorie_name || b.category || DEFAULT_KIND)
                    || compareValues(a.name, b.name);
            } else {
                comparison = compareValues(
                    new Date(a.createdAt || 0).getTime(),
                    new Date(b.createdAt || 0).getTime()
                );
            }

            return sortOrder === 'asc' ? comparison : -comparison;
        });

        return res.status(200).json({
            success: true,
            count: plats.length,
            data: plats
        });
    } catch (error) {
        logger.error('listPlats error', { error: error.message });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la recuperation des plats',
            error: error.message
        });
    }
};

exports.getPlatById = async (req, res) => {
    try {
        const platDoc = await db.collection(MENU_ITEM_COLLECTION).doc(req.params.id).get();

        if (!platDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Plat introuvable'
            });
        }

        return res.status(200).json({
            success: true,
            data: await buildMenuItemResponse(platDoc)
        });
    } catch (error) {
        logger.error('getPlatById error', { error: error.message, id: req.params.id });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la recuperation du plat',
            error: error.message
        });
    }
};

exports.updatePlat = async (req, res) => {
    try {
        const platRef = db.collection(MENU_ITEM_COLLECTION).doc(req.params.id);
        const platDoc = await platRef.get();

        if (!platDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Plat introuvable'
            });
        }

        const updates = {
            ...req.body,
            updatedAt: new Date().toISOString()
        };

        if (updates.kind || updates.category || updates.legacy_category) {
            updates.kind = normalizeKind(updates.kind || updates.category || updates.legacy_category);
            if (updates.category) {
                updates.legacy_category = updates.category;
            }
        }

        if (req.file) {
            updates.image_url = await uploadPlatImage(req.file, req.params.id);
        }

        delete updates.compositionSelections;

        if (req.body.compositionSelections) {
            const compositions = await syncMenuItemCompositions(req.params.id, req.body.compositionSelections);
            updates.is_decomposable = compositions.length > 0 || updates.is_decomposable === true;
        }

        await platRef.update(updates);
        const updatedPlatDoc = await platRef.get();

        return res.status(200).json({
            success: true,
            message: 'Plat mis a jour avec succes',
            data: await buildMenuItemResponse(updatedPlatDoc)
        });
    } catch (error) {
        logger.error('updatePlat error', { error: error.message, id: req.params.id });
        return res.status(error.status || 500).json({
            success: false,
            message: 'Erreur lors de la mise a jour du plat',
            error: error.message
        });
    }
};

exports.deletePlat = async (req, res) => {
    try {
        const platRef = db.collection(MENU_ITEM_COLLECTION).doc(req.params.id);
        const platDoc = await platRef.get();

        if (!platDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Plat introuvable'
            });
        }

        const linksSnap = await db
            .collection(MENU_ITEM_COMPOSITION_COLLECTION)
            .where('menu_item_id', '==', req.params.id)
            .get();

        const batch = db.batch();
        batch.delete(platRef);
        linksSnap.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();

        return res.status(200).json({
            success: true,
            message: 'Plat supprime avec succes'
        });
    } catch (error) {
        logger.error('deletePlat error', { error: error.message, id: req.params.id });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la suppression du plat',
            error: error.message
        });
    }
};

exports.togglePlatAvailability = async (req, res) => {
    try {
        const menuItemRef = db.collection(MENU_ITEM_COLLECTION).doc(req.params.id);
        const menuItemDoc = await menuItemRef.get();

        if (!menuItemDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Plat introuvable'
            });
        }

        const current = serializeDoc(menuItemDoc);
        await menuItemRef.update({
            is_available: current.is_available === false,
            updatedAt: new Date().toISOString()
        });

        const updatedDoc = await menuItemRef.get();
        return res.status(200).json({
            success: true,
            message: 'Disponibilite mise a jour avec succes',
            data: await buildMenuItemResponse(updatedDoc)
        });
    } catch (error) {
        logger.error('togglePlatAvailability error', { error: error.message, id: req.params.id });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la mise a jour de la disponibilite',
            error: error.message
        });
    }
};
