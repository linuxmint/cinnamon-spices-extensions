function callSafely(fn) {
    try {
        return fn();
    } catch (err) {
        globalThis.logError(err);
    }
}

function delayQueue(delayMs, fn) {
    let timer;
    return () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            timer = undefined;
            fn();
        }, delayMs);
    };
}

function arrayRemoveIf(array, predicate) {
    let i = array.length;
    while (i--) {
        if (predicate(array[i], i)) {
            array.splice(i, 1);
        }
    }
}

module.exports = {callSafely, delayQueue, arrayRemoveIf};
