const { db } = require('../../infrastructure/firebase/firebaseAdmin');
const {
    CATEGORIES,
    TYPE_CATEGORIES,
    MENU_ITEMS
} = require('../../shared/constants/collections');
const { serializeDoc, toFirestoreData } = require('../../shared/utils/firestore');

class CategoryRepository {
    constructor(firestore = db) {
        this.categoryCollection = firestore.collection(CATEGORIES);
        this.typeCategoryCollection = firestore.collection(TYPE_CATEGORIES);
        this.menuItemCollection = firestore.collection(MENU_ITEMS);
    }

    createCategoryRef() {
        return this.categoryCollection.doc();
    }

    createTypeCategoryRef() {
        return this.typeCategoryCollection.doc();
    }

    async listCategories() {
        const snapshot = await this.categoryCollection.orderBy('name').get();
        return snapshot.docs.map(serializeDoc);
    }

    async listTypeCategories() {
        const snapshot = await this.typeCategoryCollection.orderBy('name').get();
        return snapshot.docs.map(serializeDoc);
    }

    async findCategoryById(id) {
        const doc = await this.categoryCollection.doc(id).get();
        return doc.exists ? serializeDoc(doc) : null;
    }

    async findTypeCategoryById(id) {
        const doc = await this.typeCategoryCollection.doc(id).get();
        return doc.exists ? serializeDoc(doc) : null;
    }

    async findCategoryByNormalizedName(normalizedName, kind) {
        const snapshot = await this.categoryCollection
            .where('normalized_name', '==', normalizedName)
            .where('kind', '==', kind)
            .get();

        return snapshot.docs.map(serializeDoc);
    }

    async findTypeCategoryByNormalizedName(categorieId, normalizedName) {
        const snapshot = await this.typeCategoryCollection
            .where('categorie_id', '==', categorieId)
            .where('normalized_name', '==', normalizedName)
            .get();

        return snapshot.docs.map(serializeDoc);
    }

    async createCategory(id, payload) {
        const data = toFirestoreData(payload);
        await this.categoryCollection.doc(id).set(data);
        return { id, ...data };
    }

    async updateCategory(id, payload) {
        await this.categoryCollection.doc(id).update(toFirestoreData(payload));
        return this.findCategoryById(id);
    }

    async deleteCategory(id) {
        await this.categoryCollection.doc(id).delete();
    }

    async createTypeCategory(id, payload) {
        const data = toFirestoreData(payload);
        await this.typeCategoryCollection.doc(id).set(data);
        return { id, ...data };
    }

    async updateTypeCategory(id, payload) {
        await this.typeCategoryCollection.doc(id).update(toFirestoreData(payload));
        return this.findTypeCategoryById(id);
    }

    async deleteTypeCategory(id) {
        await this.typeCategoryCollection.doc(id).delete();
    }

    async hasMenuItemsForCategory(categoryId) {
        const snapshot = await this.menuItemCollection.where('categorie_id', '==', categoryId).limit(1).get();
        return !snapshot.empty;
    }

    async hasTypeCategoriesForCategory(categoryId) {
        const snapshot = await this.typeCategoryCollection.where('categorie_id', '==', categoryId).limit(1).get();
        return !snapshot.empty;
    }

    async hasMenuItemsForTypeCategory(typeCategoryId) {
        const snapshot = await this.menuItemCollection.where('type_categorie_id', '==', typeCategoryId).limit(1).get();
        return !snapshot.empty;
    }

    async findCategoriesByIds(ids) {
        return Promise.all(ids.map((id) => this.findCategoryById(id)));
    }

    async findTypeCategoriesByIds(ids) {
        return Promise.all(ids.map((id) => this.findTypeCategoryById(id)));
    }
}

module.exports = CategoryRepository;
