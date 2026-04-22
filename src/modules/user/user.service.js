const AppError = require('../../shared/errors/AppError');
const UserEntity = require('../../core/entities/User');

class UserService {
    constructor({ userRepository }) {
        this.userRepository = userRepository;
    }

    async getById(id) {
        const user = await this.userRepository.findById(id);
        if (!user) {
            throw new AppError('Utilisateur non trouve', 404);
        }

        return UserEntity.create(user);
    }

    async getAuthenticatedUser(authenticatedUser) {
        const userId = authenticatedUser?.uid || authenticatedUser?.id;
        if (!userId) {
            throw new AppError('Utilisateur authentifie introuvable', 400);
        }

        return this.getById(userId);
    }

    async updateProfile(id, payload) {
        await this.getById(id);
        const updatedUser = await this.userRepository.update(id, {
            ...payload,
            updatedAt: new Date().toISOString()
        });

        return UserEntity.create(updatedUser);
    }
}

module.exports = UserService;
