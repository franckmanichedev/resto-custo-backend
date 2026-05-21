const express = require('express');
const verifyFirebaseToken = require('../../shared/middlewares/verifyFirebaseToken');
const validateRequest = require('../../shared/middlewares/validateRequest');
const { authRateLimiters } = require('../../shared/middlewares/authRateLimit');
const {
    validateSignup,
    validateEmailLookup,
    validateLogin,
    validateResendVerification,
    validatePasswordResetRequest,
    validatePasswordResetConfirm,
    validateResetCode,
    validateApplyAction,
    validateRegisterOrganization,
    validateRegisterFranchise,
    validateCreateInvitation,
    validateAcceptInvitation,
    validateBootstrapPlatformOwner
} = require('./auth.schema');
const { validateProfileUpdate } = require('../user/user.schema');

module.exports = ({ authController }) => {
    const router = express.Router();

    router.post('/signup', authRateLimiters.signup, validateRequest(validateSignup), authController.createUserWithEmail);
    router.post('/register-organization', authRateLimiters.signup, validateRequest(validateRegisterOrganization), authController.registerOrganization);
    router.post('/register-franchise', authRateLimiters.signup, validateRequest(validateRegisterFranchise), authController.registerFranchise);
    router.post('/invitations', verifyFirebaseToken, authRateLimiters.invitation, validateRequest(validateCreateInvitation), authController.createInvitation);
    router.patch('/invitations/:id/revoke', verifyFirebaseToken, authRateLimiters.invitation, authController.revokeInvitation);
    router.post('/invitations/accept', authRateLimiters.invitationAccept, validateRequest(validateAcceptInvitation), authController.acceptInvitation);
    router.post('/bootstrap-platform-owner', authRateLimiters.bootstrap, validateRequest(validateBootstrapPlatformOwner), authController.bootstrapPlatformOwner);
    router.post('/check-email', validateRequest(validateEmailLookup), authController.checkEmailExists);
    router.post('/login', authRateLimiters.login, validateRequest(validateLogin), authController.loginWithEmailPassword);
    router.post('/logout', authController.logout);
    router.post('/resend-verification', authRateLimiters.verification, validateRequest(validateResendVerification), authController.resendVerificationEmail);
    router.post('/request-password-reset', authRateLimiters.passwordReset, validateRequest(validatePasswordResetRequest), authController.requestPasswordReset);
    router.post('/confirm-password-reset', validateRequest(validatePasswordResetConfirm), authController.confirmPasswordReset);
    router.post('/validate-reset-code', validateRequest(validateResetCode), authController.validateResetCode);
    router.post('/apply-action', validateRequest(validateApplyAction), authController.applyAction);
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
