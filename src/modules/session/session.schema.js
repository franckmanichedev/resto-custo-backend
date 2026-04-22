const { addError, createSchemaValidator, isPlainObject } = require('../../shared/utils/validation');

const startTableSessionSchema = createSchemaValidator((payload) => {
    const errors = [];

    if (!isPlainObject(payload)) {
        return {
            value: null,
            errors: [{ field: 'body', message: 'Le corps de la requete doit etre un objet JSON' }]
        };
    }

    if (!payload.table_id && !payload.qr_code) {
        addError(errors, 'table_id', 'table_id ou qr_code est requis');
    }

    return { value: payload, errors };
});

const jsonBodySchema = createSchemaValidator((payload) => ({
    value: isPlainObject(payload) ? payload : {},
    errors: isPlainObject(payload) ? [] : [{ field: 'body', message: 'Le corps de la requete doit etre un objet JSON' }]
}));

module.exports = {
    startTableSessionSchema,
    jsonBodySchema
};
