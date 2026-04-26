const { ROLES, normalizeRole, isPlatformRole } = require('../../shared/constants/roles');

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const normalizeTenantId = (payload = {}) => {
    const tenantId = payload.tenant_id ?? payload.tenantId ?? payload.restaurant_id ?? payload.restaurantId;
    return typeof tenantId === 'string' ? tenantId.trim() : tenantId;
};

const validateSignup = (payload = {}) => {
    const role = normalizeRole(payload.role);
    const value = {
        email: normalizeEmail(payload.email),
        password: payload.password,
        passwordConfirm: payload.passwordConfirm,
        name: typeof payload.name === 'string' ? payload.name.trim() : payload.name,
        phoneNumber: typeof payload.phoneNumber === 'string' ? payload.phoneNumber.trim() : payload.phoneNumber,
        role: role || ROLES.CUSTOMER,
        tenant_id: normalizeTenantId(payload) || null,
        restaurant_id: normalizeTenantId(payload) || null
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

    if (payload.role !== undefined) {
        if (!role) {
            errors.push({
                field: 'role',
                message: 'Role invalide'
            });
        } else if (isPlatformRole(role)) {
            errors.push({
                field: 'role',
                message: 'Les roles plateforme ne peuvent pas etre attribues via l\'inscription'
            });
        }
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
