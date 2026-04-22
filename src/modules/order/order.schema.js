const { ALLOWED_ORDER_STATUSES } = require('../../shared/constants/business');
const { addError, createSchemaValidator, isPlainObject } = require('../../shared/utils/validation');

const updateOrderStatusSchema = createSchemaValidator((payload) => {
    const errors = [];
    const value = {};

    if (!isPlainObject(payload)) {
        return {
            value: null,
            errors: [{ field: 'body', message: 'Le corps de la requete doit etre un objet JSON' }]
        };
    }

    const status = typeof payload.status === 'string' ? payload.status.trim().toLowerCase() : '';
    if (!ALLOWED_ORDER_STATUSES.includes(status)) {
        addError(errors, 'status', 'Statut invalide');
    } else {
        value.status = status;
    }

    return { value, errors };
});

module.exports = {
    updateOrderStatusSchema
};
