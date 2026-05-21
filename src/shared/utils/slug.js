const { normalizeName } = require('./normalizers');

const createSlug = (value = '') =>
    normalizeName(value)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-');

module.exports = {
    createSlug
};
