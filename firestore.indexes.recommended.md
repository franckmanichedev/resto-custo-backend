# Firestore Indexes Recommended - Phase 4

Ces index accompagnent la migration progressive vers `organizationId + branchId`.

Les repositories gardent un fallback legacy si un index manque, mais ces index doivent etre crees avant de rendre les queries scoped strictes.

## menu_items

- `organizationId ASC`, `branchId ASC`, `createdAt DESC`
- `organizationId ASC`, `branchId ASC`, `is_available ASC`
- `organizationId ASC`, `branchId ASC`, `categorie_id ASC`
- `organizationId ASC`, `branchId ASC`, `type_categorie_id ASC`
- `organizationId ASC`, `branchId ASC`, `kind ASC`

## categories

- `organizationId ASC`, `branchId ASC`, `name ASC`
- `organizationId ASC`, `branchId ASC`, `kind ASC`
- `organizationId ASC`, `branchId ASC`, `normalized_name ASC`, `kind ASC`

## type_categories

- `organizationId ASC`, `branchId ASC`, `name ASC`
- `organizationId ASC`, `branchId ASC`, `categorie_id ASC`
- `organizationId ASC`, `branchId ASC`, `categorie_id ASC`, `normalized_name ASC`

## compositions

- `organizationId ASC`, `branchId ASC`, `name ASC`
- `organizationId ASC`, `branchId ASC`, `normalized_name ASC`
- `organizationId ASC`, `branchId ASC`, `is_allergen ASC`

## tables

- `organizationId ASC`, `branchId ASC`, `createdAt DESC`
- `organizationId ASC`, `branchId ASC`, `number ASC`
- `organizationId ASC`, `branchId ASC`, `qr_code ASC`
- `organizationId ASC`, `branchId ASC`, `is_active ASC`

## Legacy fallback indexes

Tant que `ENABLE_LEGACY_FALLBACK=true`, conserver aussi les index existants autour de :

- `restaurantId`
- `tenantId`
- `restaurant_id`
- `tenant_id`
