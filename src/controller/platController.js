const { db } = require('../config/firebase');
const logger = require('../utils/logger');

const PLAT_COLLECTION = 'plats';
const COMPOSITION_COLLECTION = 'compositions';
const PLAT_COMPOSITION_COLLECTION = 'plat_compositions';

const normalizeCompositionName = (value = '') =>
    value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();

const serializeDoc = (doc) => ({
    id: doc.id,
    ...doc.data()
});

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

const syncPlatCompositions = async (platId, compositionSelections = []) => {
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
        .collection(PLAT_COMPOSITION_COLLECTION)
        .where('plat_id', '==', platId)
        .get();

    const batch = db.batch();

    linksSnap.docs.forEach((doc) => batch.delete(doc.ref));

    const now = new Date().toISOString();
    resolvedCompositions.forEach((composition, index) => {
        const linkRef = db.collection(PLAT_COMPOSITION_COLLECTION).doc();
        batch.set(linkRef, {
            id: linkRef.id,
            plat_id: platId,
            composition_id: composition.id,
            sort_order: index,
            createdAt: now,
            updatedAt: now
        });
    });

    await batch.commit();

    return resolvedCompositions;
};

const getPlatCompositions = async (platId) => {
    const linksSnap = await db
        .collection(PLAT_COMPOSITION_COLLECTION)
        .where('plat_id', '==', platId)
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

const buildPlatResponse = async (platDoc) => {
    const data = serializeDoc(platDoc);
    const compositions = await getPlatCompositions(platDoc.id);

    return {
        ...data,
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
        const platRef = db.collection(PLAT_COLLECTION).doc();
        const compositionSelections = req.body.compositionSelections || [];

        const plat = {
            id: platRef.id,
            name: req.body.name,
            description: req.body.description || '',
            price: req.body.price,
            prep_time: req.body.prep_time || 0,
            image_url: req.body.image_url || '',
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

        await platRef.set(plat);
        const compositions = await syncPlatCompositions(plat.id, compositionSelections);

        return res.status(201).json({
            success: true,
            message: 'Plat cree avec succes',
            data: {
                ...plat,
                is_decomposable: compositions.length > 0 || plat.is_decomposable,
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
        const onlyDecomposable = req.query.is_decomposable === 'true';
        const availableFilter = req.query.is_available;
        const availableToday = req.query.available_today === 'true';

        const snapshot = await db.collection(PLAT_COLLECTION).orderBy('createdAt', 'desc').get();
        let plats = await Promise.all(snapshot.docs.map((doc) => buildPlatResponse(doc)));

        if (search) {
            plats = plats.filter((plat) => {
                const searchableValues = [plat.name, plat.description]
                    .concat(plat.compositions.map((composition) => composition.name))
                    .filter(Boolean)
                    .map((value) => value.toLowerCase());

                return searchableValues.some((value) => value.includes(search));
            });
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
        const platDoc = await db.collection(PLAT_COLLECTION).doc(req.params.id).get();

        if (!platDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Plat introuvable'
            });
        }

        return res.status(200).json({
            success: true,
            data: await buildPlatResponse(platDoc)
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
        const platRef = db.collection(PLAT_COLLECTION).doc(req.params.id);
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

        delete updates.compositionSelections;

        if (req.body.compositionSelections) {
            const compositions = await syncPlatCompositions(req.params.id, req.body.compositionSelections);
            updates.is_decomposable = compositions.length > 0 || updates.is_decomposable === true;
        }

        await platRef.update(updates);
        const updatedPlatDoc = await platRef.get();

        return res.status(200).json({
            success: true,
            message: 'Plat mis a jour avec succes',
            data: await buildPlatResponse(updatedPlatDoc)
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
        const platRef = db.collection(PLAT_COLLECTION).doc(req.params.id);
        const platDoc = await platRef.get();

        if (!platDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Plat introuvable'
            });
        }

        const linksSnap = await db
            .collection(PLAT_COMPOSITION_COLLECTION)
            .where('plat_id', '==', req.params.id)
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
