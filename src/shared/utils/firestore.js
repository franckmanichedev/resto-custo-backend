const serializeDoc = (doc) => ({
    id: doc.id,
    ...doc.data()
});

const isDate = (value) => value instanceof Date;

const toFirestoreData = (value) => {
    if (Array.isArray(value)) {
        return value
            .map((entry) => toFirestoreData(entry))
            .filter((entry) => entry !== undefined);
    }

    if (value === null || value === undefined || typeof value !== 'object' || isDate(value)) {
        return value;
    }

    const normalized = {};

    Object.entries(value).forEach(([key, entry]) => {
        const nextValue = toFirestoreData(entry);
        if (nextValue !== undefined) {
            normalized[key] = nextValue;
        }
    });

    return normalized;
};

module.exports = {
    serializeDoc,
    toFirestoreData
};
