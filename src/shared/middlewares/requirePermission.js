const AppError = require('../errors/AppError');
const { hasPermission, hasAnyPermission } = require('../constants/roles');

/**
 * Middleware pour vérifier les permissions d'un utilisateur
 * @param {string|string[]} requiredPermissions - Permission(s) requise(s)
 * @param {string} mode - 'all' pour avoir toutes les permissions, 'any' pour en avoir au moins une
 */
const requirePermission = (requiredPermissions, mode = 'any') => {
    return (req, res, next) => {
        try {
            if (!req.user || !req.user.uid) {
                throw new AppError('Utilisateur non authentifié', 401);
            }

            if (!req.user.role) {
                throw new AppError('Rôle utilisateur non défini', 403);
            }

            const permissions = Array.isArray(requiredPermissions) 
                ? requiredPermissions 
                : [requiredPermissions];

            let hasAccess = false;

            if (mode === 'all') {
                // L'utilisateur doit avoir toutes les permissions
                hasAccess = permissions.every(permission => 
                    hasPermission(req.user.role, permission)
                );
            } else {
                // L'utilisateur doit avoir au moins une permission
                hasAccess = permissions.some(permission => 
                    hasPermission(req.user.role, permission)
                );
            }

            if (!hasAccess) {
                throw new AppError(
                    'Accès refusé: permissions insuffisantes',
                    403,
                    {
                        requiredPermissions: permissions,
                        userRole: req.user.role,
                        mode
                    }
                );
            }

            next();
        } catch (error) {
            next(error);
        }
    };
};

module.exports = requirePermission;
