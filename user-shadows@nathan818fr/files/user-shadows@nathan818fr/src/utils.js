function safeGet(obj, ...keys) {
    for (const key of keys) {
        if (typeof obj !== 'object') {
            return undefined;
        }
        obj = obj[key];
    }
    return obj;
}

module.exports = { safeGet };
