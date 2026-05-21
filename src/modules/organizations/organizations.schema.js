const { addError, createSchemaValidator, isPlainObject, validateBoolean } = require('../../shared/utils/validation');
const { normalizeString } = require('../../shared/utils/normalizers');
const { createSlug } = require('../../shared/utils/slug');

const ORGANIZATION_TYPES = ['independent', 'chain', 'franchise'];

const sanitizeObject = (value) => (isPlainObject(value) ? value : {});

const validateOrganizationInput = (payload, { isUpdate = false } = {}) => {
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
            addError(errors, 'name', 'Le nom de l organisation est requis');
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

    if (!isUpdate || payload.type !== undefined) {
        const type = normalizeString(payload.type || 'independent');
        if (!ORGANIZATION_TYPES.includes(type)) {
            addError(errors, 'type', `type doit etre une des valeurs suivantes: ${ORGANIZATION_TYPES.join(', ')}`);
        } else {
            value.type = type;
        }
    }

    if (payload.subscriptionPlan !== undefined) {
        value.subscriptionPlan = normalizeString(payload.subscriptionPlan || 'starter');
    }

    if (payload.isActive !== undefined) {
        validateBoolean(payload.isActive, 'isActive', errors);
        if (typeof payload.isActive === 'boolean') {
            value.isActive = payload.isActive;
        }
    }

    if (payload.ownerUserId !== undefined) {
        value.ownerUserId = payload.ownerUserId ? normalizeString(payload.ownerUserId) : null;
    }

    if (payload.contact !== undefined) {
        if (!isPlainObject(payload.contact)) {
            addError(errors, 'contact', 'contact doit etre un objet');
        } else {
            value.contact = sanitizeObject(payload.contact);
        }
    }

    if (payload.metadata !== undefined) {
        if (!isPlainObject(payload.metadata)) {
            addError(errors, 'metadata', 'metadata doit etre un objet');
        } else {
            value.metadata = sanitizeObject(payload.metadata);
        }
    }

    if (isUpdate && Object.keys(value).length === 0 && errors.length === 0) {
        addError(errors, 'body', 'Aucun champ valide a mettre a jour');
    }

    return { value, errors };
};

module.exports = {
    createOrganizationSchema: createSchemaValidator((payload) => validateOrganizationInput(payload)),
    updateOrganizationSchema: createSchemaValidator((payload) => validateOrganizationInput(payload, { isUpdate: true })),
    ORGANIZATION_TYPES
};
