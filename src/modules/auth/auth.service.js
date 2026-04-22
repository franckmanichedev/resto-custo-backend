const { parsePhoneNumberFromString } = require('libphonenumber-js');
const AppError = require('../../shared/errors/AppError');
const UserEntity = require('../../core/entities/User');
const logger = require('../../shared/utils/logger');
const sanitize = require('../../shared/utils/sanitizer');

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
        const user = UserEntity.create({
            id: firebaseUser.uid,
            name: firebaseUser.name || firebaseUser.displayName || '',
            email: firebaseUser.email || null,
            role: 'customer',
            restaurant_id: firebaseUser.restaurant_id || null,
            createdAt: timestamp,
            updatedAt: timestamp
        });

        await this.userRepository.create(user.id, user);

        return { statusCode: 201, message: 'Utilisateur cree', data: user };
    }

    async signup(payload) {
        logger.info('Nouvelle inscription recue', { body: sanitize(payload) });

        if (payload.password !== payload.passwordConfirm) {
            throw new AppError('Les mots de passe ne correspondent pas', 400);
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
            role: payload.role || 'customer',
            phoneNumber: normalizedPhoneNumber,
            restaurant_id: payload.restaurant_id || null,
            createdAt: timestamp,
            updatedAt: timestamp
        });

        await this.userRepository.create(user.id, user);

        return {
            statusCode: 201,
            message: 'Utilisateur cree avec email avec succes',
            data: user,
            customToken: await this.authRepository.createCustomToken(user.id)
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
                role: user.role || 'customer',
                displayName: user.displayName || ''
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
                role: user.role || 'customer',
                phoneNumber: user.phoneNumber || null,
                restaurant_id: user.restaurant_id || null,
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
