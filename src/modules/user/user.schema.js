const allowedRoles = ['customer', 'admin'];

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : value);

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
        const role = normalizeString(payload.role)?.toLowerCase();
        if (!allowedRoles.includes(role)) {
            errors.push({ field: 'role', message: `Le role doit etre une des valeurs suivantes: ${allowedRoles.join(', ')}` });
        } else {
            value.role = role;
        }
    }

    if (payload.restaurant_id !== undefined) {
        if (payload.restaurant_id !== null && typeof payload.restaurant_id !== 'string') {
            errors.push({ field: 'restaurant_id', message: 'restaurant_id doit etre une chaine ou null' });
        } else {
            value.restaurant_id = normalizeString(payload.restaurant_id) || null;
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
