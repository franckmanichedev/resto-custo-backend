const logger = require('../utils/logger');

const validateRequest = (schemaOrFields) => (req, res, next) => {
    try {
        if (typeof schemaOrFields === 'function') {
            const result = schemaOrFields(req.body, req);
            if (result?.errors?.length) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation des donnees echouee',
                    errors: result.errors
                });
            }

            if (result?.value) {
                req.body = result.value;
            }

            return next();
        }

        if (schemaOrFields && typeof schemaOrFields === 'object' && typeof schemaOrFields.validate === 'function') {
            const { error, value } = schemaOrFields.validate(req.body, {
                abortEarly: false,
                stripUnknown: true
            });

            if (error) {
                const errors = error.details?.map((detail) => detail.message) || [error.message];
                logger.warn('Validation schema echouee', { errors, receivedBody: req.body });

                return res.status(400).json({
                    success: false,
                    message: 'Validation des donnees echouee',
                    errors
                });
            }

            req.body = value;
            return next();
        }

        const requiredFields = Array.isArray(schemaOrFields) ? schemaOrFields : [];
        const missingFields = [];
        const emptyFields = [];

        requiredFields.forEach((field) => {
            if (!(field in req.body)) {
                missingFields.push(field);
            } else if (!req.body[field] || String(req.body[field]).trim() === '') {
                emptyFields.push(field);
            }
        });

        if (missingFields.length > 0 || emptyFields.length > 0) {
            const errors = [];
            if (missingFields.length > 0) {
                errors.push(`Champs manquants: ${missingFields.join(', ')}`);
            }
            if (emptyFields.length > 0) {
                errors.push(`Champs vides: ${emptyFields.join(', ')}`);
            }

            logger.warn('Validation echouee', {
                missingFields,
                emptyFields,
                receivedBody: req.body
            });

            return res.status(400).json({
                success: false,
                message: 'Validation des donnees echouee',
                errors,
                missingFields,
                emptyFields
            });
        }

        next();
    } catch (error) {
        logger.error('Erreur interne de validation', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Erreur interne de validation'
        });
    }
};

module.exports = validateRequest;
