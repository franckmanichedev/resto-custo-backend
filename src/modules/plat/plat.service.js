const AppError = require('../../shared/errors/AppError');
const PlatEntity = require('../../core/entities/Plat');
const CompositionEntity = require('../../core/entities/Composition');
const { normalizeName, normalizeKind } = require('../../shared/utils/normalizers');
const { filterByRestaurantScope, matchesRestaurantScope, withRestaurantScope } = require('../../shared/utils/tenant');
const {
    getCurrentWeekDay,
    isMenuItemAvailableForDay,
    getConsultableDaysFromMenuItems,
    buildMenuItemView
} = require('../../core/use-cases/menuCatalog');

class PlatService {
    constructor({ platRepository, compositionRepository, categoryRepository, storageService }) {
        this.platRepository = platRepository;
        this.compositionRepository = compositionRepository;
        this.categoryRepository = categoryRepository;
        this.storageService = storageService;
    }

    async getMenuItemCompositions(menuItemId, restaurantId) {
        const links = await this.platRepository.listCompositionLinks(menuItemId);
        const compositionIds = links
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
            .map((link) => link.composition_id);

        const compositions = await Promise.all(compositionIds.map((id) => this.compositionRepository.findById(id)));
        return compositions
            .filter(Boolean)
            .filter((composition) => matchesRestaurantScope(composition, restaurantId))
            .map((composition) => CompositionEntity.create(composition));
    }

    async getCategoryDetails(menuItem, restaurantId) {
        const [category, typeCategory] = await Promise.all([
            menuItem.categorie_id ? this.categoryRepository.findCategoryById(menuItem.categorie_id) : null,
            menuItem.type_categorie_id ? this.categoryRepository.findTypeCategoryById(menuItem.type_categorie_id) : null
        ]);

        return {
            category: matchesRestaurantScope(category, restaurantId) ? category : null,
            typeCategory: matchesRestaurantScope(typeCategory, restaurantId) ? typeCategory : null
        };
    }

    async buildMenuItemResponse(menuItem, restaurantId, options = {}) {
        const currentDay = options.currentDay || getCurrentWeekDay();
        const requestedDay = options.requestedDay || currentDay;
        const [compositions, taxonomy] = await Promise.all([
            this.getMenuItemCompositions(menuItem.id, restaurantId),
            this.getCategoryDetails(menuItem, restaurantId)
        ]);

        return PlatEntity.create(buildMenuItemView({
            menuItem,
            compositions,
            category: taxonomy.category,
            typeCategory: taxonomy.typeCategory,
            currentDay,
            requestedDay
        }));
    }

    async ensureCompositionExists(selection, restaurantId) {
        if (selection.composition_id) {
            const existing = await this.compositionRepository.findById(selection.composition_id);
            if (!existing || !matchesRestaurantScope(existing, restaurantId)) {
                throw new AppError(`Composition introuvable: ${selection.composition_id}`, 404);
            }

            return existing;
        }

        const normalizedName = normalizeName(selection.name);
        const existingMatches = filterByRestaurantScope(
            await this.compositionRepository.findByNormalizedName(normalizedName),
            restaurantId
        );

        if (existingMatches.length > 0) {
            return existingMatches[0];
        }

        const now = new Date().toISOString();
        const ref = this.compositionRepository.createRef();
        const composition = withRestaurantScope({
            id: ref.id,
            name: selection.name,
            normalized_name: normalizedName,
            is_allergen: selection.is_allergen || false,
            description: selection.description || '',
            aliases: [],
            is_active: true,
            createdAt: now,
            updatedAt: now
        }, restaurantId);

        await this.compositionRepository.create(ref.id, composition);
        return composition;
    }

    async syncMenuItemCompositions(menuItemId, selections, restaurantId) {
        const resolved = [];
        const seen = new Set();

        for (const selection of selections || []) {
            const composition = await this.ensureCompositionExists(selection, restaurantId);
            if (!seen.has(composition.id)) {
                seen.add(composition.id);
                resolved.push(composition);
            }
        }

        await this.platRepository.replaceCompositionLinks(
            menuItemId,
            resolved.map((item) => item.id)
        );

        return resolved;
    }

    async create(payload, file, restaurantId) {
        const now = new Date().toISOString();
        const ref = this.platRepository.createRef();
        const compositionSelections = payload.compositionSelections || [];
        const imageUrl = file
            ? await this.storageService.uploadBuffer({ file, folder: 'menu-items', entityId: ref.id })
            : (payload.image_url || '');
        const kind = normalizeKind(payload.kind || payload.category || payload.legacy_category);

        const menuItem = PlatEntity.create(withRestaurantScope({
            id: ref.id,
            name: payload.name,
            description: payload.description || '',
            price: payload.price,
            prep_time: payload.prep_time || 0,
            image_url: imageUrl,
            kind,
            category: payload.category || kind,
            legacy_category: payload.category || null,
            categorie_id: payload.categorie_id || null,
            categorie_name: payload.categorie_name || null,
            type_categorie_id: payload.type_categorie_id || null,
            type_categorie_name: payload.type_categorie_name || null,
            is_promo: payload.is_promo || false,
            is_available: payload.is_available !== false,
            availability_mode: payload.availability_mode || 'everyday',
            available_days: Array.isArray(payload.available_days) ? payload.available_days : [],
            is_decomposable: compositionSelections.length > 0 || payload.is_decomposable === true,
            allow_custom_message: payload.allow_custom_message ?? true,
            custom_message_hint: payload.custom_message_hint || '',
            createdAt: now,
            updatedAt: now
        }, restaurantId));

        await this.platRepository.create(ref.id, menuItem);
        const compositions = await this.syncMenuItemCompositions(ref.id, compositionSelections, restaurantId);

        return this.buildMenuItemResponse({
            ...menuItem,
            is_decomposable: compositions.length > 0 || menuItem.is_decomposable
        }, restaurantId);
    }

    async list(query, restaurantId, options = {}) {
        const search = typeof query.search === 'string' ? query.search.trim().toLowerCase() : '';
        const categoryFilter = typeof query.category === 'string' ? query.category.trim().toLowerCase() : '';
        const kindFilter = typeof query.kind === 'string' ? query.kind.trim().toLowerCase() : '';
        const categorieIdFilter = typeof query.categorie_id === 'string' ? query.categorie_id.trim() : '';
        const typeCategorieIdFilter = typeof query.type_categorie_id === 'string' ? query.type_categorie_id.trim() : '';
        const sortBy = typeof query.sort_by === 'string' ? query.sort_by.trim().toLowerCase() : 'created_at';
        const sortOrder = query.sort_order === 'asc' ? 'asc' : 'desc';
        const onlyDecomposable = query.is_decomposable === 'true';
        const availableFilter = query.is_available;
        const availableToday = query.available_today === 'true';
        const currentDay = options.currentDay || getCurrentWeekDay();
        const requestedDay = options.requestedDay || currentDay;

        const rawPlats = filterByRestaurantScope(await this.platRepository.listAll(), restaurantId);
        let plats = await Promise.all(
            rawPlats.map((item) => this.buildMenuItemResponse(item, restaurantId, { currentDay, requestedDay }))
        );

        if (options.onlyAvailableForRequestedDay) {
            plats = plats.filter((plat) => isMenuItemAvailableForDay(plat, requestedDay));
        }

        if (search) {
            plats = plats.filter((plat) => {
                const searchableValues = [plat.name, plat.description]
                    .concat((plat.compositions || []).map((composition) => composition.name))
                    .filter(Boolean)
                    .map((value) => value.toLowerCase());

                return searchableValues.some((value) => value.includes(search));
            });
        }

        if (categoryFilter) {
            plats = plats.filter((plat) =>
                [plat.category, plat.kind, plat.categorie_name]
                    .filter(Boolean)
                    .map((value) => String(value).trim().toLowerCase())
                    .includes(categoryFilter)
            );
        }

        if (kindFilter) {
            plats = plats.filter((plat) => (plat.kind || 'plat') === kindFilter);
        }

        if (categorieIdFilter) {
            plats = plats.filter((plat) => plat.categorie_id === categorieIdFilter);
        }

        if (typeCategorieIdFilter) {
            plats = plats.filter((plat) => plat.type_categorie_id === typeCategorieIdFilter);
        }

        if (onlyDecomposable) {
            plats = plats.filter((plat) => plat.is_decomposable === true);
        }

        if (availableFilter === 'true') {
            plats = plats.filter((plat) => plat.is_available !== false);
        } else if (availableFilter === 'false') {
            plats = plats.filter((plat) => plat.is_available === false);
        }

        if (availableToday) {
            plats = plats.filter((plat) => plat.is_available_today === true);
        }

        const compareValues = (left, right) => {
            if (typeof left === 'number' && typeof right === 'number') {
                return left - right;
            }

            return String(left || '').localeCompare(String(right || ''), 'fr', { sensitivity: 'base' });
        };

        plats.sort((a, b) => {
            let comparison = 0;

            if (sortBy === 'name') {
                comparison = compareValues(a.name, b.name);
            } else if (sortBy === 'price') {
                comparison = compareValues(Number(a.price || 0), Number(b.price || 0));
            } else if (sortBy === 'category') {
                comparison = compareValues(a.categorie_name || a.category || 'plat', b.categorie_name || b.category || 'plat')
                    || compareValues(a.name, b.name);
            } else {
                comparison = compareValues(new Date(a.createdAt || 0).getTime(), new Date(b.createdAt || 0).getTime());
            }

            return sortOrder === 'asc' ? comparison : -comparison;
        });

        return plats;
    }

    async getById(id, restaurantId, options = {}) {
        const plat = await this.platRepository.findById(id);
        if (!plat || !matchesRestaurantScope(plat, restaurantId)) {
            throw new AppError('Plat introuvable', 404);
        }

        return this.buildMenuItemResponse(plat, restaurantId, options);
    }

    async update(id, payload, file, restaurantId) {
        const existing = await this.platRepository.findById(id);
        if (!existing || !matchesRestaurantScope(existing, restaurantId)) {
            throw new AppError('Plat introuvable', 404);
        }

        const updates = { ...payload, updatedAt: new Date().toISOString() };

        if (updates.kind || updates.category || updates.legacy_category) {
            updates.kind = normalizeKind(updates.kind || updates.category || updates.legacy_category);
            if (updates.category) {
                updates.legacy_category = updates.category;
            }
        }

        if (file) {
            updates.image_url = await this.storageService.uploadBuffer({ file, folder: 'menu-items', entityId: id });
        }

        delete updates.compositionSelections;

        if (payload.compositionSelections) {
            const compositions = await this.syncMenuItemCompositions(id, payload.compositionSelections, restaurantId);
            updates.is_decomposable = compositions.length > 0 || updates.is_decomposable === true;
        }

        await this.platRepository.update(id, updates);
        return this.getById(id, restaurantId);
    }

    async delete(id, restaurantId) {
        const existing = await this.platRepository.findById(id);
        if (!existing || !matchesRestaurantScope(existing, restaurantId)) {
            throw new AppError('Plat introuvable', 404);
        }

        await this.platRepository.deleteWithLinks(id);
    }

    async toggleAvailability(id, restaurantId) {
        const existing = await this.platRepository.findById(id);
        if (!existing || !matchesRestaurantScope(existing, restaurantId)) {
            throw new AppError('Plat introuvable', 404);
        }

        await this.platRepository.update(id, {
            is_available: existing.is_available === false,
            updatedAt: new Date().toISOString()
        });

        return this.getById(id, restaurantId);
    }

    async getMenuCatalog(restaurantId, requestedDay) {
        const currentDay = getCurrentWeekDay();
        const effectiveRequestedDay = requestedDay || currentDay;
        const rawPlats = filterByRestaurantScope(await this.platRepository.listAll(), restaurantId)
            .filter((plat) => plat.is_available !== false);
        const consultableDays = getConsultableDaysFromMenuItems(rawPlats);
        const plats = await Promise.all(
            rawPlats
                .filter((plat) => isMenuItemAvailableForDay(plat, effectiveRequestedDay))
                .map((plat) => this.buildMenuItemResponse(plat, restaurantId, { currentDay, requestedDay: effectiveRequestedDay }))
        );

        return {
            currentDay,
            requestedDay: effectiveRequestedDay,
            consultableDays,
            plats
        };
    }
}

module.exports = PlatService;
