const AppError = require('../../shared/errors/AppError');
const OrganizationsEntity = require('../../core/entities/Organizations');
const { createSlug } = require('../../shared/utils/slug');

class OrganizationsService {
    constructor({ organizationsRepository }) {
        this.organizationsRepository = organizationsRepository;
    }

    async create(payload) {
        const now = new Date().toISOString();
        const ref = this.organizationsRepository.createRef();
        const slug = payload.slug || createSlug(payload.name);

        if (!slug) {
            throw new AppError('Le slug de l organisation est requis', 400);
        }

        const duplicate = await this.organizationsRepository.findBySlug(slug);
        if (duplicate) {
            throw new AppError('Une organisation utilise deja ce slug', 409, { data: duplicate });
        }

        const organization = OrganizationsEntity.create({
            id: ref.id,
            slug,
            name: payload.name,
            type: payload.type || 'independent',
            subscriptionPlan: payload.subscriptionPlan || 'starter',
            isActive: payload.isActive ?? true,
            ownerUserId: payload.ownerUserId || null,
            contact: payload.contact || {},
            metadata: payload.metadata || {},
            createdAt: now,
            updatedAt: now
        });

        return this.organizationsRepository.create(ref.id, organization);
    }

    async list(query = {}) {
        const filters = {
            type: query.type || null,
            isActive: query.isActive === undefined ? undefined : query.isActive === 'true' || query.isActive === true
        };

        const items = await this.organizationsRepository.list(filters);
        return items.map((item) => OrganizationsEntity.create(item));
    }

    async getById(id) {
        const organization = await this.organizationsRepository.findById(id);
        if (!organization) {
            throw new AppError('Organisation introuvable', 404);
        }

        return OrganizationsEntity.create(organization);
    }

    async update(id, payload) {
        await this.getById(id);

        const updates = {
            ...payload,
            updatedAt: new Date().toISOString()
        };

        if (payload.name && !payload.slug) {
            updates.slug = createSlug(payload.name);
        }

        if (updates.slug) {
            const duplicate = await this.organizationsRepository.findBySlug(updates.slug);
            if (duplicate && duplicate.id !== id) {
                throw new AppError('Une autre organisation utilise deja ce slug', 409);
            }
        }

        delete updates.id;
        delete updates.createdAt;

        return OrganizationsEntity.create(await this.organizationsRepository.update(id, updates));
    }

    async delete(id) {
        const current = await this.getById(id);
        await this.organizationsRepository.update(id, {
            isActive: false,
            updatedAt: new Date().toISOString(),
            metadata: {
                ...(current.metadata || {}),
                archivedAt: new Date().toISOString(),
                archiveReason: 'soft_delete'
            }
        });
    }
}

module.exports = OrganizationsService;
