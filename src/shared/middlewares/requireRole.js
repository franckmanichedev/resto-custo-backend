const UserRepository = require('../../modules/user/user.repository');
const AppError = require('../errors/AppError');

const userRepository = new UserRepository();

/**
 * Middleware pour vérifier les rôles d'un utilisateur
 * @param {string|string[]} allowed - Rôle(s) autorisé(s)
 * @returns {Function} Middleware Express
 * 
 * Exemple d'utilisation:
 * - requireRole('admin') - Un seul rôle
 * - requireRole(['admin', 'menu_manager']) - Plusieurs rôles
 */
module.exports = function requireRole(allowed) {
    const allowedArray = Array.isArray(allowed) ? allowed : [allowed];

    return async (req, res, next) => {
        try {
            if (!req.user || !req.user.uid) {
                throw new AppError('Utilisateur non authentifié', 401);
            }

            const user = await userRepository.findById(req.user.uid);
            if (!user) {
                throw new AppError('Profil utilisateur introuvable', 404);
            }

            if (!user.role || !allowedArray.includes(user.role)) {
                throw new AppError(
                    'Accès refusé: rôle insuffisant',
                    403,
                    {
                        allowedRoles: allowedArray,
                        userRole: user.role
                    }
                );
            }

            // Met à jour le rôle dans req.user pour les middlewares suivants
            req.user.role = user.role;
            next();
        } catch (error) {
            next(error);
        }
    };
};
