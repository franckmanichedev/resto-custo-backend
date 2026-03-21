const { db } = require('../config/firebase');
const logger = require('../utils/logger');

const TABLE_COLLECTION = 'tables';
const PLAT_COLLECTION = 'plats';
const COMPOSITION_COLLECTION = 'compositions';
const PLAT_COMPOSITION_COLLECTION = 'plat_compositions';

const serializeDoc = (doc) => ({
    id: doc.id,
    ...doc.data()
});

const DEFAULT_FRONTEND_URLS = {
    development: 'http://localhost:3000',
    production: 'https://resto-custo.netlify.app'
};

const getFrontendBaseUrl = () => {
    const env = process.env.NODE_ENV === 'production' ? 'production' : 'development';
    return process.env[`FRONTEND_URL_${env.toUpperCase()}`]
        || process.env.FRONTEND_URL
        || DEFAULT_FRONTEND_URLS[env];
};

const buildTableMenuUrl = (tableId) => `${getFrontendBaseUrl().replace(/\/$/, '')}/menu.html?table=${tableId}`;

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

    return compositionIds.map((compositionId) => compositionMap.get(compositionId)).filter(Boolean);
};

const buildPlatResponse = async (platDoc) => {
    const plat = serializeDoc(platDoc);
    const compositions = await getPlatCompositions(plat.id);

    return {
        ...plat,
        is_decomposable: plat.is_decomposable === true || compositions.length > 0,
        is_available: plat.is_available !== false,
        availability_mode: plat.availability_mode || 'everyday',
        available_days: Array.isArray(plat.available_days) ? plat.available_days : [],
        is_available_today: isPlatAvailableForDay(plat),
        compositions
    };
};

const ensureUniqueTableNumber = async (number, excludeId = null) => {
    const snap = await db.collection(TABLE_COLLECTION).where('number', '==', number).limit(1).get();

    if (!snap.empty && snap.docs[0].id !== excludeId) {
        const error = new Error('Une table avec ce numero existe deja');
        error.status = 409;
        throw error;
    }
};

exports.createTable = async (req, res) => {
    try {
        const now = new Date().toISOString();
        const tableRef = db.collection(TABLE_COLLECTION).doc();

        await ensureUniqueTableNumber(req.body.number);

        const menuUrl = buildTableMenuUrl(tableRef.id);
        const qrCode = req.body.qr_code || menuUrl;

        const table = {
            id: tableRef.id,
            name: req.body.name,
            number: req.body.number,
            qr_code: qrCode,
            menu_url: menuUrl,
            is_active: req.body.is_active ?? true,
            created_at: now,
            updated_at: now,
            createdAt: now,
            updatedAt: now
        };

        await tableRef.set(table);

        return res.status(201).json({
            success: true,
            message: 'Table creee avec succes',
            data: table
        });
    } catch (error) {
        logger.error('createTable error', { error: error.message });
        return res.status(error.status || 500).json({
            success: false,
            message: 'Erreur lors de la creation de la table',
            error: error.message
        });
    }
};

exports.listTables = async (req, res) => {
    try {
        const snapshot = await db.collection(TABLE_COLLECTION).orderBy('createdAt', 'desc').get();
        const tables = snapshot.docs.map(serializeDoc);

        return res.status(200).json({
            success: true,
            count: tables.length,
            data: tables
        });
    } catch (error) {
        logger.error('listTables error', { error: error.message });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la recuperation des tables',
            error: error.message
        });
    }
};

exports.getTableById = async (req, res) => {
    try {
        const doc = await db.collection(TABLE_COLLECTION).doc(req.params.id).get();

        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Table introuvable'
            });
        }

        return res.status(200).json({
            success: true,
            data: serializeDoc(doc)
        });
    } catch (error) {
        logger.error('getTableById error', { error: error.message, id: req.params.id });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la recuperation de la table',
            error: error.message
        });
    }
};

exports.updateTable = async (req, res) => {
    try {
        const tableRef = db.collection(TABLE_COLLECTION).doc(req.params.id);
        const tableDoc = await tableRef.get();

        if (!tableDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Table introuvable'
            });
        }

        if (req.body.number) {
            await ensureUniqueTableNumber(req.body.number, req.params.id);
        }

        const updates = {
            ...req.body,
            updated_at: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (!updates.qr_code) {
            delete updates.qr_code;
        }

        await tableRef.update(updates);
        const updatedDoc = await tableRef.get();

        return res.status(200).json({
            success: true,
            message: 'Table mise a jour avec succes',
            data: serializeDoc(updatedDoc)
        });
    } catch (error) {
        logger.error('updateTable error', { error: error.message, id: req.params.id });
        return res.status(error.status || 500).json({
            success: false,
            message: 'Erreur lors de la mise a jour de la table',
            error: error.message
        });
    }
};

exports.deleteTable = async (req, res) => {
    try {
        const tableRef = db.collection(TABLE_COLLECTION).doc(req.params.id);
        const tableDoc = await tableRef.get();

        if (!tableDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Table introuvable'
            });
        }

        await tableRef.delete();

        return res.status(200).json({
            success: true,
            message: 'Table supprimee avec succes'
        });
    } catch (error) {
        logger.error('deleteTable error', { error: error.message, id: req.params.id });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la suppression de la table',
            error: error.message
        });
    }
};

exports.getTableMenu = async (req, res) => {
    try {
        const tableDoc = await db.collection(TABLE_COLLECTION).doc(req.params.id).get();

        if (!tableDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Table introuvable'
            });
        }

        const snapshot = await db.collection(PLAT_COLLECTION).orderBy('createdAt', 'desc').get();
        const currentDay = getCurrentWeekDay();
        const plats = await Promise.all(
            snapshot.docs
                .filter((doc) => isPlatAvailableForDay(doc.data(), currentDay))
                .map((doc) => buildPlatResponse(doc))
        );

        return res.status(200).json({
            success: true,
            data: {
                table: serializeDoc(tableDoc),
                current_day: currentDay,
                plats
            }
        });
    } catch (error) {
        logger.error('getTableMenu error', { error: error.message, id: req.params.id });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la recuperation du menu de la table',
            error: error.message
        });
    }
};

exports.getTableMenuByQrCode = async (req, res) => {
    try {
        const snap = await db
            .collection(TABLE_COLLECTION)
            .where('qr_code', '==', req.params.qrCode)
            .limit(1)
            .get();

        if (snap.empty) {
            return res.status(404).json({
                success: false,
                message: 'Aucune table ne correspond a ce qr_code'
            });
        }

        req.params.id = snap.docs[0].id;
        return exports.getTableMenu(req, res);
    } catch (error) {
        logger.error('getTableMenuByQrCode error', { error: error.message, qrCode: req.params.qrCode });
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la recuperation du menu par qr_code',
            error: error.message
        });
    }
};
