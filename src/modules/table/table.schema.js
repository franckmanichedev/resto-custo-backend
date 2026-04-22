const { addError, validateBoolean, createSchemaValidator, isPlainObject } = require('../../shared/utils/validation');
const { normalizeString } = require('../../shared/utils/normalizers');

const validateTableInput = (payload, { isUpdate = false } = {}) => {
    const errors = [];
    const value = {};

    if (!isPlainObject(payload)) {
        return {
            value: null,
            errors: [{ field: 'body', message: 'Le corps de la requete doit etre un objet JSON' }]
        };
    }

    if (!isUpdate || payload.name !== undefined) {
        if (typeof payload.name !== 'string' || !payload.name.trim()) {
            addError(errors, 'name', 'Le nom de la table est requis');
        } else {
            value.name = normalizeString(payload.name);
        }
    }

    if (!isUpdate || payload.number !== undefined) {
        if (typeof payload.number !== 'string' || !payload.number.trim()) {
            addError(errors, 'number', 'Le numero de la table est requis');
        } else {
            value.number = normalizeString(payload.number);
        }
    }

    if (payload.qr_code !== undefined) {
        if (typeof payload.qr_code !== 'string' || !payload.qr_code.trim()) {
            addError(errors, 'qr_code', 'qr_code doit etre une chaine non vide');
        } else {
            value.qr_code = normalizeString(payload.qr_code);
        }
    }

    if (payload.is_active !== undefined) {
        validateBoolean(payload.is_active, 'is_active', errors);
        if (typeof payload.is_active === 'boolean') {
            value.is_active = payload.is_active;
        }
    } else if (!isUpdate) {
        value.is_active = true;
    }

    if (isUpdate && Object.keys(value).length === 0 && errors.length === 0) {
        addError(errors, 'body', 'Aucun champ valide a mettre a jour');
    }

    return { value, errors };
};

module.exports = {
    createTableSchema: createSchemaValidator((payload) => validateTableInput(payload)),
    updateTableSchema: createSchemaValidator((payload) => validateTableInput(payload, { isUpdate: true }))
};
