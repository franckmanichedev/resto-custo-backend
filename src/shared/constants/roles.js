/**
 * Définition des rôles d'utilisateur pour la SaaS
 * Chaque restaurant peut assigner ces rôles à ses employés
 */

const ROLES = {
    // Administrateur / Propriétaire du restaurant
    ADMIN: 'admin',
    
    // Gestionnaire de Menu - Responsable de la gestion des articles, menus, prix, etc
    MENU_MANAGER: 'menu_manager',
    
    // Personnel de Cuisine - Responsable de la préparation et suivi des commandes
    KITCHEN_STAFF: 'kitchen_staff',
    
    // Client / Customer - Utilisateur final du restaurant
    CUSTOMER: 'customer'
};

/**
 * Permissions par rôle
 * Chaque rôle a des permissions spécifiques
 */
const PERMISSIONS = {
    // ADMIN: Accès complet à toutes les fonctionnalités
    [ROLES.ADMIN]: [
        // Gestion des articles (plats)
        'plats:create',
        'plats:read',
        'plats:update',
        'plats:delete',
        'plats:toggle_availability',
        
        // Gestion des compositions
        'compositions:create',
        'compositions:read',
        'compositions:update',
        'compositions:delete',
        
        // Gestion des catégories
        'categories:create',
        'categories:read',
        'categories:update',
        'categories:delete',
        
        // Gestion des types de catégories
        'type_categories:create',
        'type_categories:read',
        'type_categories:update',
        'type_categories:delete',
        
        // Gestion des tables
        'tables:create',
        'tables:read',
        'tables:update',
        'tables:delete',
        'tables:generate_qrcode',
        
        // Gestion des commandes
        'orders:read',
        'orders:update_status',
        'orders:cancel',
        'orders:analytics',
        
        // Gestion des utilisateurs/employés
        'users:read',
        'users:update',
        'users:create_employee',
        'users:delete_employee',
        'users:manage_roles',
        
        // Gestion du compte restaurant
        'restaurant:read',
        'restaurant:update',
        'restaurant:view_analytics',
        'restaurant:view_revenue'
    ],
    
    // MENU_MANAGER: Responsable de la gestion des articles et configurations
    [ROLES.MENU_MANAGER]: [
        // Gestion des articles (plats)
        'plats:create',
        'plats:read',
        'plats:update',
        'plats:delete',
        'plats:toggle_availability',
        
        // Gestion des compositions
        'compositions:create',
        'compositions:read',
        'compositions:update',
        'compositions:delete',
        
        // Gestion des catégories
        'categories:create',
        'categories:read',
        'categories:update',
        'categories:delete',
        
        // Gestion des types de catégories
        'type_categories:create',
        'type_categories:read',
        'type_categories:update',
        'type_categories:delete',
        
        // Gestion basique des tables (lecture seulement)
        'tables:read',
        
        // Lecture des commandes (pour voir quels plats sont commandés)
        'orders:read'
    ],
    
    // KITCHEN_STAFF: Responsable de la préparation des commandes
    [ROLES.KITCHEN_STAFF]: [
        // Lecture des articles (pour préparation)
        'plats:read',
        
        // Lecture des compositions
        'compositions:read',
        
        // Lecture des catégories
        'categories:read',
        'type_categories:read',
        
        // Gestion des commandes (lecture et mise à jour du statut)
        'orders:read',
        'orders:update_status',
        
        // Lecture du profil utilisateur
        'users:read_profile'
    ],
    
    // CUSTOMER: Client final du restaurant
    [ROLES.CUSTOMER]: [
        // Lecture des articles publics
        'plats:read',
        
        // Lecture des compositions publiques
        'compositions:read',
        
        // Lecture des catégories publiques
        'categories:read',
        'type_categories:read',
        
        // Gestion de son propre panier et commandes
        'cart:create',
        'cart:read',
        'cart:update',
        'cart:delete',
        'orders:create_own',
        'orders:read_own',
        'orders:cancel_own',
        
        // Profil utilisateur
        'users:read_profile',
        'users:update_profile'
    ]
};

/**
 * Mappe les actions/endpoints aux permissions requises
 * Utilisée pour vérifier si un utilisateur a les droits d'accès
 */
const ENDPOINT_PERMISSIONS = {
    // Plats
    'POST /api/plats': 'plats:create',
    'GET /api/plats': 'plats:read',
    'GET /api/plats/:id': 'plats:read',
    'PUT /api/plats/:id': 'plats:update',
    'DELETE /api/plats/:id': 'plats:delete',
    'PATCH /api/plats/:id/toggle': 'plats:toggle_availability',
    
    // Compositions
    'POST /api/compositions': 'compositions:create',
    'GET /api/compositions': 'compositions:read',
    'GET /api/compositions/:id': 'compositions:read',
    'PUT /api/compositions/:id': 'compositions:update',
    'DELETE /api/compositions/:id': 'compositions:delete',
    
    // Catégories
    'POST /api/categories': 'categories:create',
    'GET /api/categories': 'categories:read',
    'GET /api/categories/:id': 'categories:read',
    'PUT /api/categories/:id': 'categories:update',
    'DELETE /api/categories/:id': 'categories:delete',
    
    // Type Catégories
    'POST /api/categories/types/all': 'type_categories:create',
    'GET /api/categories/types/all': 'type_categories:read',
    'PUT /api/categories/types/all/:id': 'type_categories:update',
    'DELETE /api/categories/types/all/:id': 'type_categories:delete',
    
    // Tables
    'POST /api/tables': 'tables:create',
    'GET /api/tables': 'tables:read',
    'GET /api/tables/:id': 'tables:read',
    'PUT /api/tables/:id': 'tables:update',
    'DELETE /api/tables/:id': 'tables:delete',
    
    // Commandes
    'GET /api/orders': 'orders:read',
    'GET /api/orders/:id': 'orders:read',
    'PUT /api/orders/:id/status': 'orders:update_status'
};

/**
 * Vérifie si un rôle a une permission spécifique
 * @param {string} role - Le rôle de l'utilisateur
 * @param {string} permission - La permission à vérifier
 * @returns {boolean}
 */
const hasPermission = (role, permission) => {
    const rolePermissions = PERMISSIONS[role] || [];
    return rolePermissions.includes(permission);
};

/**
 * Vérifie si un rôle a toutes les permissions spécifiées
 * @param {string} role - Le rôle de l'utilisateur
 * @param {string[]} permissions - Les permissions à vérifier
 * @returns {boolean}
 */
const hasAllPermissions = (role, permissions) => {
    return permissions.every(permission => hasPermission(role, permission));
};

/**
 * Vérifie si un rôle a au moins une des permissions spécifiées
 * @param {string} role - Le rôle de l'utilisateur
 * @param {string[]} permissions - Les permissions à vérifier
 * @returns {boolean}
 */
const hasAnyPermission = (role, permissions) => {
    return permissions.some(permission => hasPermission(role, permission));
};

module.exports = {
    ROLES,
    PERMISSIONS,
    ENDPOINT_PERMISSIONS,
    hasPermission,
    hasAllPermissions,
    hasAnyPermission
};
