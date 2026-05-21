const { admin } = require('../../infrastructure/firebase/firebaseAdmin');

class AuthRepository {
    constructor(firebaseAdmin = admin) {
        this.auth = firebaseAdmin.auth();
    }

    getUserByEmail(email) {
        return this.auth.getUserByEmail(email);
    }

    getUserByPhoneNumber(phoneNumber) {
        return this.auth.getUserByPhoneNumber(phoneNumber);
    }

    createUser(payload) {
        return this.auth.createUser(payload);
    }

    createCustomToken(uid) {
        return this.auth.createCustomToken(uid);
    }

    // Password reset and action code methods
    verifyPasswordResetCode(code) {
        return this.auth.verifyPasswordResetCode(code);
    }

    resetPassword(code, newPassword) {
        return this.auth.resetPassword(code, newPassword);
    }

    applyActionCode(code) {
        return this.auth.applyActionCode(code);
    }

    checkActionCode(code) {
        return this.auth.checkActionCode(code);
    }
}

module.exports = AuthRepository;
