const { admin } = require('../../infrastructure/firebase/firebaseAdmin');
const logger = require('../utils/logger');
const UserRepository = require('../../modules/user/user.repository');
const { ROLES, normalizeRole } = require('../constants/roles');

let userRepository = null;

const getUserRepository = () => {
    if (!userRepository) {
        userRepository = new UserRepository();
    }

    return userRepository;
};

const normalizeTenantId = (source = {}) => {
    if (!source || typeof source !== 'object') {
        return null;
    }

    return source.tenant_id
        || source.tenantId
        || source.restaurant_id
        || source.restaurantId
        || source?.claims?.tenant_id
        || source?.claims?.tenantId
        || source?.claims?.restaurant_id
        || source?.claims?.restaurantId
        || null;
};

/**
 * Mappe un token Firebase décrypté et des données utilisateur vers un objet utilisateur authentifié
 * Utilise les rôles définis dans constants/roles.js
 */
const mapAuthenticatedUser = (decodedToken, userData = null) => {
    const roleVal = normalizeRole(userData?.role) || ROLES.CUSTOMER;
    const tenantId = normalizeTenantId(userData) || normalizeTenantId(decodedToken);

    return {
        uid: decodedToken.uid,
        id: decodedToken.uid,
        email: decodedToken.email || userData?.email || null,
        name: userData?.name || decodedToken.name || '',
        displayName: userData?.displayName || decodedToken.name || '',
        role: roleVal,
        phoneNumber: userData?.phoneNumber || null,
        clientType: userData?.clientType || userData?.accountType || 'personal',
        isActive: userData?.isActive,
        tenant_id: tenantId,
        tenantId,
        restaurant_id: tenantId,
        restaurantId: tenantId
    };
};

const verifyFirebaseToken = async (req, res, next) => {
    try {
        const header = req.headers.authorization || req.headers.Authorization;

        if (!header || !header.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Token d\'authentification manquant ou invalide'
            });
        }

        const idToken = header.split(' ')[1];
        if (!idToken?.trim()) {
            return res.status(401).json({
                success: false,
                message: 'Token d\'authentification vide'
            });
        }

        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const user = await getUserRepository().findById(decodedToken.uid);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Utilisateur non trouve'
            });
        }

        if (user.isActive === false) {
            return res.status(403).json({
                success: false,
                message: 'Compte desactive'
            });
        }

        req.user = mapAuthenticatedUser(decodedToken, user);
        next();
    } catch (error) {
        logger.error('verifyFirebaseToken error', {
            errorMessage: error.message,
            errorCode: error.code
        });

        return res.status(401).json({
            success: false,
            message: 'Acces refuse ! Token d\'authentification invalide ou expire',
            error: error.message
        });
    }
};

const verifyTokenWithoutUserLookup = async (req, res, next) => {
    try {
        const header = req.headers.authorization || req.headers.Authorization;

        if (!header || !header.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Token d\'authentification manquant ou invalide'
            });
        }

        const idToken = header.split(' ')[1];
        if (!idToken?.trim()) {
            return res.status(401).json({
                success: false,
                message: 'Token d\'authentification vide'
            });
        }

        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const tenantId = normalizeTenantId(decodedToken);

        req.user = {
            uid: decodedToken.uid,
            id: decodedToken.uid,
            email: decodedToken.email || null,
            name: decodedToken.name || '',
            displayName: decodedToken.name || '',
            role: ROLES.CUSTOMER,
            tenant_id: tenantId,
            tenantId,
            restaurant_id: tenantId,
            restaurantId: tenantId,
            isNewUser: true
        };
        next();
    } catch (error) {
        logger.error('verifyTokenWithoutUserLookup error', {
            errorMessage: error.message,
            errorCode: error.code
        });

        return res.status(401).json({
            success: false,
            message: 'Acces refuse ! Token d\'authentification invalide ou expire',
            error: error.message
        });
    }
};

module.exports = verifyFirebaseToken;
module.exports.verifyTokenWithoutUserLookup = verifyTokenWithoutUserLookup;
