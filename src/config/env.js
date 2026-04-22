require('dotenv').config();

module.exports = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: Number(process.env.PORT || 5000),
    firebaseApiKey: process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || ''
};
