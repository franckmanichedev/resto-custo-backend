# Phase 4 - Scoped Business Repositories Migration

Cette phase migre progressivement les modules metier non temps reel vers le scope SaaS `organizationId + branchId`, sans supprimer les champs legacy.

Modules touches :

- `menu_items`
- `categories`
- `type_categories`
- `compositions`
- `tables`

Modules volontairement non touches :

- `commandes`
- `paniers`
- `table_sessions`
- realtime
- futurs paiements

## Architecture

Le helper central est :

```js
buildScopedFirestoreQuery({ collection, req, scope, filters, orderBy, limit })
```

Il applique en priorite :

```js
where('organizationId', '==', req.saas.organizationId)
where('branchId', '==', req.saas.branchId)
```

Si le scope SaaS n'est pas disponible, il retombe sur les champs legacy via `restaurantId` / `tenantId`.

## Creation

Les creations utilisent `withBusinessScope()`.

Le payload conserve :

```js
tenantId
tenant_id
restaurantId
restaurant_id
```

et ajoute si disponible :

```js
organizationId
branchId
```

## Lecture

Priorite :

1. `organizationId + branchId`
2. fallback `tenantId`
3. fallback `restaurantId`

Les repositories exposent des methodes `listScoped()` sans supprimer `listAll()`.

## Update / Delete

Les services appellent `assertBranchOwnership()` avant mutation. Si un document possede un scope SaaS different de `req.saas`, la requete est bloquee en `403`.

## Feature flags

```env
ENABLE_SCOPED_QUERIES=true
ENABLE_LEGACY_FALLBACK=true
```

`ENABLE_SCOPED_QUERIES=false` permet de revenir au comportement legacy.

`ENABLE_LEGACY_FALLBACK=false` permettra plus tard de rendre le scope SaaS strict.

## Compatibilite frontend

Aucune route et aucun payload frontend ne changent. Les controllers passent seulement `req.saas` aux services.

## Firestore indexes

Voir `firestore.indexes.recommended.md`.

Pendant la transition, si Firestore demande un index composite manquant, les repositories retombent sur les lectures historiques puis filtrent cote service. C'est moins optimal, mais evite une regression en production.

## Risques

- Les queries scoped performantes dependent des index recommandes.
- Les documents sans `organizationId/branchId` restent supportes uniquement si `ENABLE_LEGACY_FALLBACK=true`.
- Les modules temps reel ne sont pas encore scopes en Phase 4.
