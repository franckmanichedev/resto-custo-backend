const { addError, createSchemaValidator, isPlainObject, validateBoolean } = require('../../shared/utils/validation');
const { normalizeString } = require('../../shared/utils/normalizers');
const { createSlug } = require('../../shared/utils/slug');

const validateBranchInput = (payload, { isUpdate = false } = {}) => {
    const errors = [];
    const value = {};

    if (!isPlainObject(payload)) {
        return {
            value: null,
            errors: [{ field: 'body', message: 'Le corps de la requete doit etre un objet JSON' }]
        };
    }

    if (!isUpdate || payload.organizationId !== undefined) {
        if (typeof payload.organizationId !== 'string' || !payload.organizationId.trim()) {
            addError(errors, 'organizationId', 'organizationId est requis');
        } else {
            value.organizationId = normalizeString(payload.organizationId);
        }
    }

    if (!isUpdate || payload.name !== undefined) {
        if (typeof payload.name !== 'string' || !payload.name.trim()) {
            addError(errors, 'name', 'Le nom de la branche est requis');
        } else {
            value.name = normalizeString(payload.name);
        }
    }

    if (payload.slug !== undefined) {
        if (payload.slug !== null && typeof payload.slug !== 'string') {
            addError(errors, 'slug', 'Le slug doit etre une chaine');
        } else if (payload.slug) {
            value.slug = createSlug(payload.slug);
        }
    }

    ['code', 'address', 'city', 'country', 'phoneNumber', 'email'].forEach((field) => {
        if (payload[field] !== undefined) {
            if (payload[field] !== null && typeof payload[field] !== 'string') {
                addError(errors, field, `${field} doit etre une chaine`);
            } else {
                value[field] = payload[field] ? normalizeString(payload[field]) : '';
            }
        }
    });

    if (payload.isMainBranch !== undefined) {
        validateBoolean(payload.isMainBranch, 'isMainBranch', errors);
        if (typeof payload.isMainBranch === 'boolean') {
            value.isMainBranch = payload.isMainBranch;
        }
    }

    if (payload.isActive !== undefined) {
        validateBoolean(payload.isActive, 'isActive', errors);
        if (typeof payload.isActive === 'boolean') {
            value.isActive = payload.isActive;
        }
    }

    if (payload.metadata !== undefined) {
        if (!isPlainObject(payload.metadata)) {
            addError(errors, 'metadata', 'metadata doit etre un objet');
        } else {
            value.metadata = payload.metadata;
        }
    }

    if (isUpdate && Object.keys(value).length === 0 && errors.length === 0) {
        addError(errors, 'body', 'Aucun champ valide a mettre a jour');
    }

    return { value, errors };
};

module.exports = {
    createBranchSchema: createSchemaValidator((payload) => validateBranchInput(payload)),
    updateBranchSchema: createSchemaValidator((payload) => validateBranchInput(payload, { isUpdate: true }))
};
