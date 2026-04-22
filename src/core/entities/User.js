class UserEntity {
    constructor({
        id,
        email = null,
        name = '',
        role = 'customer',
        phoneNumber = null,
        restaurant_id = null,
        isActive = true,
        createdAt = null,
        updatedAt = null,
        ...rest
    }) {
        this.id = id;
        this.email = email;
        this.name = name;
        this.role = role;
        this.phoneNumber = phoneNumber;
        this.restaurant_id = restaurant_id;
        this.isActive = isActive;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        Object.assign(this, rest);
    }

    static create(payload) {
        return { ...(payload || {}) };
    }
}

module.exports = UserEntity;
