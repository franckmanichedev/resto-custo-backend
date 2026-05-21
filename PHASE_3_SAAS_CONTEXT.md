# Phase 3 - SaaS Context Resolution Layer

Cette phase ajoute une couche centrale pour resoudre progressivement le contexte SaaS sans casser l'ancien modele `tenantId` / `restaurantId`.

## Feature flag

Le middleware est actif par defaut si Firestore est configure.

Pour le desactiver temporairement :

```bash
ENABLE_SAAS_SCOPE=false
```

TTL du cache memoire :

```bash
SAAS_SCOPE_CACHE_TTL_MS=300000
```

## Scope resolu

Chaque requete peut recevoir :

```js
req.saas = {
  organizationId,
  branchId,
  organization,
  branch,
  source,
  legacy,
  enabled
}
```

Sources possibles :

- `native_saas` : `organizationId` + `branchId` fournis directement.
- `legacy_tenant` : resolution via `tenant_migrations`.
- `qr_session` : requete avec signal QR/session.
- `fallback` : aucun scope resolu ou feature flag desactive.

## Priorite

1. `organizationId` + `branchId`.
2. `tenantId` / `tenant_id` / `restaurantId` / `restaurant_id`.
3. Mapping Firestore `tenant_migrations`.
4. Fallback permissif pour compatibilite.

## Protection

Si une branche ne correspond pas a son organisation :

```txt
branch.organizationId !== organizationId
```

la requete est bloquee avec une erreur `403`.

## Acces branche

Le middleware `requireBranchAccess()` verifie :

- roles plateforme : acces global.
- `organization_owner` ou ancien `admin` : acces organisation.
- `branch_manager`, `waiter`, `kitchen`, `menu_manager`, `kitchen_staff` : acces branche.

Les champs utilisateur supportes :

```js
organizationId
organizationIds
organization_id
organization_ids
branchId
branchIds
branch_id
branch_ids
```

## Compatibilite

Aucune route metier existante n'a ete reecrite. Les anciens champs restent utilises par les controllers actuels. Cette couche prepare seulement la transition progressive vers `organizationId` + `branchId`.
