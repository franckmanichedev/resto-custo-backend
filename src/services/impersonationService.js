const AppError = require('../shared/errors/AppError');
const { IMPERSONATION_LOGS } = require('../shared/constants/collections');
const { ROLES, normalizeRole } = require('../shared/constants/roles');
const { isImpersonationEnabled } = require('../shared/utils/featureFlags');
const { assertBranchAccess, resolveUserAccessContext } = require('../shared/utils/accessControl');
const { toFirestoreData, serializeDoc } = require('../shared/utils/firestore');

const IMPERSONATION_ROLES = new Set([
    ROLES.PLATFORM_OWNER,
    ROLES.PLATFORM_ADMIN,
    ROLES.PLATFORM_SUPPORT
]);

class ImpersonationService {
    constructor({ db, logger = console }) {
        this.db = db;
        this.logger = logger;
        this.collection = db ? db.collection(IMPERSONATION_LOGS) : null;
    }

    ensureEnabled() {
        if (!isImpersonationEnabled()) {
            throw new AppError('Impersonation desactivee', 403);
        }

        if (!this.collection) {
            throw new AppError('Firestore indisponible pour impersonation', 500);
        }
    }

    assertActorCanImpersonate(actor = {}) {
        const access = resolveUserAccessContext(actor);
        const role = access.platformRole || normalizeRole(actor.role);
        if (!IMPERSONATION_ROLES.has(role) || !access.canImpersonate) {
            throw new AppError('Acces refuse: impersonation non autorisee', 403, { role });
        }
    }

    validateTarget(payload = {}) {
        const targetOrganizationId = payload.targetOrganizationId || payload.organizationId || null;
        const targetBranchId = payload.targetBranchId || payload.branchId || null;
        if (!targetOrganizationId) {
            throw new AppError('targetOrganizationId est requis', 400);
        }

        return { targetOrganizationId, targetBranchId };
    }

    async start(actor, payload = {}) {
        this.ensureEnabled();
        this.assertActorCanImpersonate(actor);

        const { targetOrganizationId, targetBranchId } = this.validateTarget(payload);
        const actorAccess = resolveUserAccessContext(actor, {
            organizationId: targetOrganizationId,
            branchId: targetBranchId
        });
        assertBranchAccess(actorAccess, targetOrganizationId, targetBranchId);

        const now = new Date().toISOString();
        const ref = this.collection.doc();
        const log = {
            id: ref.id,
            actorId: actor.uid || actor.id,
            actorRole: actorAccess.platformRole || normalizeRole(actor.role),
            targetOrganizationId,
            targetBranchId,
            mode: 'read_only',
            startedAt: now,
            endedAt: null,
            isActive: true,
            reason: payload.reason || null,
            createdAt: now,
            updatedAt: now
        };

        await ref.set(toFirestoreData(log));
        this.logger.info?.('Impersonation started', {
            actorId: log.actorId,
            targetOrganizationId,
            targetBranchId,
            impersonationId: ref.id
        });

        return {
            ...log,
            context: {
                readOnly: true,
                organizationId: targetOrganizationId,
                branchId: targetBranchId
            }
        };
    }

    async end(actor, impersonationId) {
        this.ensureEnabled();
        this.assertActorCanImpersonate(actor);

        const ref = this.collection.doc(impersonationId);
        const doc = await ref.get();
        if (!doc.exists) {
            throw new AppError('Session impersonation introuvable', 404);
        }

        const log = serializeDoc(doc);
        if (log.actorId !== (actor.uid || actor.id) && normalizeRole(actor.role) !== ROLES.PLATFORM_OWNER) {
            throw new AppError('Acces refuse: impersonation hors acteur', 403);
        }

        const now = new Date().toISOString();
        await ref.update(toFirestoreData({
            endedAt: now,
            isActive: false,
            updatedAt: now
        }));

        this.logger.info?.('Impersonation ended', {
            actorId: actor.uid || actor.id,
            impersonationId
        });

        return { ...log, endedAt: now, isActive: false, updatedAt: now };
    }
}

module.exports = ImpersonationService;
