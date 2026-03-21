const { admin, db } = require("../config/firebase");
const { parsePhoneNumberFromString } = require("libphonenumber-js");

// logging & sanitization
const logger = require('../utils/logger');
const sanitize = require('../utils/sanitizer');

const USER_COLLECTION = "users";
// const SKILLS_COLLECTION = "skills";

exports.createUserFromToken = async (req, res) => {
    try {
        const firebaseUser = req.user; // Récupération de l'utilisateur Firebase à partir du token

        if (!firebaseUser || !firebaseUser.uid) {
            return res.status(400).json({ success: false, message: "Utilisateur Firebase introuvable" });
        }
        
        const id = firebaseUser.uid;

        const userRef = db.collection(USER_COLLECTION).doc(id);
        const userDoc = await userRef.get();

        if (userDoc.exists) {
            // déjà présent
            const data = userDoc.data(); // Récupération des données utilisateur
            return res.status(200).json({ 
                success: true, 
                message: "Utilisateur existant", 
                data 
            }); // Renvoie les données utilisateur existantes
        }

        // Créer document user basique
        const newUser = {
            id,
            name: firebaseUser.name,
            email: firebaseUser.email || null,
            role: "customer",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        await userRef.set(newUser); // Création du document utilisateur dans Firestore

        return res.status(201).json({ success: true, message: "Utilisateur créé", data: newUser }); // Renvoie les données du nouvel utilisateur
    } catch (error) {
        logger.error('createUserFromToken error', { error });
        return res.status(500).json({ success: false, 
            message: "Erreur lors de la création de l'utilisateur", 
            error: error.message 
        });
    }
};

// =====================================================
//  REGISTER EMAIL/PASSWORD
// =====================================================
exports.createUserWithEmail = async (req, res) => {
    try {
        logger.info('Nouvelle inscription reçue', {
            headers: sanitize(req.headers),
            body: sanitize(req.body)
        });

        // Récupérer les données du corps de la requête
        const { 
            email, 
            password, 
            name, 
            phoneNumber,
            passwordConfirm,
            role, 
            bio,
            location,
            languages
        } = req.body;

        logger.debug('Données parsées', {
            email,
            name,
            phoneNumber,
            passwordLength: password?.length,
            role
        });

        // 1) Validation générale des champs obligatoires
        if (!email || !password || !name) {
            logger.warn("Validation échouée: champs manquants", { body: sanitize(req.body) });
            return res.status(400).json({
                success: false,
                message: "Email, nom et mot de passe sont obligatoires."
            });
        }

        if (password !== passwordConfirm) {
            logger.warn("Validation échouée: mots de passe différents", { body: sanitize(req.body) });
            return res.status(400).json({ 
                success: false,
                message: "Les mots de passe ne correspondent pas" 
            });
        }
        
        // Validation du mot de passe
        const validatePassword = (password) => {
            if (password.length < 6) {
                throw new Error("Le mot de passe doit contenir au moins 6 caractères");
            }
            // Firebase n'accepte pas certains caractères spéciaux
            const invalidChars = /[<>"'`]/;
            if (invalidChars.test(password)) {
                throw new Error("Le mot de passe contient des caractères interdits");
            }
        };

        logger.info("Validation frontale OK");
            
        // 2) Vérifier si l'email existe dans Firestore
        logger.info("Vérification email dans Firestore");
        const firestoreCheck = await db.collection(USER_COLLECTION)
            .where("email", "==", email)
            .get();

        if (!firestoreCheck.empty) {
            logger.warn("Email déjà utilisé dans Firestore");
            return res.status(400).json({
                success: false,
                message: "Cet email est déjà utilisé (Firestore)",
            });
        }
        
        // 3) Vérifier si l'email existe dans Firebase Auth
        logger.info("Vérification email dans Firebase Auth");
        try {
            await admin.auth().getUserByEmail(email);
            logger.warn("Email déjà utilisé dans Firebase Auth");
            return res.status(400).json({
                success: false,
                message: "Cet email est déjà utilisé (Firebase Auth)",
            });
        } catch (error) {
            // getUserByEmail génère une erreur SI l'email n'existe pas
            if (error.code !== "auth/user-not-found") {
                logger.error("Erreur Firebase Auth", { error: error.message });
                return res.status(500).json({
                    success: false,
                    message: "Erreur interne lors de la vérification de l'email",
                    error: error.message
                });
            }
            logger.info("Email disponible dans Firebase Auth");
        }

        logger.info("Toutes les vérifications d'email sont OK");

        // 4) Vérifier si le numéro de téléphone existe dans Firestore et Firebase Auth
        if (phoneNumber && typeof phoneNumber === 'string' && phoneNumber.trim()) {
            logger.info("Vérification numéro de téléphone");
            
            let phoneToCheck = phoneNumber;
            try {
                const parsed = parsePhoneNumberFromString(phoneNumber);
                if (parsed && parsed.isValid()) {
                    phoneToCheck = parsed.number;
                } else {
                    const parsedWithRegion = parsePhoneNumberFromString(phoneNumber, 'CM');
                    if (parsedWithRegion && parsedWithRegion.isValid()) {
                        phoneToCheck = parsedWithRegion.number;
                    }
                }
            } catch (e) {
                logger.warn("Impossible de normaliser le numéro pour vérification", { original: phoneNumber });
                // keep original for check
            }

            // Vérifier dans Firestore
            const phoneFirestoreCheck = await db.collection(USER_COLLECTION)
                .where("phoneNumber", "==", phoneToCheck)
                .get();

            if (!phoneFirestoreCheck.empty) {
                logger.warn("Numéro de téléphone déjà utilisé dans Firestore");
                return res.status(400).json({
                    success: false,
                    message: "Ce numéro de téléphone est déjà utilisé",
                });
            }
            
            // Vérifier dans Firebase Auth
            try {
                await admin.auth().getUserByPhoneNumber(phoneToCheck);
                logger.warn("Numéro de téléphone déjà utilisé dans Firebase Auth");
                return res.status(400).json({
                    success: false,
                    message: "Ce numéro de téléphone est déjà utilisé",
                });
            } catch (error) {
                if (error.code !== "auth/user-not-found") {
                    logger.error("Erreur Firebase Auth téléphone", { error: error.message });
                    return res.status(500).json({
                        success: false,
                        message: "Erreur interne lors de la vérification du numéro de téléphone",
                        error: error.message
                    });
                }
                logger.info("Numéro de téléphone disponible dans Firebase Auth");
            }
        }

        logger.info("Toutes les vérifications sont OK");

        // Normaliser et valider le numéro de téléphone
        let phoneForCreate = undefined;
        let normalizedPhone = phoneNumber; // Pour Firestore (on garde l'original si possible)
        
        if (phoneNumber && typeof phoneNumber === 'string' && phoneNumber.trim()) {
            logger.info("Tentative de normalisation du numéro de téléphone");
            try {
                // Essayer de parser le numéro (sans région spécifiée, approche heuristique)
                const parsed = parsePhoneNumberFromString(phoneNumber);
                
                if (parsed && parsed.isValid()) {
                    phoneForCreate = parsed.number; // Format E.164 (ex: +22934567890)
                    normalizedPhone = phoneForCreate;
                    logger.info("Numéro valide en E.164", { phone: phoneForCreate });
                } else {
                    // Essayer avec la région par défaut (Cameroun, +237)
                    const parsedWithRegion = parsePhoneNumberFromString(phoneNumber, 'CM');
                    if (parsedWithRegion && parsedWithRegion.isValid()) {
                        phoneForCreate = parsedWithRegion.number;
                        normalizedPhone = phoneForCreate;
                        logger.info("Numéro valide (région CM) en E.164", { phone: phoneForCreate });
                    } else {
                        logger.warn("Numéro de téléphone invalide ou non normalisable", { original: phoneNumber });
                        return res.status(400).json({
                            success: false,
                            message: "Le numéro de téléphone fourni n'est pas valide. Veuillez entrer un numéro de téléphone valide."
                        });
                    }
                }
            } catch (parseErr) {
                logger.warn('Erreur lors du parsing du numéro', { error: parseErr.message });
                return res.status(400).json({
                    success: false,
                    message: "Le numéro de téléphone fourni n'est pas valide. Veuillez entrer un numéro de téléphone valide."
                });
            }
        }

        // 4) Créer l'utilisateur dans Firebase Auth
        logger.info("Création de l'utilisateur dans Firebase Auth");
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: name,
            phoneNumber: phoneForCreate,
        });

        logger.info("Utilisateur Firebase créé", { uid: userRecord.uid });

        // id Firebase (uid est le vrai identifiant)
        const id = userRecord.uid;

        // 5) Créer le document utilisateur dans Firestore
        logger.info("Création du document Firestore");
        const userDoc = {
            id,    
            email,
            name,
            role: role || "customer",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        
        // 6) Enregistrer dans Firestore
        await db.collection(USER_COLLECTION).doc(id).set(userDoc);
        logger.info("Document Firestore créé");

        // 7) Générer un Custom Token
        logger.info("Génération du token custom");
        const customToken = await admin.auth().createCustomToken(userRecord.uid);

        logger.info("INSCRIPTION RÉUSSIE pour", { email });
        
        res.status(201).json({ 
            success: true,
            message: "Utilisateur créé avec email avec succès",
            data: userDoc,
            customToken
        });

    } catch (error) {
        logger.error('ERREUR CRITIQUE', { error });
        logger.error('createUserWithEmail error', { error });
        logger.error('Code d\'erreur', { code: error.code });
        logger.error('Message erreur', { message: error.message });
        logger.error('Stack', { stack: error.stack });
        
        res.status(500).json({ 
            success: false,
            message: "Erreur lors de la création de l'utilisateur avec email",
            error: error.message,
            code: error.code
        });
    }
}

// =====================================================
// GET /me (Récupère les informations de l'utilisateur connecté)
// =====================================================
exports.getAuthenticatedUser = async (req, res) => {
  try {
    const id = req.user.id; // Récupère l'id de l'utilisateur à partir du token d'authentification
    const doc = await db.collection(USER_COLLECTION).doc(id).get(); // Récupère le document utilisateur depuis Firestore

    if (!doc.exists) {
        return res.status(404).json({ 
            success: false, 
            message: "Utilisateur introuvable dans Firestore"
        });
    }

    return res.status(200).json({ 
        success: true, 
        data: doc.data() 
    });

  } catch (error) {
    logger.error('getAuthenticatedUser error', { error });
    res.status(500).json({ 
        success: false, 
        message: "Erreur serveur", 
        error: error.message 
    });
  }
};

// =====================================================
// LOGIN EMAIL/PASSWORD
// =====================================================

// =====================================================
// CHECK EMAIL (Étape 1)
// =====================================================
exports.checkEmailExists = async (req, res) => {
    logger.info("=========== CHECK EMAIL START ===========");
    logger.info("Request body", { body: sanitize(req.body) });
    logger.info("Request headers", { contentType: req.headers['content-type'] });
    
    try {
        let email =
            req.body?.email ||
            req.body?.data?.email ||
            req.body?.email?.email ||
            null;
        
        // Log détaillé de l'email reçu
        logger.info("Email reçu", { email });
        logger.debug("Type email", { type: typeof email });
        logger.debug("Longueur email", { length: email ? email.length : null });
        
        if (typeof email !== "string") {
            logger.warn("Email manquant");
            return res.status(400).json({ 
                success: false, 
                message: "Email invalide ou mal formaté",
                received: req.body 
            });
        }

        // Nettoyer et normaliser l'email
        const cleanEmail = String(email).trim().toLowerCase();
        logger.debug("Email nettoyé", { cleanEmail });
        
        // Vérification simple du format (moins strict)
        if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
            logger.warn("Format email basique invalide");
            return res.status(400).json({
                success: false,
                message: "Format d'email invalide",
                email: cleanEmail
            });
        }

        logger.info("Format email valide");

        // SEULEMENT vérifier dans Firestore
        logger.info("Recherche dans Firestore pour", { cleanEmail });
        
        try {
            const firestoreCheck = await db.collection(USER_COLLECTION)
                .where("email", "==", cleanEmail)
                .get();

            logger.info("Résultats Firestore", { count: firestoreCheck.size });
            
            const userExists = !firestoreCheck.empty;
            
            if (!userExists) {
                logger.warn("Utilisateur non trouvé dans Firestore");
                return res.status(404).json({
                    success: false,
                    message: "Aucun compte trouvé avec cet email",
                    exists: false,
                    email: cleanEmail
                });
            }

            // Récupérer les infos utilisateur
            const userDoc = firestoreCheck.docs[0];
            const userData = userDoc.data();
            
            logger.info("Utilisateur trouvé", {
                id: userDoc.id,
                email: userData.email,
                name: `${userData.firstName || ''} ${userData.lastName || ''}`.trim()
            });

            // 🔍 Vérifier le provider dans Firebase Auth
            let authUser;
            try {
            authUser = await admin.auth().getUserByEmail(cleanEmail);
            } catch (e) {
            return res.status(404).json({
                success: false,
                exists: false,
                message: "Utilisateur non trouvé dans Firebase Auth"
            });
            }

            // Récupérer les providers
            const providers = authUser.providerData.map(p => p.providerId);

            const hasPassword = providers.includes("password");
            const hasGoogle = providers.includes("google.com");

            return res.status(200).json({
                success: true,
                message: "Email trouvé",
                exists: true,
                auth: {
                    hasPassword,
                    hasGoogle,
                    providers
                },
                user: {
                    id: userDoc.id,
                    email: userData.email,
                    firstName: userData.firstName || "",
                    lastName: userData.lastName || "",
                    role: userData.role || "customer",
                    displayName: userData.displayName || ""
                },
                // requiresPassword: true
            });

        } catch (firestoreError) {
            logger.error('Erreur Firestore', { error: firestoreError });
            return res.status(500).json({
                success: false,
                message: "Erreur base de données",
                error: firestoreError.message
            });
        }

    } catch (error) {
        logger.error("========== ERREUR GLOBALE ===========");
        logger.error("Error", { error });
        logger.error('Message erreur', { message: error.message });
        logger.error('Stack', { stack: error.stack });
        
        return res.status(500).json({
            success: false,
            message: "Erreur serveur",
            error: error.message,
            receivedBody: req.body
        });
    } finally {
        logger.info("=========== CHECK EMAIL END ===========");
    }
};

// =====================================================
// LOGIN WITH PASSWORD - Vérification Email + Mot de passe
// =====================================================
exports.loginWithEmailPassword = async (req, res) => {
    try {
        logger.info("Tentative de connexion avec email/mot de passe");
        
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email et mot de passe requis"
            });
        }

        const cleanEmail = email.toLowerCase().trim();
        logger.info("Tentative de connexion", { email: cleanEmail });

        // ⭐ ÉTAPE 1: Vérifier le password avec la REST API de Firebase
        logger.info("Vérification du mot de passe avec Firebase REST API");
        
        const firebaseApiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
        if (!firebaseApiKey) {
            logger.error("FIREBASE_API_KEY non configurée");
            return res.status(500).json({
                success: false,
                message: "Erreur de configuration serveur"
            });
        }

        const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`;
        
        let firebaseResponse;
        try {
            const response = await fetch(signInUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: cleanEmail,
                    password: password,
                    returnSecureToken: true
                })
            });

            firebaseResponse = await response.json();

            // Si la vérification du password échoue
            if (!response.ok) {
                logger.warn("Vérification du password échouée", { 
                    email: cleanEmail,
                    error: firebaseResponse.error?.message 
                });
                
                const errorMsg = firebaseResponse.error?.message;
                
                // Gérer les différentes erreurs Firebase
                if (errorMsg === 'INVALID_PASSWORD' || errorMsg === 'INVALID_LOGIN_CREDENTIALS') {
                    return res.status(401).json({
                        success: false,
                        message: "Email ou mot de passe incorrect"
                    });
                }
                
                if (errorMsg === 'EMAIL_NOT_FOUND' || errorMsg === 'USER_DISABLED') {
                    return res.status(404).json({
                        success: false,
                        message: "Aucun compte trouvé avec cet email ou compte désactivé"
                    });
                }

                return res.status(401).json({
                    success: false,
                    message: "Email ou mot de passe incorrect"
                });
            }

            logger.info("✅ Password vérifié avec succès", { 
                email: cleanEmail,
                uid: firebaseResponse.localId
            });

        } catch (fetchError) {
            logger.error("Erreur lors de la vérification du password", { 
                error: fetchError.message 
            });
            return res.status(500).json({
                success: false,
                message: "Erreur lors de la vérification du password"
            });
        }

        // ⭐ ÉTAPE 2: Récupérer l'utilisateur dans Firestore
        logger.info("Récupération des données utilisateur dans Firestore", { email: cleanEmail });
        
        const userSnap = await db.collection(USER_COLLECTION)
            .where("email", "==", cleanEmail)
            .limit(1)
            .get();

        if (userSnap.empty) {
            logger.warn("Utilisateur non trouvé dans Firestore", { email: cleanEmail });
            return res.status(404).json({
                success: false,
                message: "Profil utilisateur non trouvé"
            });
        }

        const userDoc = userSnap.docs[0];
        const userData = userDoc.data();
        const userId = userDoc.id;

        logger.info("Utilisateur trouvé dans Firestore", { userId, email: cleanEmail });

        // ⭐ ÉTAPE 3: Vérifier la cohérence (UID Firebase = ID Firestore)
        if (firebaseResponse.localId !== userId) {
            logger.error("Incohérence: UID Firebase != ID Firestore", { 
                firebaseUid: firebaseResponse.localId, 
                firestoreId: userId 
            });
            return res.status(500).json({
                success: false,
                message: "Erreur système: données incohérentes"
            });
        }

        // ⭐ ÉTAPE 4: Vérifier que le compte n'est pas désactivé
        if (userData.isActive === false) {
            logger.warn("Compte désactivé", { userId, email: cleanEmail });
            return res.status(403).json({
                success: false,
                message: "Ce compte a été désactivé. Contactez l'administrateur."
            });
        }

        logger.info("✅ CONNEXION RÉUSSIE", { userId, email: cleanEmail });
        
        return res.status(200).json({
            success: true,
            message: "Connexion réussie",
            idToken: firebaseResponse.idToken,
            refreshToken: firebaseResponse.refreshToken,
            expiresIn: firebaseResponse.expiresIn,
            data: {
                id: userId,
                email: userData.email,
                name: userData.name,
                role: userData.role || "customer",
                phoneNumber: userData.phoneNumber || null,
                createdAt: userData.createdAt,
                updatedAt: userData.updatedAt
            }
        });

    } catch (error) {
        logger.error("loginWithEmailPassword error", { 
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        
        return res.status(500).json({
            success: false,
            message: "Erreur lors de la connexion",
            error: error.message
        });
    }
};

exports.getProfile = async (req, res) => {
    try {
        const id = req.params.id; // Récupération de l'id utilisateur depuis les paramètres de la requête
        const userDoc = await db.collection(USER_COLLECTION).doc(id).get(); // Récupération du document utilisateur

        if (!userDoc.exists) {
            return res.status(404).json({ 
                success: false,
                message: "Utilisateur non trouvé" 
            });
        }

        res.status(200).json({ 
            success: true,
            data: {
                id: userDoc.id, // Ajoute l'ID du document
                ...userDoc.data() // Ajoute les données du document
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            message: "Erreur lors de la récupération du profil utilisateur",
            error: error.message 
        });
    }
}

exports.updateProfile = async (req, res) => {
    try {
        const id = req.params.id; // Récupération de l'id utilisateur depuis les paramètres de la requête
        const data = req.body; // Données mises à jour depuis le corps de la requête
        const userRef = db.collection(USER_COLLECTION).doc(id); // Référence au document utilisateur

        const userDoc = await userRef.get(); // Récupération du document utilisateur
        if (!userDoc.exists) {
            return res.status(404).json({ 
                success: false,
                message: "Utilisateur non trouvé" 
            });
        }

        await userRef.update(data); // Mise à jour des données dans Firestore

        await userRef.update({ updatedAt: new Date().toISOString() }); // Met à jour le champ updatedAt

        res.status(200).json({
            success: true,
            message: "Profil utilisateur mis à jour avec succès",
            data: {
                id: id, // Ajoute l'ID du document
                ...data // Ajoute les données mises à jour
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            message: "Erreur lors de la mise à jour du profil utilisateur",
            error: error.message 
        });
    }
}

exports.deleteProfile = async (req, res) => {
    try {
        const id = req.params.id; // Récupération de l'id utilisateur depuis les paramètres de la requête
        const userRef = db.collection(USER_COLLECTION).doc(id); // Référence au document utilisateur
        
        const userDoc = await userRef.get(); // Récupération du document utilisateur
        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                message: "Utilisateur non trouvé"
            });
        }

        await admin.auth().deleteUser(id); // Suppression de l'utilisateur dans Firebase Auth

        await userRef.delete(); // Suppression du document utilisateur

        res.status(200).json({
            success: true,
            message: "Profil utilisateur supprimé avec succès"
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            message: "Erreur lors de la suppression du profil utilisateur",
            error:  error.message 
        });
    }
}

exports.logout = async (req, res) => {
  try {
    logger.info("Tentative de déconnexion");
    
    // Le logout est généralement simple - c'est au client de nettoyer le localStorage
    // On peut optionnellement valider un token ici pour des tâches côté serveur
    
    logger.info("✅ Déconnexion réussie");
    
    return res.status(200).json({
      success: true,
      message: "Déconnexion réussie"
    });
    
  } catch (error) {
    logger.error('Erreur logout', { error: error.message });
    return res.status(500).json({
      success: false,
      message: "Erreur lors de la déconnexion"
    });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: "Refresh token requis"
      });
    }
    
    // Vérifiez le refresh token dans votre DB
    const tokenDoc = await db.collection('refresh_tokens')
      .where('token', '==', refreshToken)
      .where('expiresAt', '>', new Date())
      .limit(1)
      .get();
    
    if (tokenDoc.empty) {
      return res.status(401).json({
        success: false,
        message: "Refresh token invalide ou expiré"
      });
    }
    
    const tokenData = tokenDoc.docs[0].data();
    const userId = tokenData.userId;
    
    // Générez un nouveau token
    const newToken = generateJWT(userId); // À implémenter
    
    return res.status(200).json({
      success: true,
      token: newToken,
      expiresIn: 3600 // 1 heure
    });
    
  } catch (error) {
    logger.error('Erreur refresh token', { error });
    return res.status(500).json({
      success: false,
      message: "Erreur serveur"
    });
  }
};
