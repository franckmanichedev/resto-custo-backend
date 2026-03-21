const { admin } = require('../config/firebase');
const logger = require('../utils/logger');

const verifyFirebaseToken = async function(req, res, next) {
    try {
        const header = req.headers.authorization || req.headers.Authorization; // Récupère l'en-tête Authorization

        if (!header || !header.startsWith('Bearer ')) {
            logger.warn('Token manquant ou format invalide', { 
                hasHeader: !!header,
                headerStart: header?.substring(0, 20)
            });
            return res.status(401).json({ 
                success: false,
                message: 'Token d\'authentification manquant ou invalide' 
            });
        }
        
        // Extrait le token après "Bearer "
        const idToken = header.split(' ')[1];

        if (!idToken || idToken.trim().length === 0) {
            logger.warn('Token vide après extraction');
            return res.status(401).json({ 
                success: false,
                message: 'Token d\'authentification vide' 
            });
        }

        logger.info('Token reçu pour vérification', { 
            tokenLength: idToken.length,
            startsWithJWT: idToken.startsWith('eyJ'),
            tokenPreview: idToken.substring(0, 50) + '...'
        });

        // Vérifie et décode le token Firebase
        const decodedToken = await admin.auth().verifyIdToken(idToken);

        logger.info('Token vérifié avec succès', { uid: decodedToken.uid });

        // Récupérer l'utilisateur depuis Firestore
        const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
        
        if (!userDoc.exists) {
            logger.warn('Utilisateur non trouvé dans Firestore', { uid: decodedToken.uid });
            return res.status(404).json({
                success: false,
                message: 'Utilisateur non trouvé'
            });
        }

        const userData = userDoc.data();

        // Vérifier que le compte n'est pas désactivé (Tâche 1.5)
        if (userData.isActive === false) {
            logger.warn('User account is deactivated', { uid: decodedToken.uid, email: userData.email });
            return res.status(403).json({
                success: false,
                message: 'Compte désactivé'
            });
        }

        // Ajoute les informations de l'utilisateur décodé à la requête
        // Normaliser le rôle (tolérer les petites fautes de frappe, casse)
        let roleVal = (userData.role || '').toString().toLowerCase().trim();
        if (!roleVal) {
            roleVal = 'admin';
        } else if (roleVal.startsWith('tech')) {
            roleVal = 'admin';
        }

        req.user = {
            uid: decodedToken.uid,
            email: decodedToken.email || null,
            displayName: userData.displayName || decodedToken.name,
            role: roleVal,
            phoneNumber: userData.phoneNumber,
            clientType: userData.clientType || userData.accountType || 'personal',
            isActive: userData.isActive
            // firebase: decodedToken
        };
        logger.info('User authenticated and active', { uid: req.user.uid, role: req.user.role });
        
        next(); // Passe au middleware ou à la route suivante
    } catch (error) {
        logger.error('verifyFirebaseToken error', { 
            errorMessage: error.message,
            errorCode: error.code,
            errorDetails: error.toString()
        });
        
        return res.status(401).json({ 
            success: false,
            message: 'Accès refusé ! Token d\'authentification invalide ou expiré',
            error: error.message 
        });
    }
};

// Middleware alternative: vérifie le token sans vérifier l'existence de l'utilisateur dans Firestore
// Utile pour les routes de connexion où l'utilisateur sera créé automatiquement
const verifyTokenWithoutUserLookup = async function(req, res, next) {
    try {
        const header = req.headers.authorization || req.headers.Authorization;

        if (!header || !header.startsWith('Bearer ')) {
            logger.warn('Token manquant ou format invalide', { 
                hasHeader: !!header,
                headerStart: header?.substring(0, 20)
            });
            return res.status(401).json({ 
                success: false,
                message: 'Token d\'authentification manquant ou invalide' 
            });
        }
        
        const idToken = header.split(' ')[1];

        if (!idToken || idToken.trim().length === 0) {
            logger.warn('Token vide après extraction');
            return res.status(401).json({ 
                success: false,
                message: 'Token d\'authentification vide' 
            });
        }

        logger.info('Token reçu pour vérification (without user lookup)', { 
            tokenLength: idToken.length,
            startsWithJWT: idToken.startsWith('eyJ'),
            tokenPreview: idToken.substring(0, 50) + '...'
        });

        // Vérifie et décode le token Firebase
        const decodedToken = await admin.auth().verifyIdToken(idToken);

        logger.info('Token vérifié avec succès (no user lookup required)', { uid: decodedToken.uid });

        // Ajoute les informations de l'utilisateur décodé à la requête
        // Sans vérifier l'existence dans Firestore
        req.user = {
            uid: decodedToken.uid,
            email: decodedToken.email || null,
            displayName: decodedToken.name,
            isNewUser: true // Flag pour indiquer que c'est possiblement un nouvel utilisateur
        };
        
        next();
    } catch (error) {
        logger.error('verifyTokenWithoutUserLookup error', { 
            errorMessage: error.message,
            errorCode: error.code,
            errorDetails: error.toString()
        });
        
        return res.status(401).json({ 
            success: false,
            message: 'Accès refusé ! Token d\'authentification invalide ou expiré',
            error: error.message 
        });
    }
};

module.exports = verifyFirebaseToken;
module.exports.verifyTokenWithoutUserLookup = verifyTokenWithoutUserLookup;