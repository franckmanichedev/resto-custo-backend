const AppError = require('../../shared/errors/AppError');
const UserEntity = require('../../core/entities/User');

const TENANT_KEYS = ['tenant_id', 'tenantId', 'restaurant_id', 'restaurantId'];

const isPlatformActor = (actor = {}) =>
    typeof actor.role === 'string' && actor.role.startsWith('platform_');

const getEntityTenantId = (entity = {}) => (
    entity.tenant_id
    || entity.tenantId
    || entity.restaurant_id
    || entity.restaurantId
    || null
);

const hasTenantMutation = (payload = {}) => TENANT_KEYS.some((key) => Object.prototype.hasOwnProperty.call(payload, key));

const stripTenantFields = (payload = {}) => {
    const sanitized = { ...payload };

    TENANT_KEYS.forEach((key) => {
        delete sanitized[key];
    });

    return sanitized;
};

class UserService {
    constructor({ userRepository }) {
        this.userRepository = userRepository;
    }

    assertTenantScope(user, options = {}) {
        const actor = options.actor || null;
        const requestedTenantId = options.tenantId || null;
        const userTenantId = getEntityTenantId(user);

        if (isPlatformActor(actor)) {
            return;
        }

        if (requestedTenantId && userTenantId && requestedTenantId !== userTenantId) {
            throw new AppError('Acces refuse: tenant hors de portee', 403, {
                tenantId: requestedTenantId,
                userTenantId
            });
        }

        if (actor) {
            const actorTenantId = getEntityTenantId(actor);
            if (actorTenantId && userTenantId && actorTenantId !== userTenantId) {
                throw new AppError('Acces refuse: tenant hors de portee', 403, {
                    tenantId: actorTenantId,
                    userTenantId
                });
            }
        }
    }

    async getById(id, options = {}) {
        const user = await this.userRepository.findById(id);
        if (!user) {
            throw new AppError('Utilisateur non trouve', 404);
        }

        this.assertTenantScope(user, options);

        return UserEntity.create(user);
    }

    async getAuthenticatedUser(authenticatedUser, options = {}) {
        const userId = authenticatedUser?.uid || authenticatedUser?.id;
        if (!userId) {
            throw new AppError('Utilisateur authentifie introuvable', 400);
        }

        return this.getById(userId, {
            actor: authenticatedUser,
            tenantId: options.tenantId || getEntityTenantId(authenticatedUser)
        });
    }

    async updateProfile(id, payload, options = {}) {
        const existingUser = await this.userRepository.findById(id);
        if (!existingUser) {
            throw new AppError('Utilisateur non trouve', 404);
        }

        this.assertTenantScope(existingUser, options);

        const actor = options.actor || null;
        const updates = isPlatformActor(actor) ? { ...payload } : stripTenantFields(payload);

        if (hasTenantMutation(payload) && !isPlatformActor(actor)) {
            throw new AppError('Modification du tenant refusee', 403);
        }

        const updatedUser = await this.userRepository.update(id, {
            ...updates,
            updatedAt: new Date().toISOString()
        });

        return UserEntity.create(updatedUser);
    }
}

module.exports = UserService;
