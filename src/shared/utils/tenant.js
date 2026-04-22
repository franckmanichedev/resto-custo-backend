const DEFAULT_RESTAURANT_ID = process.env.DEFAULT_RESTAURANT_ID || 'default-restaurant';

const extractRestaurantId = (source) => {
    if (!source || typeof source !== 'object') {
        return null;
    }

    return source.restaurant_id
        || source.restaurantId
        || source?.headers?.['x-restaurant-id']
        || source?.headers?.['X-Restaurant-Id']
        || null;
};

const resolveRestaurantId = (input) => {
    if (typeof input === 'string' && input.trim()) {
        return input.trim();
    }

    if (!input || typeof input !== 'object') {
        return DEFAULT_RESTAURANT_ID;
    }

    return extractRestaurantId(input.user)
        || extractRestaurantId(input.body)
        || extractRestaurantId(input.query)
        || extractRestaurantId(input)
        || DEFAULT_RESTAURANT_ID;
};

const matchesRestaurantScope = (entity, restaurantId) =>
    Boolean(entity) && (!entity.restaurant_id || entity.restaurant_id === restaurantId);

const filterByRestaurantScope = (entities, restaurantId) =>
    (entities || []).filter((entity) => matchesRestaurantScope(entity, restaurantId));

const withRestaurantScope = (payload, restaurantId) => ({
    ...payload,
    restaurant_id: payload.restaurant_id || restaurantId || DEFAULT_RESTAURANT_ID
});

module.exports = {
    DEFAULT_RESTAURANT_ID,
    resolveRestaurantId,
    matchesRestaurantScope,
    filterByRestaurantScope,
    withRestaurantScope
};
