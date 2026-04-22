const AppError = require('../../shared/errors/AppError');
const CategoryEntity = require('../../core/entities/Category');
const TypeCategoryEntity = require('../../core/entities/TypeCategory');
const { normalizeName } = require('../../shared/utils/normalizers');
const { filterByRestaurantScope, matchesRestaurantScope, withRestaurantScope } = require('../../shared/utils/tenant');

class CategoryService {
    constructor({ categoryRepository, storageService }) {
        this.categoryRepository = categoryRepository;
        this.storageService = storageService;
    }

    async createCategory(payload, file, restaurantId) {
        const name = payload.name.trim();
        const normalizedName = normalizeName(name);
        const duplicates = filterByRestaurantScope(
            await this.categoryRepository.findCategoryByNormalizedName(normalizedName, payload.kind),
            restaurantId
        );

        if (duplicates.length > 0) {
            throw new AppError('Cette categorie existe deja', 409, { data: duplicates[0] });
        }

        const now = new Date().toISOString();
        const ref = this.categoryRepository.createCategoryRef();
        const imageUrl = file
            ? await this.storageService.uploadBuffer({ file, folder: 'categories', entityId: ref.id })
            : (payload.image_url || '');

        const category = CategoryEntity.create(withRestaurantScope({
            id: ref.id,
            name,
            normalized_name: normalizedName,
            kind: payload.kind,
            description: payload.description || '',
            image_url: imageUrl,
            is_active: payload.is_active ?? true,
            createdAt: now,
            updatedAt: now
        }, restaurantId));

        await this.categoryRepository.createCategory(ref.id, category);
        return category;
    }

    async listCategories(query, restaurantId) {
        const kindFilter = typeof query.kind === 'string' ? query.kind.trim().toLowerCase() : '';
        const search = typeof query.search === 'string' ? normalizeName(query.search) : '';

        let categories = filterByRestaurantScope(await this.categoryRepository.listCategories(), restaurantId);
        if (kindFilter) {
            categories = categories.filter((category) => category.kind === kindFilter);
        }

        if (search) {
            categories = categories.filter((category) =>
                [category.name, category.normalized_name].filter(Boolean).some((value) => normalizeName(value).includes(search))
            );
        }

        return categories.map((item) => CategoryEntity.create(item));
    }

    async getCategoryById(id, restaurantId) {
        const category = await this.categoryRepository.findCategoryById(id);
        if (!category || !matchesRestaurantScope(category, restaurantId)) {
            throw new AppError('Categorie introuvable', 404);
        }

        return CategoryEntity.create(category);
    }

    async updateCategory(id, payload, file, restaurantId) {
        const current = await this.getCategoryById(id, restaurantId);
        const updates = { ...payload, updatedAt: new Date().toISOString() };

        if (updates.name) {
            updates.name = updates.name.trim();
            updates.normalized_name = normalizeName(updates.name);
        }

        if (updates.normalized_name || updates.kind) {
            const duplicates = filterByRestaurantScope(
                await this.categoryRepository.findCategoryByNormalizedName(
                    updates.normalized_name || current.normalized_name,
                    updates.kind || current.kind
                ),
                restaurantId
            ).filter((item) => item.id !== id);

            if (duplicates.length > 0) {
                throw new AppError('Une autre categorie utilise deja ce nom pour ce type', 409);
            }
        }

        if (file) {
            updates.image_url = await this.storageService.uploadBuffer({ file, folder: 'categories', entityId: id });
        }

        delete updates.id;
        delete updates.createdAt;
        return CategoryEntity.create(await this.categoryRepository.updateCategory(id, updates));
    }

    async deleteCategory(id, restaurantId) {
        await this.getCategoryById(id, restaurantId);

        const [hasMenuItems, hasTypeCategories] = await Promise.all([
            this.categoryRepository.hasMenuItemsForCategory(id),
            this.categoryRepository.hasTypeCategoriesForCategory(id)
        ]);

        if (hasMenuItems || hasTypeCategories) {
            throw new AppError('Impossible de supprimer cette categorie car elle est encore utilisee', 409);
        }

        await this.categoryRepository.deleteCategory(id);
    }

    async createTypeCategory(payload, file, restaurantId) {
        const category = await this.getCategoryById(payload.categorie_id, restaurantId);
        const name = payload.name.trim();
        const normalizedName = normalizeName(name);
        const duplicates = filterByRestaurantScope(
            await this.categoryRepository.findTypeCategoryByNormalizedName(category.id, normalizedName),
            restaurantId
        );

        if (duplicates.length > 0) {
            throw new AppError('Ce type de categorie existe deja', 409, { data: duplicates[0] });
        }

        const now = new Date().toISOString();
        const ref = this.categoryRepository.createTypeCategoryRef();
        const imageUrl = file
            ? await this.storageService.uploadBuffer({ file, folder: 'type-categories', entityId: ref.id })
            : (payload.image_url || '');

        const typeCategory = TypeCategoryEntity.create(withRestaurantScope({
            id: ref.id,
            categorie_id: category.id,
            name,
            normalized_name: normalizedName,
            description: payload.description || '',
            image_url: imageUrl,
            is_active: payload.is_active ?? true,
            createdAt: now,
            updatedAt: now
        }, restaurantId));

        await this.categoryRepository.createTypeCategory(ref.id, typeCategory);
        return typeCategory;
    }

    async listTypeCategories(query, restaurantId) {
        const categoryId = typeof query.categorie_id === 'string' ? query.categorie_id.trim() : '';
        const search = typeof query.search === 'string' ? normalizeName(query.search) : '';

        let items = filterByRestaurantScope(await this.categoryRepository.listTypeCategories(), restaurantId);
        if (categoryId) {
            items = items.filter((item) => item.categorie_id === categoryId);
        }

        if (search) {
            items = items.filter((item) =>
                [item.name, item.normalized_name].filter(Boolean).some((value) => normalizeName(value).includes(search))
            );
        }

        return items.map((item) => TypeCategoryEntity.create(item));
    }

    async getTypeCategoryById(id, restaurantId) {
        const typeCategory = await this.categoryRepository.findTypeCategoryById(id);
        if (!typeCategory || !matchesRestaurantScope(typeCategory, restaurantId)) {
            throw new AppError('Type de categorie introuvable', 404);
        }

        return TypeCategoryEntity.create(typeCategory);
    }

    async updateTypeCategory(id, payload, file, restaurantId) {
        const current = await this.getTypeCategoryById(id, restaurantId);
        const updates = { ...payload, updatedAt: new Date().toISOString() };

        if (updates.categorie_id) {
            await this.getCategoryById(updates.categorie_id, restaurantId);
        }

        if (updates.name) {
            updates.name = updates.name.trim();
            updates.normalized_name = normalizeName(updates.name);
        }

        if (updates.normalized_name || updates.categorie_id) {
            const targetCategoryId = updates.categorie_id || current.categorie_id;
            const targetNormalizedName = updates.normalized_name || current.normalized_name;
            const duplicates = filterByRestaurantScope(
                await this.categoryRepository.findTypeCategoryByNormalizedName(targetCategoryId, targetNormalizedName),
                restaurantId
            ).filter((item) => item.id !== id);

            if (duplicates.length > 0) {
                throw new AppError('Un autre type de categorie utilise deja ce nom pour cette categorie', 409);
            }
        }

        if (file) {
            updates.image_url = await this.storageService.uploadBuffer({ file, folder: 'type-categories', entityId: id });
        }

        return TypeCategoryEntity.create(await this.categoryRepository.updateTypeCategory(id, updates));
    }

    async deleteTypeCategory(id, restaurantId) {
        await this.getTypeCategoryById(id, restaurantId);
        if (await this.categoryRepository.hasMenuItemsForTypeCategory(id)) {
            throw new AppError('Impossible de supprimer ce type de categorie car il est encore utilise', 409);
        }

        await this.categoryRepository.deleteTypeCategory(id);
    }
}

module.exports = CategoryService;
