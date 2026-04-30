const { parsePhoneNumberFromString } = require('libphonenumber-js');
const AppError = require('../../shared/errors/AppError');
const UserEntity = require('../../core/entities/User');
const logger = require('../../shared/utils/logger');
const sanitize = require('../../shared/utils/sanitizer');
const { ROLES, normalizeRole, isPlatformRole } = require('../../shared/constants/roles');
const { db } = require('../../infrastructure/firebase/firebaseAdmin');
const { RESTAURANTS } = require('../../shared/constants/collections');

const normalizeTenantId = (payload = {}) => {
    const tenantId = payload.tenant_id ?? payload.tenantId ?? payload.restaurant_id ?? payload.restaurantId;
    return typeof tenantId === 'string' ? tenantId.trim() : tenantId ?? null;
};

class AuthService {
    constructor({ authRepository, userRepository, firebaseApiKey }) {
        this.authRepository = authRepository;
        this.userRepository = userRepository;
        this.firebaseApiKey = firebaseApiKey;
    }

    async createUserFromToken(firebaseUser) {
        if (!firebaseUser?.uid) {
            throw new AppError('Utilisateur Firebase introuvable', 400);
        }

        const existingUser = await this.userRepository.findById(firebaseUser.uid);
        if (existingUser) {
            return { statusCode: 200, message: 'Utilisateur existant', data: UserEntity.create(existingUser) };
        }

        const timestamp = new Date().toISOString();
        const normalizedRole = normalizeRole(firebaseUser.role);
        const user = UserEntity.create({
            id: firebaseUser.uid,
            name: firebaseUser.name || firebaseUser.displayName || '',
            email: firebaseUser.email || null,
            role: normalizedRole && !isPlatformRole(normalizedRole) ? normalizedRole : ROLES.CUSTOMER,
            tenant_id: normalizeTenantId(firebaseUser),
            tenantId: normalizeTenantId(firebaseUser),
            restaurant_id: normalizeTenantId(firebaseUser),
            restaurantId: normalizeTenantId(firebaseUser),
            createdAt: timestamp,
            updatedAt: timestamp
        });

        await this.userRepository.create(user.id, user);
        // Ensure a restaurants entry exists for this tenant/restaurant id
        if (tenantId) {
            try {
                const restRef = db.collection(RESTAURANTS).doc(tenantId);
                const restDoc = await restRef.get();
                if (!restDoc.exists) {
                    const restaurantPayload = {
                        id: tenantId,
                        name: payload.restaurantName || payload.businessName || `${payload.name || 'Restaurant'}`,
                        ownerId: user.id,
                        tenant_id: tenantId,
                        tenantId: tenantId,
                        restaurant_id: tenantId,
                        restaurantId: tenantId,
                        createdAt: timestamp,
                        updatedAt: timestamp
                    };

                    await restRef.set(restaurantPayload);
                }
            } catch (err) {
                logger.warn('Impossible de creer le document restaurant', { error: err.message, tenantId });
            }
        }

        return { statusCode: 201, message: 'Utilisateur cree', data: user };
    }

    async signup(payload) {
        logger.info('Nouvelle inscription recue', { body: sanitize(payload) });

        if (payload.password !== payload.passwordConfirm) {
            throw new AppError('Les mots de passe ne correspondent pas', 400);
        }

        if (!this.firebaseApiKey) {
            throw new AppError('Erreur de configuration serveur', 500);
        }

        this.validatePassword(payload.password);

        const email = String(payload.email).trim().toLowerCase();
        if (await this.userRepository.findByEmail(email)) {
            throw new AppError('Cet email est deja utilise (Firestore)', 400);
        }

        await this.ensureFirebaseEmailAvailable(email);

        let normalizedPhoneNumber = null;
        if (payload.phoneNumber) {
            normalizedPhoneNumber = this.normalizePhoneNumber(payload.phoneNumber);

            if (await this.userRepository.findByPhoneNumber(normalizedPhoneNumber)) {
                throw new AppError('Ce numero de telephone est deja utilise', 400);
            }

            await this.ensureFirebasePhoneAvailable(normalizedPhoneNumber);
        }

        const normalizedRole = normalizeRole(payload.role);
        if (payload.role !== undefined && !normalizedRole) {
            throw new AppError('Role invalide', 400);
        }

        if (normalizedRole && isPlatformRole(normalizedRole)) {
            throw new AppError('Les roles plateforme ne peuvent pas etre attribues via l\'inscription', 403);
        }

        const tenantId = normalizeTenantId(payload);

        const userRecord = await this.authRepository.createUser({
            email,
            password: payload.password,
            displayName: payload.name,
            phoneNumber: normalizedPhoneNumber || undefined
        });

        const timestamp = new Date().toISOString();
        const user = UserEntity.create({
            id: userRecord.uid,
            email,
            name: payload.name,
            role: normalizedRole || ROLES.CUSTOMER,
            phoneNumber: normalizedPhoneNumber,
            tenant_id: tenantId,
            tenantId,
            restaurant_id: tenantId,
            restaurantId: tenantId,
            createdAt: timestamp,
            updatedAt: timestamp
        });

        await this.userRepository.create(user.id, user);
        const firebaseSession = await this.verifyPassword(email, payload.password);

        return {
            statusCode: 201,
            message: 'Utilisateur cree avec email avec succes',
            data: user,
            idToken: firebaseSession.idToken,
            refreshToken: firebaseSession.refreshToken,
            expiresIn: firebaseSession.expiresIn
        };
    }

    async checkEmailExists(email) {
        const cleanEmail = String(email).trim().toLowerCase();
        if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
            throw new AppError('Format d\'email invalide', 400);
        }

        const user = await this.userRepository.findByEmail(cleanEmail);
        if (!user) {
            throw new AppError('Aucun compte trouve avec cet email', 404, { exists: false, email: cleanEmail });
        }

        let authUser;
        try {
            authUser = await this.authRepository.getUserByEmail(cleanEmail);
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                throw new AppError('Utilisateur non trouve dans Firebase Auth', 404, { exists: false });
            }

            throw error;
        }

        const providers = authUser.providerData.map((provider) => provider.providerId);
        return {
            success: true,
            message: 'Email trouve',
            exists: true,
            auth: {
                hasPassword: providers.includes('password'),
                hasGoogle: providers.includes('google.com'),
                providers
            },
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName || '',
                lastName: user.lastName || '',
                role: normalizeRole(user.role) || ROLES.CUSTOMER,
                displayName: user.displayName || '',
                tenant_id: normalizeTenantId(user),
                restaurant_id: normalizeTenantId(user)
            }
        };
    }

    async login(payload) {
        const email = String(payload.email).trim().toLowerCase();
        if (!this.firebaseApiKey) {
            throw new AppError('Erreur de configuration serveur', 500);
        }

        const firebaseResponse = await this.verifyPassword(email, payload.password);
        const user = await this.userRepository.findByEmail(email);

        if (!user) {
            throw new AppError('Profil utilisateur non trouve', 404);
        }

        if (firebaseResponse.localId !== user.id) {
            throw new AppError('Erreur systeme: donnees incoherentes', 500);
        }

        if (user.isActive === false) {
            throw new AppError('Ce compte a ete desactive. Contactez l\'administrateur.', 403);
        }

        const tenantId = normalizeTenantId(user);

        return {
            success: true,
            message: 'Connexion reussie',
            idToken: firebaseResponse.idToken,
            refreshToken: firebaseResponse.refreshToken,
            expiresIn: firebaseResponse.expiresIn,
            data: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: normalizeRole(user.role) || ROLES.CUSTOMER,
                phoneNumber: user.phoneNumber || null,
                tenant_id: tenantId,
                tenantId,
                restaurant_id: tenantId,
                restaurantId: tenantId,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }
        };
    }

    logout() {
        return { success: true, message: 'Deconnexion reussie' };
    }

    validatePassword(password) {
        if (password.length < 6) {
            throw new AppError('Le mot de passe doit contenir au moins 6 caracteres', 400);
        }

        if (/[<>"'`]/.test(password)) {
            throw new AppError('Le mot de passe contient des caracteres interdits', 400);
        }
    }

    normalizePhoneNumber(phoneNumber) {
        const parsed =
            parsePhoneNumberFromString(phoneNumber) ||
            parsePhoneNumberFromString(phoneNumber, 'CM');

        if (!parsed || !parsed.isValid()) {
            throw new AppError(
                'Le numero de telephone fourni n\'est pas valide. Veuillez entrer un numero de telephone valide.',
                400
            );
        }

        return parsed.number;
    }

    async ensureFirebaseEmailAvailable(email) {
        try {
            await this.authRepository.getUserByEmail(email);
            throw new AppError('Cet email est deja utilise (Firebase Auth)', 400);
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            if (error.code !== 'auth/user-not-found') {
                throw new AppError(`Erreur interne lors de la verification de l'email: ${error.message}`, 500);
            }
        }
    }

    async ensureFirebasePhoneAvailable(phoneNumber) {
        try {
            await this.authRepository.getUserByPhoneNumber(phoneNumber);
            throw new AppError('Ce numero de telephone est deja utilise', 400);
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            if (error.code !== 'auth/user-not-found') {
                throw new AppError(
                    `Erreur interne lors de la verification du numero de telephone: ${error.message}`,
                    500
                );
            }
        }
    }

    async verifyPassword(email, password) {
        const response = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${this.firebaseApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, returnSecureToken: true })
            }
        );

        const firebaseResponse = await response.json();
        if (!response.ok) {
            const errorCode = firebaseResponse.error?.message;

            if (errorCode === 'INVALID_PASSWORD' || errorCode === 'INVALID_LOGIN_CREDENTIALS') {
                throw new AppError('Email ou mot de passe incorrect', 401);
            }

            if (errorCode === 'EMAIL_NOT_FOUND' || errorCode === 'USER_DISABLED') {
                throw new AppError('Aucun compte trouve avec cet email ou compte desactive', 404);
            }

            throw new AppError('Email ou mot de passe incorrect', 401);
        }

        return firebaseResponse;
    }
}

module.exports = AuthService;
