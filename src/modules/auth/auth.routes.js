const express = require('express');
const verifyFirebaseToken = require('../../shared/middlewares/verifyFirebaseToken');
const validateRequest = require('../../shared/middlewares/validateRequest');
const { validateSignup, validateEmailLookup, validateLogin } = require('./auth.schema');
const { validateProfileUpdate } = require('../user/user.schema');

module.exports = ({ authController }) => {
    const router = express.Router();

    router.post('/signup', validateRequest(validateSignup), authController.createUserWithEmail);
    router.post('/check-email', validateRequest(validateEmailLookup), authController.checkEmailExists);
    router.post('/login', validateRequest(validateLogin), authController.loginWithEmailPassword);
    router.post('/logout', authController.logout);
    router.post(
        '/create-user-from-token',
        verifyFirebaseToken.verifyTokenWithoutUserLookup,
        authController.createUserFromToken
    );

    router.get('/me', verifyFirebaseToken, authController.getAuthenticatedUser);
    router.get('/profile/:id', authController.getProfile);
    router.put(
        '/profile/:id',
        verifyFirebaseToken,
        validateRequest(validateProfileUpdate),
        authController.updateProfile
    );

    return router;
};
