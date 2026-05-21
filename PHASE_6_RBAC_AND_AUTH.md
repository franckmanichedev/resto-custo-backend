# Phase 6 - RBAC avance et authentification multi-organization

Cette phase ajoute une couche RBAC SaaS progressive sans supprimer le modele legacy `tenantId` / `restaurantId`.

## Feature flags

```env
ENABLE_ADVANCED_RBAC=true
ENABLE_IMPERSONATION=true
ENABLE_MULTI_BRANCH_USERS=true
```

Si `ENABLE_ADVANCED_RBAC=false`, le moteur retombe sur les permissions du role legacy `user.role`.

## Hierarchie RBAC

Platform:

- `platform_owner`
- `platform_admin`
- `platform_support`

Organization:

- `organization_owner`
- `organization_manager`

Branch:

- `branch_manager`
- `cashier`
- `waiter`
- `kitchen`

Legacy conserves:

- `admin`
- `menu_manager`
- `kitchen_staff`
- `customer`

## Structure user cible

Les champs suivants sont optionnels pendant la migration:

```js
organizationMemberships: [
  { organizationId, role, joinedAt, isActive }
]

branchMemberships: [
  { organizationId, branchId, role, joinedAt, isActive }
]

activeOrganizationId
activeBranchId
```

Les anciens champs `tenantId`, `restaurantId`, `role`, `organizationId`, `branchId`, `organizationIds` et `branchIds` restent lus pour compatibilite.

## Auth context

Le middleware `resolveUserAccessContext` enrichit:

```js
req.access = {
  platformRole,
  organizations,
  branches,
  activeOrganizationId,
  activeBranchId,
  permissions,
  canManageMenu,
  canManageOrders,
  canManageBranch,
  canManageOrganization,
  canAccessAnalytics,
  canManageBilling,
  canImpersonate
}
```

La logique est centralisee dans `src/shared/utils/accessControl.js`.

## Branch switching

Endpoint prepare:

```txt
POST /api/users/me/active-branch
```

Payload:

```json
{
  "organizationId": "org_x",
  "branchId": "branch_y"
}
```

Le switch est refuse avec `403` si la branche n'est pas dans les `branchMemberships` actifs de l'utilisateur. Le service met a jour `activeOrganizationId`, `activeBranchId` et `accessContextRefreshedAt`, puis renvoie une intention realtime `access_context_refreshed`.

## Impersonation

Endpoint plateforme:

```txt
POST /api/platform/impersonations
PATCH /api/platform/impersonations/:id/end
```

`platform_support`, `platform_admin` et `platform_owner` peuvent ouvrir une session read-only sur une organization ou branch. Chaque session est journalisee dans `impersonation_logs` avec:

- `actorId`
- `targetOrganizationId`
- `targetBranchId`
- `startedAt`
- `endedAt`
- `isActive`
- `mode: read_only`

Les mutations restent interdites pour un contexte impersonne read-only; les controllers pourront consommer ce contexte dans les phases suivantes.

## Strategie migration

1. Continuer a remplir les champs legacy pour tous les flux existants.
2. Ajouter progressivement `organizationMemberships` et `branchMemberships` aux users existants via migration.
3. Activer `ENABLE_ADVANCED_RBAC` avec fallback legacy.
4. Migrer les controllers vers `req.access.permissions` au lieu de checks de roles directs.
5. Activer le switch branche cote frontend quand les utilisateurs multi-branches sont prets.

## Securite

- Toute organization hors membership retourne `403 Forbidden`.
- Toute branche hors membership retourne `403 Forbidden`.
- Les roles platform ne sont pas attribuables via signup.
- Les roles legacy restent valides mais ne donnent pas d'acces cross-organization.
- L'impersonation est feature-flagged, read-only et journalisee.
