const AppError = require('../../shared/errors/AppError');
const CompositionEntity = require('../../core/entities/Composition');
const { normalizeName } = require('../../shared/utils/normalizers');
const { filterByRestaurantScope, matchesRestaurantScope, withRestaurantScope } = require('../../shared/utils/tenant');

class CompositionService {
    constructor({ compositionRepository }) {
        this.compositionRepository = compositionRepository;
    }

    async create(payload, restaurantId) {
        const normalizedName = normalizeName(payload.name);
        const duplicates = filterByRestaurantScope(
            await this.compositionRepository.findByNormalizedName(normalizedName),
            restaurantId
        );

        if (duplicates.length > 0) {
            const duplicate = duplicates[0];
            throw new AppError('Cette composition existe deja', 409, { data: duplicate });
        }

        const now = new Date().toISOString();
        const ref = this.compositionRepository.createRef();
        const composition = CompositionEntity.create(withRestaurantScope({
            id: ref.id,
            name: payload.name,
            normalized_name: normalizedName,
            is_allergen: payload.is_allergen || false,
            description: payload.description || '',
            aliases: payload.aliases || [],
            is_active: payload.is_active ?? true,
            createdAt: now,
            updatedAt: now
        }, restaurantId));

        await this.compositionRepository.create(ref.id, composition);
        return composition;
    }

    async list(query, restaurantId) {
        const search = typeof query.search === 'string' ? query.search.trim() : '';
        const allergenOnly = query.is_allergen === 'true';
        let compositions = filterByRestaurantScope(await this.compositionRepository.listAll(), restaurantId);

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

    async getById(id, restaurantId) {
        const composition = await this.compositionRepository.findById(id);
        if (!composition || !matchesRestaurantScope(composition, restaurantId)) {
            throw new AppError('Composition introuvable', 404);
        }

        return CompositionEntity.create(composition);
    }

    async update(id, payload, restaurantId) {
        await this.getById(id, restaurantId);

        const updates = {
            ...payload,
            updatedAt: new Date().toISOString()
        };

        if (updates.name) {
            const normalizedName = normalizeName(updates.name);
            const duplicates = filterByRestaurantScope(
                await this.compositionRepository.findByNormalizedName(normalizedName),
                restaurantId
            ).filter((item) => item.id !== id);

            if (duplicates.length > 0) {
                throw new AppError('Une autre composition utilise deja ce nom', 409);
            }

            updates.normalized_name = normalizedName;
        }

        return CompositionEntity.create(await this.compositionRepository.update(id, updates));
    }

    async delete(id, restaurantId) {
        await this.getById(id, restaurantId);

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
