class Logger {
    constructor() {
        this._prefix = '';
    }

    setUUID(uuid) {
        this._prefix = `[${uuid}] `;
    }

    log(message) {
        globalThis.log(this._prefix + message);
    }
}

module.exports = {globalLogger: new Logger(), Logger};
