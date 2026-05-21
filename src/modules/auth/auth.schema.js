const { ROLES, normalizeRole, isPlatformRole } = require('../../shared/constants/roles');

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const normalizeTenantId = (payload = {}) => {
    const tenantId = payload.tenant_id ?? payload.tenantId ?? payload.restaurant_id ?? payload.restaurantId;
    return typeof tenantId === 'string' ? tenantId.trim() : tenantId;
};

const validateSafeName = (field, value, errors, { min = 2, max = 120 } = {}) => {
    if (!value || value.length < min || value.length > max) {
        errors.push({ field, message: `${field} doit contenir entre ${min} et ${max} caracteres` });
        return;
    }
    if (/[<>`{}$]/.test(value)) {
        errors.push({ field, message: `${field} contient des caracteres interdits` });
    }
};

const validatePasswordPolicy = (password, errors) => {
    if (!password) {
        errors.push({ field: 'password', message: 'Mot de passe requis' });
        return;
    }
    if (String(password).length < 8) {
        errors.push({ field: 'password', message: 'Le mot de passe doit contenir au moins 8 caracteres' });
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        errors.push({ field: 'password', message: 'Le mot de passe doit contenir au moins une lettre et un chiffre' });
    }
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

    validatePasswordPolicy(value.password, errors);

    if (!value.passwordConfirm) {
        errors.push({ field: 'passwordConfirm', message: 'Confirmation du mot de passe requise' });
    }

    if (!value.name) {
        errors.push({ field: 'name', message: 'Nom requis' });
    } else {
        validateSafeName('name', value.name, errors);
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

const validateResendVerification = (payload = {}) => {
    const value = {
        email: normalizeEmail(payload.email),
        uid: payload.uid ? String(payload.uid).trim() : null
    };

    const errors = [];
    if (!value.email && !value.uid) {
        errors.push({ field: 'email', message: 'Email ou uid requis' });
    }

    return { value, errors };
};

const validatePasswordResetRequest = (payload = {}) => {
    const value = {
        email: normalizeEmail(payload.email)
    };

    const errors = [];
    if (!value.email) {
        errors.push({ field: 'email', message: 'Email requis' });
    }

    return { value, errors };
};

const validatePasswordResetConfirm = (payload = {}) => {
    const value = {
        oobCode: typeof payload.oobCode === 'string' ? payload.oobCode.trim() : '',
        password: payload.password
    };

    const errors = [];
    if (!value.oobCode) {
        errors.push({ field: 'oobCode', message: 'Code de reinitialisation requis' });
    }
    validatePasswordPolicy(value.password, errors);

    return { value, errors };
};

const validateResetCode = (payload = {}) => {
    const value = {
        oobCode: typeof payload.oobCode === 'string' ? payload.oobCode.trim() : ''
    };

    const errors = [];
    if (!value.oobCode) {
        errors.push({ field: 'oobCode', message: 'Code de reinitialisation requis' });
    }

    return { value, errors };
};

const validateApplyAction = (payload = {}) => {
    const value = {
        code: typeof payload.code === 'string' ? payload.code.trim() : ''
    };

    const errors = [];
    if (!value.code) {
        errors.push({ field: 'code', message: 'Code d action requis' });
    }

    return { value, errors };
};

const validateRegisterOrganization = (payload = {}) => {
    const value = {
        fullName: typeof payload.fullName === 'string' ? payload.fullName.trim() : '',
        email: normalizeEmail(payload.email),
        password: payload.password,
        organizationName: typeof payload.organizationName === 'string' ? payload.organizationName.trim() : '',
        branchName: typeof payload.branchName === 'string' ? payload.branchName.trim() : '',
        phone: typeof payload.phone === 'string' ? payload.phone.trim() : '',
        cuisineType: typeof payload.cuisineType === 'string' ? payload.cuisineType.trim() : '',
        city: typeof payload.city === 'string' ? payload.city.trim() : ''
    };
    const errors = [];
    ['fullName', 'email', 'organizationName', 'branchName'].forEach((field) => {
        if (!value[field]) errors.push({ field, message: `${field} requis` });
    });
    validatePasswordPolicy(value.password, errors);
    if (value.fullName) validateSafeName('fullName', value.fullName, errors);
    if (value.organizationName) validateSafeName('organizationName', value.organizationName, errors);
    if (value.branchName) validateSafeName('branchName', value.branchName, errors);
    return { value, errors };
};

const validateRegisterFranchise = (payload = {}) => {
    const value = {
        fullName: typeof payload.fullName === 'string' ? payload.fullName.trim() : '',
        email: normalizeEmail(payload.email),
        password: payload.password,
        organizationName: typeof payload.organizationName === 'string' ? payload.organizationName.trim() : '',
        expectedBranches: Number(payload.expectedBranches || 1),
        enterprisePlan: typeof payload.enterprisePlan === 'string' ? payload.enterprisePlan.trim() : 'enterprise',
        phone: typeof payload.phone === 'string' ? payload.phone.trim() : ''
    };
    const errors = [];
    ['fullName', 'email', 'organizationName'].forEach((field) => {
        if (!value[field]) errors.push({ field, message: `${field} requis` });
    });
    validatePasswordPolicy(value.password, errors);
    if (value.fullName) validateSafeName('fullName', value.fullName, errors);
    if (value.organizationName) validateSafeName('organizationName', value.organizationName, errors);
    if (!Number.isFinite(value.expectedBranches) || value.expectedBranches < 1) {
        errors.push({ field: 'expectedBranches', message: 'expectedBranches doit etre superieur a 0' });
    }
    return { value, errors };
};

const validateCreateInvitation = (payload = {}) => {
    const role = normalizeRole(payload.role);
    const value = {
        email: normalizeEmail(payload.email),
        role,
        organizationId: typeof payload.organizationId === 'string' ? payload.organizationId.trim() : null,
        branchId: typeof payload.branchId === 'string' ? payload.branchId.trim() : null,
        expiresInDays: payload.expiresInDays ? Number(payload.expiresInDays) : 7
    };
    const errors = [];
    if (!value.email) errors.push({ field: 'email', message: 'Email requis' });
    if (!value.role) errors.push({ field: 'role', message: 'Role invalide' });
    if (value.expiresInDays < 1 || value.expiresInDays > 30) {
        errors.push({ field: 'expiresInDays', message: 'Expiration invalide' });
    }
    return { value, errors };
};

const validateAcceptInvitation = (payload = {}) => {
    const value = {
        token: typeof payload.token === 'string' ? payload.token.trim() : '',
        fullName: typeof payload.fullName === 'string' ? payload.fullName.trim() : '',
        email: normalizeEmail(payload.email),
        password: payload.password,
        phone: typeof payload.phone === 'string' ? payload.phone.trim() : ''
    };
    const errors = [];
    ['token', 'fullName', 'email'].forEach((field) => {
        if (!value[field]) errors.push({ field, message: `${field} requis` });
    });
    validatePasswordPolicy(value.password, errors);
    if (value.fullName) validateSafeName('fullName', value.fullName, errors);
    return { value, errors };
};

const validateBootstrapPlatformOwner = (payload = {}) => {
    const value = {
        fullName: typeof payload.fullName === 'string' ? payload.fullName.trim() : '',
        email: normalizeEmail(payload.email),
        password: payload.password,
        bootstrapSecret: typeof payload.bootstrapSecret === 'string' ? payload.bootstrapSecret.trim() : ''
    };
    const errors = [];
    ['fullName', 'email'].forEach((field) => {
        if (!value[field]) errors.push({ field, message: `${field} requis` });
    });
    validatePasswordPolicy(value.password, errors);
    if (value.fullName) validateSafeName('fullName', value.fullName, errors);
    return { value, errors };
};

module.exports = {
    validateSignup,
    validateEmailLookup,
    validateLogin,
    validateResendVerification,
    validatePasswordResetRequest,
    validatePasswordResetConfirm,
    validateResetCode,
    validateApplyAction,
    validateRegisterOrganization,
    validateRegisterFranchise,
    validateCreateInvitation,
    validateAcceptInvitation,
    validateBootstrapPlatformOwner
};
