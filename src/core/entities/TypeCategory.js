class TypeCategoryEntity {
    constructor(payload = {}) {
        Object.assign(this, payload);
    }

    static create(payload) {
        return { ...(payload || {}) };
    }
}

module.exports = TypeCategoryEntity;
