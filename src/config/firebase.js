// Connexion à firestore
const admin = require ("firebase-admin");

// Construire l'objet serviceAccount à partir des variables d'environnement
const serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
    universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN,
};

// Vérifier si Firebase est correctement configuré
const isFirebaseConfigured = () => {
    return serviceAccount.project_id && 
           serviceAccount.private_key && 
           serviceAccount.client_email;
};

let admin_initialized = false;
let db = null;
let storageBucket = null;

// Initialiser Firebase seulement si les credentials sont présentes
if (isFirebaseConfigured()) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET,
        });
        db = admin.firestore();
        storageBucket = admin.storage().bucket();
        admin_initialized = true;
    } catch (error) {
        console.error('Erreur lors de l\'initialisation Firebase:', error.message);
        // En test environment, on peut continuer sans Firebase
        if (process.env.NODE_ENV !== 'test') {
            throw error;
        }
    }
} else {
    // Si les credentials ne sont pas présentes, créer un stub pour les tests
    if (process.env.NODE_ENV !== 'test') {
        throw new Error(
            'Firebase credentials are not configured. ' +
            'Please set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL'
        );
    }
}

module.exports = { admin, db, storageBucket };
