const isPlainObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const addError = (errors, field, message) => {
    errors.push({ field, message });
};

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
        if (typeof item !== 'string' || !item.trim()) {
            addError(errors, `${field}[${index}]`, 'Chaque valeur doit etre une chaine non vide');
        }
    });
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

module.exports = {
    isPlainObject,
    addError,
    validateBoolean,
    validateNumber,
    validateArrayOfStrings,
    createSchemaValidator
};
