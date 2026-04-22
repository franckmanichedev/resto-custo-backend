const { MAX_NOTE_LENGTH, MENU_ITEM_CATEGORIES, MENU_ITEM_KINDS, WEEK_DAYS } = require('../../shared/constants/business');
const { addError, validateBoolean, validateNumber, createSchemaValidator, isPlainObject } = require('../../shared/utils/validation');
const { normalizeString } = require('../../shared/utils/normalizers');

const normalizeCompositionSelection = (item, index, errors) => {
    if (typeof item === 'string') {
        if (!item.trim()) {
            addError(errors, `compositionSelections[${index}]`, 'L identifiant de composition est vide');
            return null;
        }

        return { composition_id: item.trim() };
    }

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
        addError(errors, `compositionSelections[${index}]`, 'Chaque liaison doit etre une chaine ou un objet');
        return null;
    }

    const normalized = {};

    if (item.composition_id !== undefined) {
        if (typeof item.composition_id !== 'string' || !item.composition_id.trim()) {
            addError(errors, `compositionSelections[${index}].composition_id`, 'composition_id est invalide');
        } else {
            normalized.composition_id = item.composition_id.trim();
        }
    }

    if (item.name !== undefined) {
        if (typeof item.name !== 'string' || !item.name.trim()) {
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
        addError(errors, `compositionSelections[${index}]`, 'Chaque liaison doit contenir composition_id ou name');
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

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
        addError(errors, `newCompositions[${index}]`, 'Chaque nouvelle composition doit etre une chaine ou un objet');
        return null;
    }

    const normalized = {};
    if (typeof item.name !== 'string' || !item.name.trim()) {
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
        if (typeof item !== 'string' || !item.trim()) {
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

const validatePlatInput = (payload, { isUpdate = false } = {}) => {
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
            addError(errors, 'name', 'Le nom du plat est requis');
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
    } else if (!isUpdate) {
        value.description = '';
    }

    if (!isUpdate || payload.price !== undefined) {
        if (payload.price === undefined) {
            addError(errors, 'price', 'Le prix du plat est requis');
        } else {
            validateNumber(payload.price, 'price', errors, { min: 0 });
            if (typeof payload.price === 'number' && !Number.isNaN(payload.price)) {
                value.price = payload.price;
            }
        }
    }

    if (payload.prep_time !== undefined) {
        validateNumber(payload.prep_time, 'prep_time', errors, { min: 0 });
        if (typeof payload.prep_time === 'number' && !Number.isNaN(payload.prep_time)) {
            value.prep_time = payload.prep_time;
        }
    } else if (!isUpdate) {
        value.prep_time = 0;
    }

    if (payload.image_url !== undefined) {
        if (payload.image_url !== null && typeof payload.image_url !== 'string') {
            addError(errors, 'image_url', 'image_url doit etre une chaine');
        } else {
            value.image_url = payload.image_url ? payload.image_url.trim() : '';
        }
    } else if (!isUpdate) {
        value.image_url = '';
    }

    const resolveKind = (rawValue) => {
        const normalized = String(rawValue || '').trim().toLowerCase();
        return normalized === 'boisson' ? 'boisson' : 'plat';
    };

    if (payload.kind !== undefined) {
        if (typeof payload.kind !== 'string' || !payload.kind.trim()) {
            addError(errors, 'kind', 'kind est requis');
        } else {
            const normalizedKind = payload.kind.trim().toLowerCase();
            if (!MENU_ITEM_KINDS.includes(normalizedKind)) {
                addError(errors, 'kind', `kind doit etre une des valeurs suivantes: ${MENU_ITEM_KINDS.join(', ')}`);
            } else {
                value.kind = normalizedKind;
            }
        }
    }

    if (payload.category !== undefined) {
        if (typeof payload.category !== 'string' || !payload.category.trim()) {
            addError(errors, 'category', 'category est requis');
        } else {
            const normalizedCategory = payload.category.trim().toLowerCase();
            if (!MENU_ITEM_CATEGORIES.includes(normalizedCategory)) {
                addError(errors, 'category', `category doit etre une des valeurs suivantes: ${MENU_ITEM_CATEGORIES.join(', ')}`);
            } else {
                value.category = normalizedCategory;
                if (!value.kind) {
                    value.kind = resolveKind(normalizedCategory);
                }
            }
        }
    } else if (!isUpdate && !value.kind) {
        value.category = 'plat';
        value.kind = 'plat';
    }

    if (payload.categorie_id !== undefined) {
        if (payload.categorie_id !== null && (typeof payload.categorie_id !== 'string' || !payload.categorie_id.trim())) {
            addError(errors, 'categorie_id', 'categorie_id doit etre une chaine non vide ou null');
        } else {
            value.categorie_id = payload.categorie_id ? payload.categorie_id.trim() : null;
        }
    }

    if (payload.categorie_name !== undefined) {
        if (payload.categorie_name !== null && typeof payload.categorie_name !== 'string') {
            addError(errors, 'categorie_name', 'categorie_name doit etre une chaine');
        } else {
            value.categorie_name = payload.categorie_name ? payload.categorie_name.trim() : null;
        }
    }

    if (payload.type_categorie_id !== undefined) {
        if (payload.type_categorie_id !== null && (typeof payload.type_categorie_id !== 'string' || !payload.type_categorie_id.trim())) {
            addError(errors, 'type_categorie_id', 'type_categorie_id doit etre une chaine non vide ou null');
        } else {
            value.type_categorie_id = payload.type_categorie_id ? payload.type_categorie_id.trim() : null;
        }
    }

    if (payload.type_categorie_name !== undefined) {
        if (payload.type_categorie_name !== null && typeof payload.type_categorie_name !== 'string') {
            addError(errors, 'type_categorie_name', 'type_categorie_name doit etre une chaine');
        } else {
            value.type_categorie_name = payload.type_categorie_name ? payload.type_categorie_name.trim() : null;
        }
    }

    if (payload.is_promo !== undefined) {
        validateBoolean(payload.is_promo, 'is_promo', errors);
        if (typeof payload.is_promo === 'boolean') {
            value.is_promo = payload.is_promo;
        }
    } else if (!isUpdate) {
        value.is_promo = false;
    }

    if (payload.is_decomposable !== undefined) {
        validateBoolean(payload.is_decomposable, 'is_decomposable', errors);
        if (typeof payload.is_decomposable === 'boolean') {
            value.is_decomposable = payload.is_decomposable;
        }
    }

    if (payload.is_available !== undefined) {
        validateBoolean(payload.is_available, 'is_available', errors);
        if (typeof payload.is_available === 'boolean') {
            value.is_available = payload.is_available;
        }
    } else if (!isUpdate) {
        value.is_available = true;
    }

    if (payload.availability_mode !== undefined) {
        if (typeof payload.availability_mode !== 'string' || !payload.availability_mode.trim()) {
            addError(errors, 'availability_mode', 'availability_mode est requis');
        } else {
            const mode = payload.availability_mode.trim().toLowerCase();
            if (!['everyday', 'selected_days'].includes(mode)) {
                addError(errors, 'availability_mode', 'availability_mode doit etre everyday ou selected_days');
            } else {
                value.availability_mode = mode;
            }
        }
    } else if (!isUpdate) {
        value.availability_mode = 'everyday';
    }

    const selectedDays = validateWeekDays(payload.available_days, 'available_days', errors);
    if (payload.available_days !== undefined) {
        value.available_days = selectedDays;
    } else if (!isUpdate) {
        value.available_days = [];
    }

    if (payload.allow_custom_message !== undefined) {
        validateBoolean(payload.allow_custom_message, 'allow_custom_message', errors);
        if (typeof payload.allow_custom_message === 'boolean') {
            value.allow_custom_message = payload.allow_custom_message;
        }
    } else if (!isUpdate) {
        value.allow_custom_message = true;
    }

    if (payload.custom_message_hint !== undefined) {
        if (payload.custom_message_hint !== null && typeof payload.custom_message_hint !== 'string') {
            addError(errors, 'custom_message_hint', 'custom_message_hint doit etre une chaine');
        } else if (payload.custom_message_hint && payload.custom_message_hint.length > MAX_NOTE_LENGTH) {
            addError(errors, 'custom_message_hint', `custom_message_hint ne doit pas depasser ${MAX_NOTE_LENGTH} caracteres`);
        } else {
            value.custom_message_hint = payload.custom_message_hint ? payload.custom_message_hint.trim() : '';
        }
    } else if (!isUpdate) {
        value.custom_message_hint = '';
    }

    const compositionSelections = [];

    if (payload.compositionSelections !== undefined) {
        if (!Array.isArray(payload.compositionSelections)) {
            addError(errors, 'compositionSelections', 'compositionSelections doit etre un tableau');
        } else {
            compositionSelections.push(
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
            compositionSelections.push(
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
            compositionSelections.push(
                ...payload.newCompositions
                    .map((item, index) => normalizeNewComposition(item, index, errors))
                    .filter(Boolean)
            );
        }
    }

    if (compositionSelections.length > 0) {
        value.compositionSelections = compositionSelections;
    }

    if ((value.availability_mode || 'everyday') === 'selected_days' && (value.available_days || []).length === 0) {
        addError(errors, 'available_days', 'Veuillez selectionner au moins un jour si availability_mode = selected_days');
    }

    if (isUpdate && Object.keys(value).length === 0 && errors.length === 0) {
        addError(errors, 'body', 'Aucun champ valide a mettre a jour');
    }

    return { value, errors };
};

module.exports = {
    createPlatSchema: createSchemaValidator((payload) => validatePlatInput(payload)),
    updatePlatSchema: createSchemaValidator((payload) => validatePlatInput(payload, { isUpdate: true }))
};
