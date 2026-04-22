const logger = require('../utils/logger');

const errorHandler = (error, req, res, next) => {
    // Log l'erreur
    logger.error('Error caught by error handler', {
        message: error.message,
        stack: error.stack,
        statusCode: error.statusCode || 500,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    // Détermine le status code
    const statusCode = error.statusCode || 500;

    // Prépare la réponse d'erreur
    const errorResponse = {
        success: false,
        message: error.message || 'Une erreur interne est survenue',
        ...(error.details && { details: error.details }),
        ...(process.env.NODE_ENV === 'development' && {
            stack: error.stack,
            error: error.name
        })
    };

    // Envoie la réponse
    res.status(statusCode).json(errorResponse);
};

module.exports = errorHandler;