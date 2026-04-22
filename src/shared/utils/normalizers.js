const { MENU_ITEM_KINDS } = require('../constants/business');

const normalizeName = (value = '') =>
    String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();

const normalizeKind = (value = '') => {
    const normalized = String(value || '').trim().toLowerCase();
    return MENU_ITEM_KINDS.includes(normalized) ? normalized : 'plat';
};

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : value);

module.exports = {
    normalizeName,
    normalizeKind,
    isNonEmptyString,
    normalizeString
};
