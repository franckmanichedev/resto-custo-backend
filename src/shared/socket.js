let ioInstance = null;

module.exports = {
    init(io) {
        ioInstance = io;
    },
    getIo() {
        return ioInstance;
    }
};
