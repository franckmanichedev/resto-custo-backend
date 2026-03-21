const express = require('express');
const router = express.Router();
const authController = require('../controller/authController');
const verifyFirebaseToken = require('../middlewares/verifyFirebaseToken');
const validateRequest = require('../middlewares/validateRequest');

// =====================================================
// ROUTES PUBLIQUES (Sans authentification)
// =====================================================

/**
 * POST /api/auth/signup
 * Inscrit un nouvel utilisateur avec email/password
 * Body: { email, password, passwordConfirm, name, phoneNumber? }
 */
router.post('/signup', 
    validateRequest(['email', 'password', 'passwordConfirm', 'name']),
    authController.createUserWithEmail
);

/**
 * POST /api/auth/check-email
 * Vérifie si un email existe et retourne les méthodes d'authentification disponibles
 * Body: { email }
 */
router.post('/check-email', authController.checkEmailExists);

/**
 * POST /api/auth/login
 * Connexion avec email/password
 * Body: { email, password }
 */
router.post('/login', authController.loginWithEmailPassword);

/**
 * POST /api/auth/logout
 * Déconnexion utilisateur
 * Le client gère le nettoyage du localStorage
 */
router.post('/logout', authController.logout);

/**
 * POST /api/auth/create-user-from-token
 * Crée un utilisateur dans Firestore à partir d'un token Firebase
 * Utilisé après une authentification OAuth/Token
 * Headers: Authorization: Bearer <idToken>
 */
router.post('/create-user-from-token',
    verifyFirebaseToken,
    authController.createUserFromToken
);

// =====================================================
// ROUTES PROTÉGÉES (Avec authentification)
// =====================================================

/**
 * GET /api/auth/me
 * Récupère les informations de l'utilisateur connecté
 * Headers: Authorization: Bearer <idToken>
 */
router.get('/me', verifyFirebaseToken, authController.getAuthenticatedUser);

/**
 * GET /api/auth/profile/:id
 * Récupère le profil d'un utilisateur par son ID
 */
router.get('/profile/:id', authController.getProfile);

/**
 * PUT /api/auth/profile/:id
 * Met à jour le profil d'un utilisateur
 * Headers: Authorization: Bearer <idToken>
 */
router.put('/profile/:id', 
    verifyFirebaseToken,
    authController.updateProfile
);

module.exports = router;
