/* tilo - prefixed logging, silent by default. */

const PREFIX = '[tilo]';
let _debug = false;

function setDebug(enabled) {
    _debug = !!enabled;
}

function info(message) {
    global.log(`${PREFIX} ${message}`);
}

/* Only writes when the user has ticked "Verbose logging". */
function debug(message) {
    if (_debug) global.log(`${PREFIX} ${message}`);
}

function error(message, exception) {
    global.logError(`${PREFIX} ${message}${exception ? ` :: ${exception}` : ''}`);
}

module.exports = { setDebug, info, debug, error };
