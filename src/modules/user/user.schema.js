const { ROLES, normalizeRole, isPlatformRole } = require('../../shared/constants/roles');

const allowedRoles = [
    ROLES.CUSTOMER,
    ROLES.ADMIN,
    ROLES.MENU_MANAGER,
    ROLES.KITCHEN_STAFF
];

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : value);

const normalizeTenantId = (payload = {}) => {
    const tenantId = payload.tenant_id ?? payload.tenantId ?? payload.restaurant_id ?? payload.restaurantId;
    return typeof tenantId === 'string' ? tenantId.trim() : tenantId ?? null;
};

const validateProfileUpdate = (payload = {}) => {
    const errors = [];
    const value = {};

    if (payload.name !== undefined) {
        if (typeof payload.name !== 'string' || !payload.name.trim()) {
            errors.push({ field: 'name', message: 'Le nom doit etre une chaine non vide' });
        } else {
            value.name = payload.name.trim();
        }
    }

    if (payload.phoneNumber !== undefined) {
        if (payload.phoneNumber !== null && typeof payload.phoneNumber !== 'string') {
            errors.push({ field: 'phoneNumber', message: 'Le numero de telephone doit etre une chaine ou null' });
        } else {
            value.phoneNumber = normalizeString(payload.phoneNumber) || null;
        }
    }

    if (payload.role !== undefined) {
        const role = normalizeRole(normalizeString(payload.role));
        if (!role || !allowedRoles.includes(role) || isPlatformRole(role)) {
            errors.push({
                field: 'role',
                message: `Le role doit etre une des valeurs suivantes: ${allowedRoles.join(', ')}`
            });
        } else {
            value.role = role;
        }
    }

    if (payload.tenant_id !== undefined || payload.tenantId !== undefined || payload.restaurant_id !== undefined || payload.restaurantId !== undefined) {
        if (normalizeTenantId(payload) !== null && typeof normalizeTenantId(payload) !== 'string') {
            errors.push({ field: 'tenant_id', message: 'tenant_id doit etre une chaine ou null' });
        } else {
            const tenantId = normalizeTenantId(payload);
            value.tenant_id = tenantId;
            value.tenantId = tenantId;
            value.restaurant_id = tenantId;
            value.restaurantId = tenantId;
        }
    }

    if (payload.isActive !== undefined) {
        if (typeof payload.isActive !== 'boolean') {
            errors.push({ field: 'isActive', message: 'isActive doit etre un boolean' });
        } else {
            value.isActive = payload.isActive;
        }
    }

    if (Object.keys(value).length === 0 && errors.length === 0) {
        errors.push({ field: 'body', message: 'Aucun champ valide a mettre a jour' });
    }

    return { value, errors };
};

module.exports = {
    validateProfileUpdate
};
