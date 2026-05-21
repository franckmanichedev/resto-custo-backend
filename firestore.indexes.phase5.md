# Firestore Indexes - Phase 5 Transactional Scoping

Ces index doivent etre crees pour rendre les queries transactionnelles SaaS performantes.

## commandes

- `organizationId ASC`, `branchId ASC`, `createdAt DESC`
- `organizationId ASC`, `branchId ASC`, `status ASC`, `createdAt DESC`
- `organizationId ASC`, `branchId ASC`, `session_id ASC`, `createdAt DESC`
- `organizationId ASC`, `branchId ASC`, `table_id ASC`, `createdAt DESC`
- `organizationId ASC`, `branchId ASC`, `client_id ASC`, `createdAt DESC`

## commande_items

- `organizationId ASC`, `branchId ASC`, `commande_id ASC`
- `organizationId ASC`, `branchId ASC`, `plat_id ASC`
- `organizationId ASC`, `branchId ASC`, `createdAt DESC`

## commande_item_compositions

- `organizationId ASC`, `branchId ASC`, `commande_item_id ASC`
- `organizationId ASC`, `branchId ASC`, `composition_id ASC`
- `organizationId ASC`, `branchId ASC`, `createdAt DESC`

## paniers

- `organizationId ASC`, `branchId ASC`, `table_session_id ASC`
- `organizationId ASC`, `branchId ASC`, `status ASC`, `updatedAt DESC`
- `organizationId ASC`, `branchId ASC`, `createdAt DESC`

## panier_items

- `organizationId ASC`, `branchId ASC`, `panier_id ASC`
- `organizationId ASC`, `branchId ASC`, `plat_id ASC`
- `organizationId ASC`, `branchId ASC`, `updatedAt DESC`

## panier_item_compositions

- `organizationId ASC`, `branchId ASC`, `panier_item_id ASC`
- `organizationId ASC`, `branchId ASC`, `composition_id ASC`
- `organizationId ASC`, `branchId ASC`, `createdAt DESC`

## table_sessions

- `organizationId ASC`, `branchId ASC`, `table_id ASC`, `created_at DESC`
- `organizationId ASC`, `branchId ASC`, `session_token ASC`
- `organizationId ASC`, `branchId ASC`, `expires_at ASC`

## Realtime ordering

- `organizationId ASC`, `branchId ASC`, `status ASC`, `createdAt DESC`
- `organizationId ASC`, `branchId ASC`, `updatedAt DESC`
- `organizationId ASC`, `branchId ASC`, `created_at DESC`

## Legacy a conserver pendant la migration

- `restaurantId`
- `restaurant_id`
- `tenantId`
- `tenant_id`
