const AppError = require('../../shared/errors/AppError');
const BranchesEntity = require('../../core/entities/Branches');
const { createSlug } = require('../../shared/utils/slug');

class BranchesService {
    constructor({ branchesRepository, organizationsRepository }) {
        this.branchesRepository = branchesRepository;
        this.organizationsRepository = organizationsRepository;
    }

    async assertOrganizationExists(organizationId) {
        const organization = await this.organizationsRepository.findById(organizationId);
        if (!organization) {
            throw new AppError('Organisation introuvable pour cette branche', 404);
        }

        return organization;
    }

    async create(payload) {
        await this.assertOrganizationExists(payload.organizationId);

        const now = new Date().toISOString();
        const ref = this.branchesRepository.createRef();
        const slug = payload.slug || createSlug(payload.name);

        if (!slug) {
            throw new AppError('Le slug de la branche est requis', 400);
        }

        const duplicate = await this.branchesRepository.findByOrganizationAndSlug(payload.organizationId, slug);
        if (duplicate) {
            throw new AppError('Une branche utilise deja ce slug dans cette organisation', 409, { data: duplicate });
        }

        const branch = BranchesEntity.create({
            id: ref.id,
            organizationId: payload.organizationId,
            slug,
            name: payload.name,
            code: payload.code || slug.toUpperCase().replace(/-/g, '_'),
            address: payload.address || '',
            city: payload.city || '',
            country: payload.country || '',
            phoneNumber: payload.phoneNumber || '',
            email: payload.email || '',
            isMainBranch: payload.isMainBranch ?? false,
            isActive: payload.isActive ?? true,
            metadata: payload.metadata || {},
            createdAt: now,
            updatedAt: now
        });

        return this.branchesRepository.create(ref.id, branch);
    }

    async list(query = {}) {
        const filters = {
            organizationId: query.organizationId || null,
            isActive: query.isActive === undefined ? undefined : query.isActive === 'true' || query.isActive === true
        };

        const items = await this.branchesRepository.list(filters);
        return items.map((item) => BranchesEntity.create(item));
    }

    async getById(id) {
        const branch = await this.branchesRepository.findById(id);
        if (!branch) {
            throw new AppError('Branche introuvable', 404);
        }

        return BranchesEntity.create(branch);
    }

    async update(id, payload) {
        const current = await this.getById(id);
        const organizationId = payload.organizationId || current.organizationId;

        if (payload.organizationId && payload.organizationId !== current.organizationId) {
            await this.assertOrganizationExists(payload.organizationId);
        }

        const updates = {
            ...payload,
            updatedAt: new Date().toISOString()
        };

        if (payload.name && !payload.slug) {
            updates.slug = createSlug(payload.name);
        }

        if (updates.slug) {
            const duplicate = await this.branchesRepository.findByOrganizationAndSlug(organizationId, updates.slug);
            if (duplicate && duplicate.id !== id) {
                throw new AppError('Une autre branche utilise deja ce slug dans cette organisation', 409);
            }
        }

        delete updates.id;
        delete updates.createdAt;

        return BranchesEntity.create(await this.branchesRepository.update(id, updates));
    }

    async delete(id) {
        const current = await this.getById(id);
        await this.branchesRepository.update(id, {
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

module.exports = BranchesService;
