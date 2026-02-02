// In-memory cache for ultrafast reads (no disk I/O)
const _cache = new Map();

export const memGet = (key) => _cache.get(key) || null;
export const memSet = (key, value) => _cache.set(key, value);
export const memClear = () => _cache.clear();
