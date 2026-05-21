# Firestore Indexes - Phase 6 RBAC and Auth

Ces index accompagnent la migration RBAC multi-organization.

## users

Memberships natifs:

- `organizationMemberships.organizationId ASC`, `organizationMemberships.isActive ASC`
- `organizationMemberships.organizationId ASC`, `organizationMemberships.role ASC`, `organizationMemberships.isActive ASC`
- `branchMemberships.organizationId ASC`, `branchMemberships.branchId ASC`, `branchMemberships.isActive ASC`
- `branchMemberships.branchId ASC`, `branchMemberships.role ASC`, `branchMemberships.isActive ASC`

Contexte actif:

- `activeOrganizationId ASC`
- `activeBranchId ASC`
- `activeOrganizationId ASC`, `activeBranchId ASC`
- `activeOrganizationId ASC`, `role ASC`
- `activeBranchId ASC`, `role ASC`

Compatibilite legacy:

- `tenantId ASC`
- `restaurantId ASC`
- `organizationId ASC`
- `branchId ASC`
- `organizationIds ARRAY_CONTAINS`
- `branchIds ARRAY_CONTAINS`

## impersonation_logs

- `actorId ASC`, `startedAt DESC`
- `actorId ASC`, `isActive ASC`, `startedAt DESC`
- `targetOrganizationId ASC`, `startedAt DESC`
- `targetOrganizationId ASC`, `targetBranchId ASC`, `startedAt DESC`
- `targetOrganizationId ASC`, `targetBranchId ASC`, `isActive ASC`, `startedAt DESC`
- `isActive ASC`, `startedAt DESC`
- `endedAt DESC`

## Notes Firestore

Firestore ne permet pas toujours les queries complexes directement sur des tableaux d'objets. Si les besoins admin exigent des recherches intensives par membership, prevoir une denormalisation future:

- `user_organization_memberships`
- `user_branch_memberships`

La Phase 6 garde les champs embedded pour rester incremental et compatible frontend.
