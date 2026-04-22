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
}

module.exports = AuthRepository;
