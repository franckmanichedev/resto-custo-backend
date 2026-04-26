/**
 * Définition des rôles d'utilisateur pour la SaaS
 *
 * Architecture cible:
 * - platform: équipe interne de la SaaS
 * - tenant: restaurant client et ses employés
 * - customer: client final du restaurant
 *
 * Les rôles restaurant existants sont conservés pour compatibilité.
 */

const ROLES = {
    // Plateforme SaaS
    PLATFORM_OWNER: 'platform_owner',
    PLATFORM_ADMIN: 'platform_admin',
    PLATFORM_SUPPORT: 'platform_support',

    // Tenant / Restaurant - rôles historiques conservés
    ADMIN: 'admin',
    MENU_MANAGER: 'menu_manager',
    KITCHEN_STAFF: 'kitchen_staff',
    CUSTOMER: 'customer'
};

const ROLE_SCOPES = {
    [ROLES.PLATFORM_OWNER]: 'platform',
    [ROLES.PLATFORM_ADMIN]: 'platform',
    [ROLES.PLATFORM_SUPPORT]: 'platform',
    [ROLES.ADMIN]: 'tenant',
    [ROLES.MENU_MANAGER]: 'tenant',
    [ROLES.KITCHEN_STAFF]: 'tenant',
    [ROLES.CUSTOMER]: 'customer'
};

const ROLE_ALIASES = {
    platform_owner: ROLES.PLATFORM_OWNER,
    platform_admin: ROLES.PLATFORM_ADMIN,
    platform_support: ROLES.PLATFORM_SUPPORT,
    tenant_admin: ROLES.ADMIN,
    tenant_manager: ROLES.MENU_MANAGER,
    tenant_staff: ROLES.KITCHEN_STAFF,
    tenant_customer: ROLES.CUSTOMER,
    restaurant_admin: ROLES.ADMIN,
    restaurant_manager: ROLES.MENU_MANAGER,
    restaurant_staff: ROLES.KITCHEN_STAFF,
    restaurant_customer: ROLES.CUSTOMER
};

/**
 * Permissions par rôle
 * Chaque rôle a des permissions spécifiques
 */
const PERMISSIONS = {
    // PLATFORM_OWNER: accès complet à la plateforme SaaS et à tous les tenants
    [ROLES.PLATFORM_OWNER]: [
        'platform:tenants:create',
        'platform:tenants:read',
        'platform:tenants:update',
        'platform:tenants:delete',
        'platform:tenants:activate',
        'platform:tenants:suspend',
        'platform:tenants:archive',
        'platform:users:read',
        'platform:users:update',
        'platform:subscriptions:read',
        'platform:subscriptions:update',
        'platform:analytics:read',
        'platform:billing:read',
        'platform:billing:update',
        'platform:logs:read',
        'platform:support:impersonate',

        'plats:create',
        'plats:read',
        'plats:update',
        'plats:delete',
        'plats:toggle_availability',
        'compositions:create',
        'compositions:read',
        'compositions:update',
        'compositions:delete',
        'categories:create',
        'categories:read',
        'categories:update',
        'categories:delete',
        'type_categories:create',
        'type_categories:read',
        'type_categories:update',
        'type_categories:delete',
        'tables:create',
        'tables:read',
        'tables:update',
        'tables:delete',
        'tables:generate_qrcode',
        'orders:create_own',
        'orders:read',
        'orders:read_own',
        'orders:update_status',
        'orders:cancel',
        'orders:cancel_own',
        'orders:analytics',
        'users:read',
        'users:update',
        'users:create_employee',
        'users:delete_employee',
        'users:manage_roles',
        'users:read_profile',
        'users:update_profile',
        'restaurant:read',
        'restaurant:update',
        'restaurant:view_analytics',
        'restaurant:view_revenue',
        'cart:create',
        'cart:read',
        'cart:update',
        'cart:delete'
    ],

    // PLATFORM_ADMIN: supervision et gestion des tenants
    [ROLES.PLATFORM_ADMIN]: [
        'platform:tenants:create',
        'platform:tenants:read',
        'platform:tenants:update',
        'platform:tenants:activate',
        'platform:tenants:suspend',
        'platform:users:read',
        'platform:users:update',
        'platform:subscriptions:read',
        'platform:analytics:read',
        'platform:billing:read',
        'platform:logs:read',
        'platform:support:impersonate'
    ],

    // PLATFORM_SUPPORT: support interne, lecture + assistance limitée
    [ROLES.PLATFORM_SUPPORT]: [
        'platform:tenants:read',
        'platform:users:read',
        'platform:subscriptions:read',
        'platform:analytics:read',
        'platform:logs:read',
        'platform:support:impersonate'
    ],

    // ADMIN: accès complet à toutes les fonctionnalités du restaurant tenant
    [ROLES.ADMIN]: [
        'plats:create',
        'plats:read',
        'plats:update',
        'plats:delete',
        'plats:toggle_availability',
        'compositions:create',
        'compositions:read',
        'compositions:update',
        'compositions:delete',
        'categories:create',
        'categories:read',
        'categories:update',
        'categories:delete',
        'type_categories:create',
        'type_categories:read',
        'type_categories:update',
        'type_categories:delete',
        'tables:create',
        'tables:read',
        'tables:update',
        'tables:delete',
        'tables:generate_qrcode',
        'orders:read',
        'orders:update_status',
        'orders:cancel',
        'orders:analytics',
        'users:read',
        'users:update',
        'users:create_employee',
        'users:delete_employee',
        'users:manage_roles',
        'restaurant:read',
        'restaurant:update',
        'restaurant:view_analytics',
        'restaurant:view_revenue'
    ],

    // MENU_MANAGER: responsable de la gestion du menu et des catégories
    [ROLES.MENU_MANAGER]: [
        'plats:create',
        'plats:read',
        'plats:update',
        'plats:delete',
        'plats:toggle_availability',
        'compositions:create',
        'compositions:read',
        'compositions:update',
        'compositions:delete',
        'categories:create',
        'categories:read',
        'categories:update',
        'categories:delete',
        'type_categories:create',
        'type_categories:read',
        'type_categories:update',
        'type_categories:delete',
        'tables:read',
        'orders:read'
    ],

    // KITCHEN_STAFF: responsable de la préparation des commandes
    [ROLES.KITCHEN_STAFF]: [
        'plats:read',
        'compositions:read',
        'categories:read',
        'type_categories:read',
        'orders:read',
        'orders:update_status',
        'users:read_profile'
    ],

    // CUSTOMER: client final du restaurant
    [ROLES.CUSTOMER]: [
        'plats:read',
        'compositions:read',
        'categories:read',
        'type_categories:read',
        'cart:create',
        'cart:read',
        'cart:update',
        'cart:delete',
        'orders:create_own',
        'orders:read_own',
        'orders:cancel_own',
        'users:read_profile',
        'users:update_profile'
    ]
};

/**
 * Mappe les actions/endpoints aux permissions requises
 * Utilisée pour vérifier si un utilisateur a les droits d'accès
 */
const ENDPOINT_PERMISSIONS = {
    // Plateforme SaaS
    'GET /api/platform/tenants': 'platform:tenants:read',
    'POST /api/platform/tenants': 'platform:tenants:create',
    'GET /api/platform/tenants/:id': 'platform:tenants:read',
    'PUT /api/platform/tenants/:id': 'platform:tenants:update',
    'DELETE /api/platform/tenants/:id': 'platform:tenants:delete',
    'PATCH /api/platform/tenants/:id/activate': 'platform:tenants:activate',
    'PATCH /api/platform/tenants/:id/suspend': 'platform:tenants:suspend',
    'GET /api/platform/users': 'platform:users:read',
    'PUT /api/platform/users/:id': 'platform:users:update',
    'GET /api/platform/subscriptions': 'platform:subscriptions:read',
    'GET /api/platform/analytics': 'platform:analytics:read',
    'GET /api/platform/billing': 'platform:billing:read',
    'GET /api/platform/logs': 'platform:logs:read',

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
 * Normalise un rôle en appliquant les alias de compatibilité.
 * @param {string} role - Rôle brut issu de la base ou du token
 * @returns {string|null}
 */
const normalizeRole = (role) => {
    if (typeof role !== 'string') {
        return null;
    }

    const normalized = role.trim().toLowerCase();
    if (!normalized) {
        return null;
    }

    if (Object.values(ROLES).includes(normalized)) {
        return normalized;
    }

    return ROLE_ALIASES[normalized] || null;
};

/**
 * Récupère le scope métier d'un rôle.
 * @param {string} role - Rôle de l'utilisateur
 * @returns {'platform'|'tenant'|'customer'|null}
 */
const getRoleScope = (role) => {
    const normalizedRole = normalizeRole(role);
    if (!normalizedRole) {
        return null;
    }

    return ROLE_SCOPES[normalizedRole] || null;
};

const isPlatformRole = (role) => getRoleScope(role) === 'platform';
const isTenantRole = (role) => getRoleScope(role) === 'tenant';
const isCustomerRole = (role) => getRoleScope(role) === 'customer';

/**
 * Vérifie si un rôle a une permission spécifique
 * @param {string} role - Le rôle de l'utilisateur
 * @param {string} permission - La permission à vérifier
 * @returns {boolean}
 */
const hasPermission = (role, permission) => {
    const normalizedRole = normalizeRole(role);
    const rolePermissions = PERMISSIONS[normalizedRole] || [];
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
    ROLE_SCOPES,
    ROLE_ALIASES,
    PERMISSIONS,
    ENDPOINT_PERMISSIONS,
    normalizeRole,
    getRoleScope,
    isPlatformRole,
    isTenantRole,
    isCustomerRole,
    hasPermission,
    hasAllPermissions,
    hasAnyPermission
};
