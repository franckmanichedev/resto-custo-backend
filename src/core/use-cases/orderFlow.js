const getRemainingSeconds = (targetDate) => {
    const diff = new Date(targetDate).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 1000));
};

const buildSessionPayload = (session) => ({
    id: session.id,
    table_id: session.table_id,
    session_token: session.session_token,
    restaurant_id: session.restaurant_id || null,
    created_at: session.created_at,
    expires_at: session.expires_at,
    refreshed_at: session.refreshed_at || null,
    was_extended: Boolean(session.refreshed_at),
    session_extended: Boolean(session._extended),
    remaining_seconds: getRemainingSeconds(session.expires_at)
});

const buildPreparationState = ({ status, estimatedReadyAt, preparationStartedAt, prepTime = 0 }) => {
    const preparationTotalMinutes = Math.max(0, Number(prepTime || 0));
    const preparationTotalSeconds = preparationTotalMinutes * 60;
    const countdownActive = status === 'preparing' && Boolean(estimatedReadyAt);

    return {
        preparation_started_at: preparationStartedAt || null,
        preparation_total_minutes: preparationTotalMinutes,
        preparation_total_seconds: preparationTotalSeconds,
        estimated_ready_at: estimatedReadyAt || null,
        countdown_active: countdownActive,
        remaining_seconds: countdownActive
            ? getRemainingSeconds(estimatedReadyAt)
            : status === 'served'
                ? 0
                : null
    };
};

module.exports = {
    getRemainingSeconds,
    buildSessionPayload,
    buildPreparationState
};
