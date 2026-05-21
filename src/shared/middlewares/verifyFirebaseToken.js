const { admin } = require('../../infrastructure/firebase/firebaseAdmin');
const logger = require('../utils/logger');
const UserRepository = require('../../modules/user/user.repository');
const { ROLES, normalizeRole } = require('../constants/roles');
const {
    resolveUserAccessContext,
    canAccessOrganization,
    canAccessBranch
} = require('../utils/accessControl');

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
        || source?.claims?.tenant_id
        || source?.claims?.tenantId
        || null;
};

const normalizeRestaurantId = (source = {}) => {
    if (!source || typeof source !== 'object') {
        return null;
    }

    return source.restaurant_id
        || source.restaurantId
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
    // Si restaurantId est absent, on retombe sur tenantId (compat avec l'ancien modèle)
    const restaurantId = normalizeRestaurantId(userData)
        || normalizeRestaurantId(decodedToken)
        || tenantId;

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
        organizationId: userData?.organizationId || userData?.organization_id || null,
        organization_id: userData?.organization_id || userData?.organizationId || null,
        organizationIds: userData?.organizationIds || userData?.organization_ids || [],
        organization_ids: userData?.organization_ids || userData?.organizationIds || [],
        branchId: userData?.branchId || userData?.branch_id || null,
        branch_id: userData?.branch_id || userData?.branchId || null,
        branchIds: userData?.branchIds || userData?.branch_ids || [],
        branch_ids: userData?.branch_ids || userData?.branchIds || [],
        organizationMemberships: userData?.organizationMemberships || [],
        branchMemberships: userData?.branchMemberships || [],
        activeOrganizationId: userData?.activeOrganizationId || userData?.active_organization_id || null,
        activeBranchId: userData?.activeBranchId || userData?.active_branch_id || null,
        tenant_id: tenantId,
        tenantId,
        restaurant_id: restaurantId,
        restaurantId
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

        const decodedToken = await admin.auth().verifyIdToken(idToken, true);
        const authUser = await admin.auth().getUser(decodedToken.uid);
        if (authUser.disabled) {
            return res.status(403).json({
                success: false,
                message: 'Compte desactive'
            });
        }
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

        const authenticatedUser = mapAuthenticatedUser(decodedToken, user);
        const access = resolveUserAccessContext(authenticatedUser);
        const requestedOrganizationId = req.headers['x-organization-id']
            || req.query?.organizationId
            || req.body?.organizationId
            || null;
        const requestedBranchId = req.headers['x-branch-id']
            || req.query?.branchId
            || req.body?.branchId
            || null;

        if (requestedOrganizationId && !canAccessOrganization(access, requestedOrganizationId)) {
            return res.status(403).json({
                success: false,
                message: 'Acces refuse: organization hors de portee'
            });
        }

        if (requestedBranchId && !canAccessBranch(access, requestedOrganizationId || access.activeOrganizationId, requestedBranchId)) {
            return res.status(403).json({
                success: false,
                message: 'Acces refuse: branche hors de portee'
            });
        }

        if (!access.platformRole && access.activeOrganizationId && !canAccessOrganization(access, access.activeOrganizationId)) {
            return res.status(403).json({
                success: false,
                message: 'Acces refuse: membership organization inactif'
            });
        }

        req.user = authenticatedUser;
        req.access = access;
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
