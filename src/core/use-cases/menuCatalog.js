const { WEEK_DAYS } = require('../../shared/constants/business');
const { normalizeKind } = require('../../shared/utils/normalizers');

const getCurrentWeekDay = () => {
    const formatter = new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        timeZone: process.env.APP_TIMEZONE || 'Africa/Douala'
    });

    return formatter.format(new Date()).toLowerCase();
};

const isMenuItemAvailableForDay = (menuItem, day = getCurrentWeekDay()) => {
    if (menuItem.is_available === false) {
        return false;
    }

    if ((menuItem.availability_mode || 'everyday') !== 'selected_days') {
        return true;
    }

    return Array.isArray(menuItem.available_days) && menuItem.available_days.includes(day);
};

const getMenuItemAvailableDays = (menuItem) => {
    if ((menuItem.availability_mode || 'everyday') !== 'selected_days') {
        return [...WEEK_DAYS];
    }

    return Array.isArray(menuItem.available_days) ? menuItem.available_days : [];
};

const getConsultableDaysFromMenuItems = (menuItems) => {
    const days = new Set();
    menuItems.forEach((menuItem) => {
        getMenuItemAvailableDays(menuItem).forEach((day) => days.add(day));
    });

    return WEEK_DAYS.filter((day) => days.has(day));
};

const buildMenuItemView = ({
    menuItem,
    compositions = [],
    category = null,
    typeCategory = null,
    currentDay = getCurrentWeekDay(),
    requestedDay = currentDay
}) => {
    const kind = normalizeKind(menuItem.kind || menuItem.category || menuItem.legacy_category || 'plat');

    return {
        ...menuItem,
        kind,
        category: menuItem.category || menuItem.legacy_category || kind,
        categorie_id: menuItem.categorie_id || null,
        categorie_name: category?.name || menuItem.categorie_name || menuItem.category || menuItem.legacy_category || kind,
        type_categorie_id: menuItem.type_categorie_id || null,
        type_categorie_name: typeCategory?.name || menuItem.type_categorie_name || null,
        category_details: category,
        type_category_details: typeCategory,
        is_available: menuItem.is_available !== false,
        availability_mode: menuItem.availability_mode || 'everyday',
        available_days: Array.isArray(menuItem.available_days) ? menuItem.available_days : [],
        consultable_days: getMenuItemAvailableDays(menuItem),
        is_available_today: isMenuItemAvailableForDay(menuItem, currentDay),
        is_orderable_today: isMenuItemAvailableForDay(menuItem, currentDay),
        is_visible_for_requested_day: isMenuItemAvailableForDay(menuItem, requestedDay),
        is_decomposable: compositions.length > 0 || menuItem.is_decomposable === true,
        compositions
    };
};

module.exports = {
    getCurrentWeekDay,
    isMenuItemAvailableForDay,
    getMenuItemAvailableDays,
    getConsultableDaysFromMenuItems,
    buildMenuItemView
};
