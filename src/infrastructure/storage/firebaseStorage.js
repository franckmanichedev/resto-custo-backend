const crypto = require('crypto');
const { storageBucket } = require('../firebase/firebaseAdmin');
const AppError = require('../../shared/errors/AppError');

const buildStorageFileUrl = (filePath, token) =>
    `https://firebasestorage.googleapis.com/v0/b/${storageBucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`;

const uploadBuffer = async ({ file, folder, entityId }) => {
    if (!file) {
        return '';
    }

    if (!storageBucket) {
        throw new AppError('Firebase Storage n est pas configure', 500);
    }

    const safeName = (file.originalname || 'image')
        .replace(/[^a-zA-Z0-9.\-_]/g, '-')
        .replace(/-+/g, '-');
    const token = crypto.randomUUID();
    const filePath = `${folder}/${entityId}/${Date.now()}-${safeName}`;
    const storageFile = storageBucket.file(filePath);

    await storageFile.save(file.buffer, {
        resumable: false,
        metadata: {
            contentType: file.mimetype,
            metadata: {
                firebaseStorageDownloadTokens: token
            }
        }
    });

    return buildStorageFileUrl(filePath, token);
};

module.exports = {
    uploadBuffer
};
