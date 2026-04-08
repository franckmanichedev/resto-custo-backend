const { db } = require('../config/firebase');
const logger = require('../utils/logger');

const COMPOSITION_COLLECTION = 'compositions';

const normalizeCompositionName = (value = '') =>
    value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();

const serializeComposition = (doc) => ({
    id: doc.id,
    ...doc.data()
});

exports.createComposition = async (req, res) => {
    try {
        const now = new Date().toISOString();
        const compositionRef = db.collection(COMPOSITION_COLLECTION).doc();
        const normalizedName = normalizeCompositionName(req.body.name);

        const existingSnap = await db
            .collection(COMPOSITION_COLLECTION)
            .where('normalized_name', '==', normalizedName)
            .limit(1)
            .get();

        if (!existingSnap.empty) {
            return res.status(409).json({
                success: false,
                message: 'Cette composition existe deja',
                data: serializeComposition(existingSnap.docs[0])
            });
        }

        const composition = {
            id: compositionRef.id,
            name: req.body.name,
            normalized_name: normalizedName,
            is_allergen: req.body.is_allergen || false,
            description: req.body.description || '',
            aliases: req.body.aliases || [],
            is_active: req.body.is_active ?? true,
            createdAt: now,
            updatedAt: now
        };

        await compositionRef.set(composition);

        return res.status(201).json({
            success: true,
            message: 'Composition creee avec succes',
            data: composition
        });
    } catch (error) {
        logger.error('createComposition error', { error: error.message });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la creation de la composition',
            error: error.message
        });
    }
};

exports.listCompositions = async (req, res) => {
    try {
        const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
        const allergenOnly = req.query.is_allergen === 'true';

        let snapshot = await db.collection(COMPOSITION_COLLECTION).orderBy('name').get();
        let compositions = snapshot.docs.map(serializeComposition);

        if (allergenOnly) {
            compositions = compositions.filter((item) => item.is_allergen === true);
        }

        if (search) {
            const normalizedSearch = normalizeCompositionName(search);
            compositions = compositions.filter((item) => {
                const haystacks = [
                    item.name,
                    item.normalized_name,
                    ...(Array.isArray(item.aliases) ? item.aliases : [])
                ]
                    .filter(Boolean)
                    .map((value) => normalizeCompositionName(value));

                return haystacks.some((value) => value.includes(normalizedSearch));
            });
        }

        return res.status(200).json({
            success: true,
            count: compositions.length,
            data: compositions
        });
    } catch (error) {
        logger.error('listCompositions error', { error: error.message });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la recuperation des compositions',
            error: error.message
        });
    }
};

exports.getCompositionById = async (req, res) => {
    try {
        const doc = await db.collection(COMPOSITION_COLLECTION).doc(req.params.id).get();

        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Composition introuvable'
            });
        }

        return res.status(200).json({
            success: true,
            data: serializeComposition(doc)
        });
    } catch (error) {
        logger.error('getCompositionById error', { error: error.message, id: req.params.id });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la recuperation de la composition',
            error: error.message
        });
    }
};

exports.updateComposition = async (req, res) => {
    try {
        const compositionRef = db.collection(COMPOSITION_COLLECTION).doc(req.params.id);
        const doc = await compositionRef.get();

        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Composition introuvable'
            });
        }

        const updates = {
            ...req.body,
            updatedAt: new Date().toISOString()
        };

        if (updates.name) {
            const normalizedName = normalizeCompositionName(updates.name);
            const existingSnap = await db
                .collection(COMPOSITION_COLLECTION)
                .where('normalized_name', '==', normalizedName)
                .limit(1)
                .get();

            if (!existingSnap.empty && existingSnap.docs[0].id !== req.params.id) {
                return res.status(409).json({
                    success: false,
                    message: 'Une autre composition utilise deja ce nom'
                });
            }

            updates.normalized_name = normalizedName;
        }

        await compositionRef.update(updates);
        const updatedDoc = await compositionRef.get();

        return res.status(200).json({
            success: true,
            message: 'Composition mise a jour avec succes',
            data: serializeComposition(updatedDoc)
        });
    } catch (error) {
        logger.error('updateComposition error', { error: error.message, id: req.params.id });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la mise a jour de la composition',
            error: error.message
        });
    }
};

exports.deleteComposition = async (req, res) => {
    try {
        const compositionRef = db.collection(COMPOSITION_COLLECTION).doc(req.params.id);
        const doc = await compositionRef.get();

        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Composition introuvable'
            });
        }

        const linksSnap = await db
            .collection('menu_item_compositions')
            .where('composition_id', '==', req.params.id)
            .limit(1)
            .get();

        if (!linksSnap.empty) {
            return res.status(409).json({
                success: false,
                message: 'Impossible de supprimer cette composition car elle est encore liee a un plat'
            });
        }

        await compositionRef.delete();

        return res.status(200).json({
            success: true,
            message: 'Composition supprimee avec succes'
        });
    } catch (error) {
        logger.error('deleteComposition error', { error: error.message, id: req.params.id });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la suppression de la composition',
            error: error.message
        });
    }
};
