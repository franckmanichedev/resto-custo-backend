const express = require('express');
const verifyFirebaseToken = require('../../shared/middlewares/verifyFirebaseToken');
const requireTenantScope = require('../../shared/middlewares/requireTenantScope');
const validateRequest = require('../../shared/middlewares/validateRequest');
const resolveUserAccessContext = require('../../shared/middlewares/resolveUserAccessContext');
const { validateProfileUpdate, validateBranchSwitch } = require('./user.schema');

const authAccessContext = [verifyFirebaseToken, requireTenantScope(), resolveUserAccessContext({ allowMissing: true })];

module.exports = ({ userController }) => {
    const router = express.Router();

    router.get('/me', ...authAccessContext, userController.getAuthenticatedProfile);
    router.post('/me/active-branch', ...authAccessContext, validateRequest(validateBranchSwitch), userController.switchActiveBranch);
    router.get('/:id', ...authAccessContext, userController.getProfile);
    router.put(
        '/:id',
        ...authAccessContext,
        validateRequest(validateProfileUpdate),
        userController.updateProfile
    );

    return router;
};
