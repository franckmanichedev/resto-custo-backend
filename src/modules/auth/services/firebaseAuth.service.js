const { admin } = require('../../../infrastructure/firebase/firebaseAdmin');

class FirebaseAuthService {
    constructor({ authClient = admin.auth(), db = null, logger = null } = {}) {
        this.authClient = authClient;
        this.db = db;
        this.logger = logger;
    }

    createFirebaseUser(payload) {
        return this.authClient.createUser(payload);
    }

    deleteUser(uid) {
        return this.authClient.deleteUser(uid);
    }

    disableUser(uid, disabled = true) {
        return this.authClient.updateUser(uid, { disabled });
    }

    async generateEmailVerificationLink(email, actionCodeSettings = {}) {
        return this.authClient.generateEmailVerificationLink(email, actionCodeSettings);
    }

    async generatePasswordResetLink(email, actionCodeSettings = {}) {
        return this.authClient.generatePasswordResetLink(email, actionCodeSettings);
    }

    setRoleClaims(uid, claims = {}) {
        return this.authClient.setCustomUserClaims(uid, claims);
    }

    getUser(uid) {
        return this.authClient.getUser(uid);
    }

    revokeRefreshTokens(uid) {
        return this.authClient.revokeRefreshTokens(uid);
    }

    async createPlatformOwner(payload = {}) {
        const userRecord = await this.createFirebaseUser(payload);
        await this.setRoleClaims(userRecord.uid, {
            role: 'platform_owner',
            platformRole: 'platform_owner'
        });
        return userRecord;
    }

    async createOrganizationOwner(payload = {}) {
        const userRecord = await this.createFirebaseUser(payload);
        await this.setRoleClaims(userRecord.uid, {
            role: 'organization_owner'
        });
        return userRecord;
    }

    async createStaffUser(payload = {}) {
        const userRecord = await this.createFirebaseUser(payload);
        await this.setRoleClaims(userRecord.uid, {
            role: 'staff'
        });
        return userRecord;
    }

    async syncUserProfile(uid, profile = {}) {
        const updates = {};
        if (profile.displayName) updates.displayName = profile.displayName;
        if (profile.phoneNumber) updates.phoneNumber = profile.phoneNumber;
        if (profile.photoURL) updates.photoURL = profile.photoURL;
        if (profile.email) updates.email = profile.email;
        if (Object.keys(updates).length === 0) {
            return null;
        }
        return this.authClient.updateUser(uid, updates);
    }
}

module.exports = FirebaseAuthService;
