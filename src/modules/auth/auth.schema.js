const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const validateSignup = (payload = {}) => {
    const value = {
        email: normalizeEmail(payload.email),
        password: payload.password,
        passwordConfirm: payload.passwordConfirm,
        name: typeof payload.name === 'string' ? payload.name.trim() : payload.name,
        phoneNumber: typeof payload.phoneNumber === 'string' ? payload.phoneNumber.trim() : payload.phoneNumber,
        role: typeof payload.role === 'string' ? payload.role.trim().toLowerCase() : payload.role,
        restaurant_id: typeof payload.restaurant_id === 'string' ? payload.restaurant_id.trim() : payload.restaurant_id
    };

    const errors = [];

    if (!value.email) {
        errors.push({ field: 'email', message: 'Email requis' });
    }

    if (!value.password) {
        errors.push({ field: 'password', message: 'Mot de passe requis' });
    }

    if (!value.passwordConfirm) {
        errors.push({ field: 'passwordConfirm', message: 'Confirmation du mot de passe requise' });
    }

    if (!value.name) {
        errors.push({ field: 'name', message: 'Nom requis' });
    }

    return { value, errors };
};

const validateEmailLookup = (payload = {}) => {
    const email = normalizeEmail(payload.email || payload?.data?.email || payload?.email?.email);
    return {
        value: { email },
        errors: email ? [] : [{ field: 'email', message: 'Email invalide ou mal formate' }]
    };
};

const validateLogin = (payload = {}) => {
    const value = {
        email: normalizeEmail(payload.email),
        password: payload.password
    };

    const errors = [];
    if (!value.email) {
        errors.push({ field: 'email', message: 'Email requis' });
    }
    if (!value.password) {
        errors.push({ field: 'password', message: 'Mot de passe requis' });
    }

    return { value, errors };
};

module.exports = {
    validateSignup,
    validateEmailLookup,
    validateLogin
};
