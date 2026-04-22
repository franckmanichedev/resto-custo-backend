const { MENU_ITEM_KINDS } = require('../../shared/constants/business');
const { addError, validateBoolean, createSchemaValidator, isPlainObject } = require('../../shared/utils/validation');
const { normalizeString } = require('../../shared/utils/normalizers');

const validateCategoryInput = (payload, { isUpdate = false } = {}) => {
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
            addError(errors, 'name', 'Le nom de la categorie est requis');
        } else {
            value.name = normalizeString(payload.name);
        }
    }

    if (!isUpdate || payload.kind !== undefined) {
        const kind = normalizeString(payload.kind)?.toLowerCase();
        if (!kind) {
            addError(errors, 'kind', 'kind est requis');
        } else if (!MENU_ITEM_KINDS.includes(kind)) {
            addError(errors, 'kind', `kind doit etre une des valeurs suivantes: ${MENU_ITEM_KINDS.join(', ')}`);
        } else {
            value.kind = kind;
        }
    }

    if (payload.description !== undefined) {
        if (payload.description !== null && typeof payload.description !== 'string') {
            addError(errors, 'description', 'La description doit etre une chaine');
        } else {
            value.description = payload.description ? payload.description.trim() : '';
        }
    }

    if (payload.image_url !== undefined) {
        if (payload.image_url !== null && typeof payload.image_url !== 'string') {
            addError(errors, 'image_url', 'L URL de l image doit etre une chaine');
        } else {
            value.image_url = payload.image_url ? payload.image_url.trim() : '';
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

const validateTypeCategoryInput = (payload, { isUpdate = false } = {}) => {
    const errors = [];
    const value = {};

    if (!isPlainObject(payload)) {
        return {
            value: null,
            errors: [{ field: 'body', message: 'Le corps de la requete doit etre un objet JSON' }]
        };
    }

    if (!isUpdate || payload.categorie_id !== undefined) {
        if (typeof payload.categorie_id !== 'string' || !payload.categorie_id.trim()) {
            addError(errors, 'categorie_id', 'categorie_id est requis');
        } else {
            value.categorie_id = normalizeString(payload.categorie_id);
        }
    }

    if (!isUpdate || payload.name !== undefined) {
        if (typeof payload.name !== 'string' || !payload.name.trim()) {
            addError(errors, 'name', 'Le nom du type de categorie est requis');
        } else {
            value.name = normalizeString(payload.name);
        }
    }

    if (payload.description !== undefined) {
        if (payload.description !== null && typeof payload.description !== 'string') {
            addError(errors, 'description', 'La description doit etre une chaine');
        } else {
            value.description = payload.description ? payload.description.trim() : '';
        }
    }

    if (payload.image_url !== undefined) {
        if (payload.image_url !== null && typeof payload.image_url !== 'string') {
            addError(errors, 'image_url', 'L URL de l image doit etre une chaine');
        } else {
            value.image_url = payload.image_url ? payload.image_url.trim() : '';
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
    createCategorySchema: createSchemaValidator((payload) => validateCategoryInput(payload)),
    updateCategorySchema: createSchemaValidator((payload) => validateCategoryInput(payload, { isUpdate: true })),
    createTypeCategorySchema: createSchemaValidator((payload) => validateTypeCategoryInput(payload)),
    updateTypeCategorySchema: createSchemaValidator((payload) => validateTypeCategoryInput(payload, { isUpdate: true }))
};
