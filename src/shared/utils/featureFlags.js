const isFeatureEnabled = (name, defaultValue = true) => {
    const rawValue = process.env[name];
    if (rawValue === undefined || rawValue === null || rawValue === '') {
        return defaultValue;
    }

    return !['false', '0', 'off', 'no'].includes(String(rawValue).trim().toLowerCase());
};

module.exports = {
    isFeatureEnabled,
    isAdvancedRbacEnabled: () => isFeatureEnabled('ENABLE_ADVANCED_RBAC', true),
    isImpersonationEnabled: () => isFeatureEnabled('ENABLE_IMPERSONATION', true),
    isMultiBranchUsersEnabled: () => isFeatureEnabled('ENABLE_MULTI_BRANCH_USERS', true)
};
