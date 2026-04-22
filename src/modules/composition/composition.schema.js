const { addError, validateBoolean, validateArrayOfStrings, createSchemaValidator, isPlainObject } = require('../../shared/utils/validation');
const { normalizeString } = require('../../shared/utils/normalizers');

const validateCompositionInput = (payload, { isUpdate = false } = {}) => {
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
            addError(errors, 'name', 'Le nom de la composition est requis');
        } else {
            value.name = normalizeString(payload.name);
        }
    }

    if (payload.is_allergen !== undefined) {
        validateBoolean(payload.is_allergen, 'is_allergen', errors);
        if (typeof payload.is_allergen === 'boolean') {
            value.is_allergen = payload.is_allergen;
        }
    }

    if (payload.description !== undefined) {
        if (payload.description !== null && typeof payload.description !== 'string') {
            addError(errors, 'description', 'La description doit etre une chaine');
        } else {
            value.description = payload.description ? payload.description.trim() : '';
        }
    }

    if (payload.aliases !== undefined) {
        validateArrayOfStrings(payload.aliases, 'aliases', errors);
        if (Array.isArray(payload.aliases)) {
            value.aliases = payload.aliases.map((item) => item.trim()).filter(Boolean);
        }
    }

    if (payload.is_active !== undefined) {
        validateBoolean(payload.is_active, 'is_active', errors);
        if (typeof payload.is_active === 'boolean') {
            value.is_active = payload.is_active;
        }
    }

    if (isUpdate && Object.keys(value).length === 0 && errors.length === 0) {
        addError(errors, 'body', 'Aucun champ valide a mettre a jour');
    }

    return { value, errors };
};

module.exports = {
    createCompositionSchema: createSchemaValidator((payload) => validateCompositionInput(payload)),
    updateCompositionSchema: createSchemaValidator((payload) => validateCompositionInput(payload, { isUpdate: true }))
};
