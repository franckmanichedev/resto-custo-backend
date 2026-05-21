const AppError = require('../../shared/errors/AppError');
const TableEntity = require('../../core/entities/Table');
const {
    filterByTenantAndRestaurantScope,
    matchesTenantAndRestaurantScope,
    withTenantAndRestaurantScope
} = require('../../shared/utils/tenant');
const {
    assertBranchOwnership,
    filterByBusinessScope,
    matchesBusinessScope,
    withBusinessScope
} = require('../../shared/utils/scopedFirestore');

const DEFAULT_FRONTEND_URLS = {
    development: 'http://localhost:3000',
    production: 'https://resto-custo.netlify.app'
};

const getFrontendBaseUrl = () => {
    const env = process.env.NODE_ENV === 'production' ? 'production' : 'development';
    return process.env[`FRONTEND_URL_${env.toUpperCase()}`]
        || process.env.FRONTEND_URL
        || DEFAULT_FRONTEND_URLS[env];
};

class TableService {
    constructor({ tableRepository, platService }) {
        this.tableRepository = tableRepository;
        this.platService = platService;
    }

    buildTableMenuUrl(tableId) {
        return `${getFrontendBaseUrl().replace(/\/$/, '')}/client/loading.html?table=${tableId}`;
    }

    async ensureUniqueTableNumber(number, tenantId, restaurantId, excludeId = null, scope = {}) {
        const scopedMatches = this.tableRepository.findByNumberScoped
            ? await this.tableRepository.findByNumberScoped(number, scope, restaurantId)
            : await this.tableRepository.findByNumber(number);
        const matches = filterByBusinessScope(scopedMatches, restaurantId, scope)
            .filter((table) => table.id !== excludeId);

        if (matches.length > 0) {
            throw new AppError('Une table avec ce numero existe deja', 409);
        }
    }

    async create(payload, tenantId, restaurantId, scope = {}) {
        await this.ensureUniqueTableNumber(payload.number, tenantId, restaurantId, null, scope);

        const now = new Date().toISOString();
        const ref = this.tableRepository.createRef();
        const menuUrl = this.buildTableMenuUrl(ref.id);
        const qrCode = payload.qr_code || menuUrl;

        const table = TableEntity.create(withBusinessScope(withTenantAndRestaurantScope({
            id: ref.id,
            name: payload.name,
            number: payload.number,
            qr_code: qrCode,
            menu_url: menuUrl,
            is_active: payload.is_active ?? true,
            created_at: now,
            updated_at: now,
            createdAt: now,
            updatedAt: now
        }, tenantId, restaurantId), restaurantId, scope));

        await this.tableRepository.create(ref.id, table);
        return table;
    }

    async list(tenantId, restaurantId, scope = {}) {
        return filterByBusinessScope(
            await this.tableRepository.listScoped(scope, restaurantId),
            restaurantId,
            scope
        ).map((item) => TableEntity.create(item));
    }

    async getById(id, tenantId, restaurantId, scope = {}) {
        const table = await this.tableRepository.findById(id);

        if (!table || (!matchesBusinessScope(table, restaurantId, scope) && !matchesTenantAndRestaurantScope(table, tenantId, restaurantId))) {
            throw new AppError('Table introuvable', 404);
        }

        assertBranchOwnership(table, scope, { collection: 'tables' });
        return TableEntity.create(table);
    }

    async update(id, payload, tenantId, restaurantId, scope = {}) {
        await this.getById(id, tenantId, restaurantId, scope);

        if (payload.number) {
            await this.ensureUniqueTableNumber(payload.number, tenantId, restaurantId, id, scope);
        }

        const updates = {
            ...payload,
            updated_at: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (!updates.qr_code) {
            delete updates.qr_code;
        }

        return TableEntity.create(await this.tableRepository.update(id, updates));
    }

    async delete(id, tenantId, restaurantId, scope = {}) {
        await this.getById(id, tenantId, restaurantId, scope);
        await this.tableRepository.delete(id);
    }

    async getMenu(id, tenantId, restaurantId, scope = {}) {
        const table = await this.getById(id, tenantId, restaurantId, scope);
        const catalog = await this.platService.getMenuCatalog(restaurantId, undefined, scope);

        return {
            table,
            current_day: catalog.currentDay,
            plats: catalog.plats.filter((plat) => plat.is_available_today === true)
        };
    }

    async getMenuByQrCode(qrCode, tenantId, restaurantId, scope = {}) {
        const table = filterByBusinessScope(
            await this.tableRepository.findByQrCode(qrCode),
            restaurantId,
            scope
        )[0];

        if (!table) {
            throw new AppError('Aucune table ne correspond a ce qr_code', 404);
        }

        return this.getMenu(table.id, tenantId, restaurantId, scope);
    }
}

module.exports = TableService;
