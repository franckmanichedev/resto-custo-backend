const { db } = require('../config/firebase');

const USER_COLLECTION = 'users';

/**
 * Middleware factory to require one or more roles.
 * Usage: requireRole(['admin']) or requireRole('admin')
 */
module.exports = function requireRole(allowed) {
    const allowedArray = Array.isArray(allowed) ? allowed : [allowed];

    return async (req, res, next) => {
        try {
            if (!req.user || !req.user.uid) {
                return res.status(401).json({ success: false, message: 'Utilisateur non authentifié' });
            }

            const uid = req.user.uid;
            const snap = await db.collection(USER_COLLECTION).doc(uid).get();

            if (!snap.exists) {
                return res.status(404).json({ success: false, message: 'Profil utilisateur introuvable' });
            }

            const userData = snap.data();
            const role = userData.role || null;

            if (!role || !allowedArray.includes(role)) {
                return res.status(403).json({ success: false, message: 'Accès refusé: rôle insuffisant' });
            }

            // expose role to downstream handlers
            req.user.role = role;
            next();
        } catch (error) {
            console.error('requireRole error:', error);
            return res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
        }
    };
};
