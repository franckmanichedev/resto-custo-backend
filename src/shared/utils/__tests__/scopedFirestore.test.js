/** 
 * Tests pour les utilitaires de Firestore avec scope SaaS et fallback legacy
 * Ces tests vérifient que les fonctions de scopedFirestore ajoutent correctement les champs de scope, 
 * filtrent les données selon le scope, et bloquent l'accès aux documents hors scope. Ils couvrent à la fois 
 * les scénarios avec scope SaaS natif et avec fallback legacy pour assurer une compatibilité maximale.
 * **/
const {
    assertBranchOwnership,
    buildRealtimeScopedQuery,
    filterByBusinessScope,
    withBusinessScope
} = require('../scopedFirestore');

describe('scopedFirestore helpers', () => {
    test('ajoute organizationId et branchId sans retirer les champs legacy', () => {
        const payload = withBusinessScope(
            { id: 'item_1', name: 'Poulet' },
            'tenant-safire-faef2b44',
            {
                enabled: true,
                organizationId: 'org_safire',
                branchId: 'branch_safire_main'
            }
        );

        expect(payload).toMatchObject({
            id: 'item_1',
            tenantId: 'tenant-safire-faef2b44',
            restaurantId: 'tenant-safire-faef2b44',
            organizationId: 'org_safire',
            branchId: 'branch_safire_main'
        });
    });

    test('filtre par branche SaaS en priorite', () => {
        const items = [
            { id: 'a', organizationId: 'org_safire', branchId: 'branch_safire_main', restaurantId: 'tenant-safire-faef2b44' },
            { id: 'b', organizationId: 'org_other', branchId: 'branch_other', restaurantId: 'tenant-safire-faef2b44' }
        ];

        const result = filterByBusinessScope(items, 'tenant-safire-faef2b44', {
            enabled: true,
            organizationId: 'org_safire',
            branchId: 'branch_safire_main'
        });

        expect(result.map((item) => item.id)).toEqual(['a']);
    });

    test('bloque un document hors branche', () => {
        expect(() => assertBranchOwnership(
            { id: 'x', organizationId: 'org_other', branchId: 'branch_other' },
            { enabled: true, organizationId: 'org_safire', branchId: 'branch_safire_main' }
        )).toThrow('Acces refuse');
    });

    test('fallback legacy quand aucun document SaaS natif ne correspond', () => {
        const items = [
            { id: 'legacy', restaurantId: 'tenant-safire-faef2b44' },
            { id: 'other', restaurantId: 'tenant-other' }
        ];

        const result = filterByBusinessScope(items, 'tenant-safire-faef2b44', {
            enabled: true,
            organizationId: 'org_safire',
            branchId: 'branch_safire_main'
        });

        expect(result.map((item) => item.id)).toEqual(['legacy']);
    });

    test('buildRealtimeScopedQuery applique organizationId et branchId avant les filtres metier', () => {
        const calls = [];
        const collection = {
            where(field, op, value) {
                calls.push([field, op, value]);
                return this;
            },
            orderBy(field, direction) {
                calls.push(['orderBy', field, direction]);
                return this;
            }
        };

        buildRealtimeScopedQuery({
            collection,
            scope: {
                enabled: true,
                organizationId: 'org_safire',
                branchId: 'branch_safire_main'
            },
            filters: [['status', '==', 'pending']],
            orderBy: [['createdAt', 'desc']]
        });

        expect(calls).toEqual([
            ['organizationId', '==', 'org_safire'],
            ['branchId', '==', 'branch_safire_main'],
            ['status', '==', 'pending'],
            ['orderBy', 'createdAt', 'desc']
        ]);
    });
});
