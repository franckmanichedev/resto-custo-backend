const MAX_NOTE_LENGTH = 500;
const WEEK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const MENU_ITEM_CATEGORIES = ['plat', 'boisson', 'entree'];

const isPlainObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const addError = (errors, field, message) => {
    errors.push({ field, message });
};

const isNonEmptyString = (value) =>
    typeof value === 'string' && value.trim().length > 0;

const normalizeString = (value) =>
    typeof value === 'string' ? value.trim() : value;

const validateBoolean = (value, field, errors) => {
    if (value !== undefined && typeof value !== 'boolean') {
        addError(errors, field, `${field} doit etre un boolean`);
    }
};

const validateNumber = (value, field, errors, options = {}) => {
    if (value === undefined) {
        return;
    }

    if (typeof value !== 'number' || Number.isNaN(value)) {
        addError(errors, field, `${field} doit etre un nombre`);
        return;
    }

    if (options.min !== undefined && value < options.min) {
        addError(errors, field, `${field} doit etre superieur ou egal a ${options.min}`);
    }
};

const validateArrayOfStrings = (value, field, errors) => {
    if (value === undefined) {
        return;
    }

    if (!Array.isArray(value)) {
        addError(errors, field, `${field} doit etre un tableau`);
        return;
    }

    value.forEach((item, index) => {
        if (!isNonEmptyString(item)) {
            addError(errors, `${field}[${index}]`, 'Chaque valeur doit etre une chaine non vide');
        }
    });
};

const validateWeekDays = (value, field, errors) => {
    if (value === undefined) {
        return [];
    }

    if (!Array.isArray(value)) {
        addError(errors, field, `${field} doit etre un tableau`);
        return [];
    }

    const normalized = [];

    value.forEach((item, index) => {
        if (!isNonEmptyString(item)) {
            addError(errors, `${field}[${index}]`, 'Chaque jour doit etre une chaine non vide');
            return;
        }

        const day = item.trim().toLowerCase();
        if (!WEEK_DAYS.includes(day)) {
            addError(errors, `${field}[${index}]`, `Jour invalide: ${item}`);
            return;
        }

        if (!normalized.includes(day)) {
            normalized.push(day);
        }
    });

    return normalized;
};

const validateCompositionInput = (payload, { isUpdate = false } = {}) => {
    const errors = [];
    const data = {};

    if (!isPlainObject(payload)) {
        return {
            value: null,
            errors: [{ field: 'body', message: 'Le corps de la requete doit etre un objet JSON' }]
        };
    }

    if (!isUpdate || payload.name !== undefined) {
        if (!isNonEmptyString(payload.name)) {
            addError(errors, 'name', 'Le nom de la composition est requis');
        } else {
            data.name = normalizeString(payload.name);
        }
    }

    if (payload.is_allergen !== undefined) {
        validateBoolean(payload.is_allergen, 'is_allergen', errors);
        if (typeof payload.is_allergen === 'boolean') {
            data.is_allergen = payload.is_allergen;
        }
    }

    if (payload.description !== undefined) {
        if (payload.description !== null && typeof payload.description !== 'string') {
            addError(errors, 'description', 'La description doit etre une chaine');
        } else {
            data.description = payload.description ? payload.description.trim() : '';
        }
    }

    if (payload.aliases !== undefined) {
        validateArrayOfStrings(payload.aliases, 'aliases', errors);
        if (Array.isArray(payload.aliases)) {
            data.aliases = payload.aliases.map((item) => item.trim()).filter(Boolean);
        }
    }

    if (payload.is_active !== undefined) {
        validateBoolean(payload.is_active, 'is_active', errors);
        if (typeof payload.is_active === 'boolean') {
            data.is_active = payload.is_active;
        }
    }

    if (isUpdate && Object.keys(data).length === 0) {
        addError(errors, 'body', 'Aucun champ valide a mettre a jour');
    }

    return { value: data, errors };
};

const normalizeCompositionSelection = (item, index, errors) => {
    if (typeof item === 'string') {
        if (!item.trim()) {
            addError(errors, `compositionSelections[${index}]`, 'L identifiant de composition est vide');
            return null;
        }

        return { composition_id: item.trim() };
    }

    if (!isPlainObject(item)) {
        addError(errors, `compositionSelections[${index}]`, 'Chaque liaison doit etre une chaine ou un objet');
        return null;
    }

    const normalized = {};

    if (item.composition_id !== undefined) {
        if (!isNonEmptyString(item.composition_id)) {
            addError(errors, `compositionSelections[${index}].composition_id`, 'composition_id est invalide');
        } else {
            normalized.composition_id = item.composition_id.trim();
        }
    }

    if (item.name !== undefined) {
        if (!isNonEmptyString(item.name)) {
            addError(errors, `compositionSelections[${index}].name`, 'Le nom est invalide');
        } else {
            normalized.name = item.name.trim();
        }
    }

    if (item.is_allergen !== undefined) {
        validateBoolean(item.is_allergen, `compositionSelections[${index}].is_allergen`, errors);
        if (typeof item.is_allergen === 'boolean') {
            normalized.is_allergen = item.is_allergen;
        }
    }

    if (item.description !== undefined) {
        if (item.description !== null && typeof item.description !== 'string') {
            addError(errors, `compositionSelections[${index}].description`, 'La description doit etre une chaine');
        } else {
            normalized.description = item.description ? item.description.trim() : '';
        }
    }

    if (!normalized.composition_id && !normalized.name) {
        addError(
            errors,
            `compositionSelections[${index}]`,
            'Chaque liaison doit contenir composition_id ou name'
        );
    }

    return normalized;
};

const normalizeNewComposition = (item, index, errors) => {
    if (typeof item === 'string') {
        if (!item.trim()) {
            addError(errors, `newCompositions[${index}]`, 'Le nom de la composition est vide');
            return null;
        }

        return { name: item.trim() };
    }

    if (!isPlainObject(item)) {
        addError(errors, `newCompositions[${index}]`, 'Chaque nouvelle composition doit etre une chaine ou un objet');
        return null;
    }

    const normalized = {};

    if (!isNonEmptyString(item.name)) {
        addError(errors, `newCompositions[${index}].name`, 'Le nom est requis');
    } else {
        normalized.name = item.name.trim();
    }

    if (item.is_allergen !== undefined) {
        validateBoolean(item.is_allergen, `newCompositions[${index}].is_allergen`, errors);
        if (typeof item.is_allergen === 'boolean') {
            normalized.is_allergen = item.is_allergen;
        }
    }

    if (item.description !== undefined) {
        if (item.description !== null && typeof item.description !== 'string') {
            addError(errors, `newCompositions[${index}].description`, 'La description doit etre une chaine');
        } else {
            normalized.description = item.description ? item.description.trim() : '';
        }
    }

    return normalized;
};

const validatePlatInput = (payload, { isUpdate = false } = {}) => {
    const errors = [];
    const data = {};

    if (!isPlainObject(payload)) {
        return {
            value: null,
            errors: [{ field: 'body', message: 'Le corps de la requete doit etre un objet JSON' }]
        };
    }

    if (!isUpdate || payload.name !== undefined) {
        if (!isNonEmptyString(payload.name)) {
            addError(errors, 'name', 'Le nom du plat est requis');
        } else {
            data.name = payload.name.trim();
        }
    }

    if (payload.description !== undefined) {
        if (payload.description !== null && typeof payload.description !== 'string') {
            addError(errors, 'description', 'La description doit etre une chaine');
        } else {
            data.description = payload.description ? payload.description.trim() : '';
        }
    } else if (!isUpdate) {
        data.description = '';
    }

    if (!isUpdate || payload.price !== undefined) {
        if (payload.price === undefined) {
            addError(errors, 'price', 'Le prix du plat est requis');
        } else {
            validateNumber(payload.price, 'price', errors, { min: 0 });
            if (typeof payload.price === 'number' && !Number.isNaN(payload.price)) {
                data.price = payload.price;
            }
        }
    }

    if (payload.prep_time !== undefined) {
        validateNumber(payload.prep_time, 'prep_time', errors, { min: 0 });
        if (typeof payload.prep_time === 'number' && !Number.isNaN(payload.prep_time)) {
            data.prep_time = payload.prep_time;
        }
    } else if (!isUpdate) {
        data.prep_time = 0;
    }

    if (payload.image_url !== undefined) {
        if (payload.image_url !== null && typeof payload.image_url !== 'string') {
            addError(errors, 'image_url', 'image_url doit etre une chaine');
        } else {
            data.image_url = payload.image_url ? payload.image_url.trim() : '';
        }
    } else if (!isUpdate) {
        data.image_url = '';
    }

    if (payload.category !== undefined) {
        if (!isNonEmptyString(payload.category)) {
            addError(errors, 'category', 'category est requis');
        } else {
            const normalizedCategory = payload.category.trim().toLowerCase();
            if (!MENU_ITEM_CATEGORIES.includes(normalizedCategory)) {
                addError(errors, 'category', `category doit etre une des valeurs suivantes: ${MENU_ITEM_CATEGORIES.join(', ')}`);
            } else {
                data.category = normalizedCategory;
            }
        }
    } else if (!isUpdate) {
        data.category = 'plat';
    }

    if (payload.is_promo !== undefined) {
        validateBoolean(payload.is_promo, 'is_promo', errors);
        if (typeof payload.is_promo === 'boolean') {
            data.is_promo = payload.is_promo;
        }
    } else if (!isUpdate) {
        data.is_promo = false;
    }

    if (payload.is_decomposable !== undefined) {
        validateBoolean(payload.is_decomposable, 'is_decomposable', errors);
        if (typeof payload.is_decomposable === 'boolean') {
            data.is_decomposable = payload.is_decomposable;
        }
    }

    if (payload.is_available !== undefined) {
        validateBoolean(payload.is_available, 'is_available', errors);
        if (typeof payload.is_available === 'boolean') {
            data.is_available = payload.is_available;
        }
    } else if (!isUpdate) {
        data.is_available = true;
    }

    if (payload.availability_mode !== undefined) {
        if (!isNonEmptyString(payload.availability_mode)) {
            addError(errors, 'availability_mode', 'availability_mode est requis');
        } else {
            const mode = payload.availability_mode.trim().toLowerCase();
            if (!['everyday', 'selected_days'].includes(mode)) {
                addError(errors, 'availability_mode', 'availability_mode doit etre everyday ou selected_days');
            } else {
                data.availability_mode = mode;
            }
        }
    } else if (!isUpdate) {
        data.availability_mode = 'everyday';
    }

    const selectedDays = validateWeekDays(payload.available_days, 'available_days', errors);
    if (payload.available_days !== undefined) {
        data.available_days = selectedDays;
    } else if (!isUpdate) {
        data.available_days = [];
    }

    if (payload.allow_custom_message !== undefined) {
        validateBoolean(payload.allow_custom_message, 'allow_custom_message', errors);
        if (typeof payload.allow_custom_message === 'boolean') {
            data.allow_custom_message = payload.allow_custom_message;
        }
    } else if (!isUpdate) {
        data.allow_custom_message = true;
    }

    if (payload.custom_message_hint !== undefined) {
        if (payload.custom_message_hint !== null && typeof payload.custom_message_hint !== 'string') {
            addError(errors, 'custom_message_hint', 'custom_message_hint doit etre une chaine');
        } else if (payload.custom_message_hint && payload.custom_message_hint.length > MAX_NOTE_LENGTH) {
            addError(errors, 'custom_message_hint', `custom_message_hint ne doit pas depasser ${MAX_NOTE_LENGTH} caracteres`);
        } else {
            data.custom_message_hint = payload.custom_message_hint ? payload.custom_message_hint.trim() : '';
        }
    } else if (!isUpdate) {
        data.custom_message_hint = '';
    }

    const rawCompositionSelections = [];

    if (payload.compositionSelections !== undefined) {
        if (!Array.isArray(payload.compositionSelections)) {
            addError(errors, 'compositionSelections', 'compositionSelections doit etre un tableau');
        } else {
            rawCompositionSelections.push(
                ...payload.compositionSelections
                    .map((item, index) => normalizeCompositionSelection(item, index, errors))
                    .filter(Boolean)
            );
        }
    }

    if (payload.compositionIds !== undefined) {
        if (!Array.isArray(payload.compositionIds)) {
            addError(errors, 'compositionIds', 'compositionIds doit etre un tableau');
        } else {
            rawCompositionSelections.push(
                ...payload.compositionIds
                    .map((item, index) => normalizeCompositionSelection(item, index, errors))
                    .filter(Boolean)
            );
        }
    }

    if (payload.newCompositions !== undefined) {
        if (!Array.isArray(payload.newCompositions)) {
            addError(errors, 'newCompositions', 'newCompositions doit etre un tableau');
        } else {
            rawCompositionSelections.push(
                ...payload.newCompositions
                    .map((item, index) => normalizeNewComposition(item, index, errors))
                    .filter(Boolean)
            );
        }
    }

    if (rawCompositionSelections.length > 0) {
        data.compositionSelections = rawCompositionSelections;
    }

    const effectiveMode = data.availability_mode || (isUpdate ? null : 'everyday');
    if (effectiveMode === 'selected_days') {
        const days = data.available_days || [];
        if (days.length === 0) {
            addError(errors, 'available_days', 'Veuillez selectionner au moins un jour si availability_mode = selected_days');
        }
    }

    if (isUpdate && Object.keys(data).length === 0) {
        addError(errors, 'body', 'Aucun champ valide a mettre a jour');
    }

    return { value: data, errors };
};

const validateTableInput = (payload, { isUpdate = false } = {}) => {
    const errors = [];
    const data = {};

    if (!isPlainObject(payload)) {
        return {
            value: null,
            errors: [{ field: 'body', message: 'Le corps de la requete doit etre un objet JSON' }]
        };
    }

    if (!isUpdate || payload.name !== undefined) {
        if (!isNonEmptyString(payload.name)) {
            addError(errors, 'name', 'Le nom de la table est requis');
        } else {
            data.name = payload.name.trim();
        }
    }

    if (!isUpdate || payload.number !== undefined) {
        if (!isNonEmptyString(payload.number)) {
            addError(errors, 'number', 'Le numero de la table est requis');
        } else {
            data.number = payload.number.trim();
        }
    }

    if (payload.qr_code !== undefined) {
        if (!isNonEmptyString(payload.qr_code)) {
            addError(errors, 'qr_code', 'qr_code doit etre une chaine non vide');
        } else {
            data.qr_code = payload.qr_code.trim();
        }
    }

    if (payload.is_active !== undefined) {
        validateBoolean(payload.is_active, 'is_active', errors);
        if (typeof payload.is_active === 'boolean') {
            data.is_active = payload.is_active;
        }
    } else if (!isUpdate) {
        data.is_active = true;
    }

    if (isUpdate && Object.keys(data).length === 0) {
        addError(errors, 'body', 'Aucun champ valide a mettre a jour');
    }

    return { value: data, errors };
};

const createSchemaValidator = (validator) => ({
    validate(payload) {
        const { value, errors } = validator(payload);

        if (errors.length > 0) {
            return {
                error: {
                    details: errors.map(({ field, message }) => ({
                        path: [field],
                        message
                    }))
                },
                value
            };
        }

        return { value };
    }
});

const registerSchema = createSchemaValidator((payload) => {
    const errors = [];
    const value = {};

    if (!isPlainObject(payload)) {
        addError(errors, 'body', 'Le corps de la requete doit etre un objet JSON');
        return { value: null, errors };
    }

    ['email', 'password', 'firstName', 'lastName', 'role'].forEach((field) => {
        if (!isNonEmptyString(payload[field])) {
            addError(errors, field, `${field} est requis`);
        } else {
            value[field] = payload[field].trim();
        }
    });

    return { value, errors };
});

const loginSchema = createSchemaValidator((payload) => {
    const errors = [];
    const value = {};

    if (!isPlainObject(payload)) {
        addError(errors, 'body', 'Le corps de la requete doit etre un objet JSON');
        return { value: null, errors };
    }

    ['email', 'password'].forEach((field) => {
        if (!isNonEmptyString(payload[field])) {
            addError(errors, field, `${field} est requis`);
        } else {
            value[field] = payload[field].trim();
        }
    });

    return { value, errors };
});

const passThroughSchema = createSchemaValidator((payload) => ({
    value: isPlainObject(payload) ? payload : {},
    errors: []
}));

module.exports = {
    registerSchema,
    loginSchema,
    createTaskSchema: passThroughSchema,
    updateTaskSchema: passThroughSchema,
    createApplicationSchema: passThroughSchema,
    updateUserProfileSchema: passThroughSchema,
    addSkillSchema: passThroughSchema,
    updateWorkerSkillSchema: passThroughSchema,
    createCompositionSchema: createSchemaValidator((payload) => validateCompositionInput(payload)),
    updateCompositionSchema: createSchemaValidator((payload) => validateCompositionInput(payload, { isUpdate: true })),
    createPlatSchema: createSchemaValidator((payload) => validatePlatInput(payload)),
    updatePlatSchema: createSchemaValidator((payload) => validatePlatInput(payload, { isUpdate: true })),
    createTableSchema: createSchemaValidator((payload) => validateTableInput(payload)),
    updateTableSchema: createSchemaValidator((payload) => validateTableInput(payload, { isUpdate: true }))
};
