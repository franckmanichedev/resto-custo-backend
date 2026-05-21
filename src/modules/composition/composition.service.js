const AppError = require('../../shared/errors/AppError');
const CompositionEntity = require('../../core/entities/Composition');
const { normalizeName } = require('../../shared/utils/normalizers');
const {
    assertBranchOwnership,
    filterByBusinessScope,
    matchesBusinessScope,
    withBusinessScope
} = require('../../shared/utils/scopedFirestore');

class CompositionService {
    constructor({ compositionRepository }) {
        this.compositionRepository = compositionRepository;
    }

    async create(payload, restaurantId, scope = {}) {
        const normalizedName = normalizeName(payload.name);
        const duplicates = filterByBusinessScope(
            await this.compositionRepository.findByNormalizedName(normalizedName),
            restaurantId,
            scope
        );

        if (duplicates.length > 0) {
            const duplicate = duplicates[0];
            throw new AppError('Cette composition existe deja', 409, { data: duplicate });
        }

        const now = new Date().toISOString();
        const ref = this.compositionRepository.createRef();
        const composition = CompositionEntity.create(withBusinessScope({
            id: ref.id,
            name: payload.name,
            normalized_name: normalizedName,
            is_allergen: payload.is_allergen || false,
            description: payload.description || '',
            aliases: payload.aliases || [],
            is_active: payload.is_active ?? true,
            createdAt: now,
            updatedAt: now
        }, restaurantId, scope));

        await this.compositionRepository.create(ref.id, composition);
        return composition;
    }

    async list(query, restaurantId, scope = {}) {
        const search = typeof query.search === 'string' ? query.search.trim() : '';
        const allergenOnly = query.is_allergen === 'true';
        let compositions = filterByBusinessScope(
            await this.compositionRepository.listScoped(scope, restaurantId),
            restaurantId,
            scope
        );

        if (allergenOnly) {
            compositions = compositions.filter((item) => item.is_allergen === true);
        }

        if (search) {
            const normalizedSearch = normalizeName(search);
            compositions = compositions.filter((item) => {
                const haystacks = [item.name, item.normalized_name, ...(Array.isArray(item.aliases) ? item.aliases : [])]
                    .filter(Boolean)
                    .map((value) => normalizeName(value));

                return haystacks.some((value) => value.includes(normalizedSearch));
            });
        }

        return compositions.map((item) => CompositionEntity.create(item));
    }

    async getById(id, restaurantId, scope = {}) {
        const composition = await this.compositionRepository.findById(id);
        if (!composition || !matchesBusinessScope(composition, restaurantId, scope)) {
            throw new AppError('Composition introuvable', 404);
        }

        assertBranchOwnership(composition, scope, { collection: 'compositions' });
        return CompositionEntity.create(composition);
    }

    async update(id, payload, restaurantId, scope = {}) {
        await this.getById(id, restaurantId, scope);

        const updates = {
            ...payload,
            updatedAt: new Date().toISOString()
        };

        if (updates.name) {
            const normalizedName = normalizeName(updates.name);
            const duplicates = filterByBusinessScope(
                await this.compositionRepository.findByNormalizedName(normalizedName),
                restaurantId,
                scope
            ).filter((item) => item.id !== id);

            if (duplicates.length > 0) {
                throw new AppError('Une autre composition utilise deja ce nom', 409);
            }

            updates.normalized_name = normalizedName;
        }

        return CompositionEntity.create(await this.compositionRepository.update(id, updates));
    }

    async delete(id, restaurantId, scope = {}) {
        await this.getById(id, restaurantId, scope);

        if (await this.compositionRepository.hasLinkedMenuItems(id)) {
            throw new AppError(
                'Impossible de supprimer cette composition car elle est encore liee a un plat',
                409
            );
        }

        await this.compositionRepository.delete(id);
    }
}

module.exports = CompositionService;
