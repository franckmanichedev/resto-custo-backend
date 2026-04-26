const express = require('express');
const verifyFirebaseToken = require('../../shared/middlewares/verifyFirebaseToken');
const requireTenantScope = require('../../shared/middlewares/requireTenantScope');
const validateRequest = require('../../shared/middlewares/validateRequest');
const { validateProfileUpdate } = require('./user.schema');

module.exports = ({ userController }) => {
    const router = express.Router();

    router.get('/me', verifyFirebaseToken, requireTenantScope(), userController.getAuthenticatedProfile);
    router.get('/:id', verifyFirebaseToken, requireTenantScope(), userController.getProfile);
    router.put(
        '/:id',
        verifyFirebaseToken,
        requireTenantScope(),
        validateRequest(validateProfileUpdate),
        userController.updateProfile
    );

    return router;
};
