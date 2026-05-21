# Phase 5 - Transactional Scoping

Cette phase migre progressivement les modules transactionnels vers `organizationId + branchId`, sans supprimer les champs legacy.

## Modules migres

- `commandes`
- `commande_items`
- `commande_item_compositions`
- `paniers`
- `panier_items`
- `panier_item_compositions`
- `table_sessions`

## Architecture

Les creations passent par `withBusinessScope()` afin de conserver :

```js
tenantId
tenant_id
restaurantId
restaurant_id
```

et d'ajouter :

```js
organizationId
branchId
```

Les lectures utilisent `buildScopedFirestoreQuery()` via des methodes repository `*Scoped()`. Si Firestore demande un index non encore cree ou si aucun document natif SaaS n'est trouve, le code retombe sur le comportement legacy tant que `ENABLE_LEGACY_FALLBACK=true`.

## Relations

Les donnees relationnelles ne dependent plus uniquement de leurs IDs :

- une commande porte `organizationId + branchId`
- ses items portent aussi `organizationId + branchId`
- les compositions d'items portent aussi `organizationId + branchId`
- les paniers, items de panier et compositions de panier portent aussi le scope
- les sessions de table portent aussi le scope

## Securite

Les mutations critiques appellent `assertBranchOwnership()`.

Si un document possede un scope SaaS different de la requete :

```txt
403 Forbidden
```

Les routes metier authentifiees conservent `requireTenantScope()` pour les clients legacy, puis resolvent `req.saas` apres `verifyFirebaseToken` afin de pouvoir utiliser les claims ou headers Organisation/Branch sur les anciens endpoints `/api/*` comme sur `/api/restaurant/*`.

## Public QR / Sessions

Les routes client restent compatibles. Quand `req.saas` est absent, le service derive le scope depuis la table ou la session deja migree avec `createScopeFromEntity()`.

## Realtime

Les emissions socket gardent les rooms legacy :

```txt
restaurant_<tenantId>_kitchen
restaurant_<tenantId>_dashboard
```

et ajoutent les rooms SaaS :

```txt
branch_<organizationId>_<branchId>_kitchen
branch_<organizationId>_<branchId>_dashboard
```

Les futurs listeners Firestore doivent utiliser `buildRealtimeScopedQuery()`.

## Feature flags

```env
ENABLE_SAAS_SCOPE=true
ENABLE_SCOPED_QUERIES=true
ENABLE_LEGACY_FALLBACK=true
```

## Risques

- Les queries transactionnelles peuvent exiger les index listes dans `firestore.indexes.phase5.md`.
- Les modules temps reel frontend devront etre adaptes ensuite pour ecouter les rooms/queries SaaS.
- Le fallback legacy doit rester actif tant que tous les clients n'envoient pas le contexte SaaS nativement.
