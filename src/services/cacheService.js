class MemoryCacheService {
    constructor({ ttlMs = Number(process.env.SAAS_SCOPE_CACHE_TTL_MS || 5 * 60 * 1000), maxSize = 1000, now = () => Date.now() } = {}) { // Par defaut 5 minutes
        this.ttlMs = ttlMs;
        this.maxSize = maxSize;
        this.now = now;
        this.items = new Map();
    }

    get(key) {
        const entry = this.items.get(key);
        if (!entry) {
            return null;
        }

        if (entry.expiresAt <= this.now()) {
            this.items.delete(key);
            return null;
        }

        return entry.value;
    }

    set(key, value, ttlMs = this.ttlMs) {
        if (this.items.size >= this.maxSize) {
            const oldestKey = this.items.keys().next().value;
            if (oldestKey) {
                this.items.delete(oldestKey);
            }
        }

        this.items.set(key, {
            value,
            expiresAt: this.now() + ttlMs
        });

        return value;
    }

    delete(key) {
        this.items.delete(key);
    }

    clear() {
        this.items.clear();
    }
}

module.exports = MemoryCacheService;
