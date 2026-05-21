require('dotenv').config();

module.exports = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: Number(process.env.PORT || 5000),
    firebaseApiKey: process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || '',
    auth: {
        bootstrapSecretConfigured: Boolean(process.env.PLATFORM_BOOTSTRAP_SECRET),
        tokenPepperConfigured: Boolean(process.env.AUTH_TOKEN_PEPPER),
        disableRateLimit: process.env.DISABLE_AUTH_RATE_LIMIT === 'true'
    }
};
