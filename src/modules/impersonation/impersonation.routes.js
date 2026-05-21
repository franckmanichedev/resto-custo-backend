const express = require('express');
const verifyFirebaseToken = require('../../shared/middlewares/verifyFirebaseToken');
const requireRole = require('../../shared/middlewares/requireRole');
const resolveUserAccessContext = require('../../shared/middlewares/resolveUserAccessContext');
const validateRequest = require('../../shared/middlewares/validateRequest');
const { ROLES } = require('../../shared/constants/roles');

const validateStartImpersonation = (payload = {}) => {
    const errors = [];
    const value = {};

    if (typeof payload.targetOrganizationId !== 'string' || !payload.targetOrganizationId.trim()) {
        errors.push({ field: 'targetOrganizationId', message: 'targetOrganizationId est requis' });
    } else {
        value.targetOrganizationId = payload.targetOrganizationId.trim();
    }

    if (payload.targetBranchId !== undefined) {
        if (payload.targetBranchId !== null && typeof payload.targetBranchId !== 'string') {
            errors.push({ field: 'targetBranchId', message: 'targetBranchId doit etre une chaine ou null' });
        } else {
            value.targetBranchId = payload.targetBranchId ? payload.targetBranchId.trim() : null;
        }
    }

    if (payload.reason !== undefined) {
        value.reason = typeof payload.reason === 'string' ? payload.reason.trim() : null;
    }

    return { value, errors };
};

module.exports = ({ impersonationController }) => {
    const router = express.Router();
    const platformImpersonators = [ROLES.PLATFORM_OWNER, ROLES.PLATFORM_ADMIN, ROLES.PLATFORM_SUPPORT];

    router.post(
        '/',
        verifyFirebaseToken,
        resolveUserAccessContext(),
        requireRole(platformImpersonators),
        validateRequest(validateStartImpersonation),
        impersonationController.start
    );
    router.patch(
        '/:id/end',
        verifyFirebaseToken,
        resolveUserAccessContext(),
        requireRole(platformImpersonators),
        impersonationController.end
    );

    return router;
};
