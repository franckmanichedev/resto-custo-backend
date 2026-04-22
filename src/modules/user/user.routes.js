const express = require('express');
const verifyFirebaseToken = require('../../shared/middlewares/verifyFirebaseToken');
const validateRequest = require('../../shared/middlewares/validateRequest');
const { validateProfileUpdate } = require('./user.schema');

module.exports = ({ userController }) => {
    const router = express.Router();

    router.get('/me', verifyFirebaseToken, userController.getAuthenticatedProfile);
    router.get('/:id', userController.getProfile);
    router.put(
        '/:id',
        verifyFirebaseToken,
        validateRequest(validateProfileUpdate),
        userController.updateProfile
    );

    return router;
};
