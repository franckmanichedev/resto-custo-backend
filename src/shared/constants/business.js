module.exports = {
    WEEK_DAYS: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    MENU_ITEM_KINDS: ['plat', 'boisson'],
    MENU_ITEM_CATEGORIES: ['plat', 'boisson', 'entree'],
    ACTIVE_ORDER_STATUSES: ['pending', 'preparing'], // Etat d'une commande qui est encore en cours de préparation
    ALLOWED_ORDER_STATUSES: ['pending', 'preparing', 'ready', 'served', 'cancelled'], // Tous les états possibles d'une commande
    SESSION_DURATION_MINUTES: 60,
    MAX_NOTE_LENGTH: 500
};
