const { db } = require('../firebase/firebaseAdmin');

module.exports = {
    db,
    getCollection: (name) => db.collection(name)
};
