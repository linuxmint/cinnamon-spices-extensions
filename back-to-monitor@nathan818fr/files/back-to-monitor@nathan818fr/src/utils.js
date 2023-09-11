const GObject = imports.gi.GObject;

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

function addSignalHook(storage, object, signalName, callback) {
    const signalId = GObject.signal_lookup(signalName, object);
    if (!signalId) {
        return;
    }

    const hookId = GObject.signal_add_emission_hook(signalId, undefined, () => {
        try {
            callback();
        } catch (err) {
            globalThis.log(err);
        }
        return true;
    });
    if (!hookId) {
        return;
    }

    storage.push([signalId, hookId]);
}

function removeSignalHooks(storage) {
    for (const [signalId, hookId] of storage) {
        GObject.signal_remove_emission_hook(signalId, hookId);
    }
    storage.length = 0;
}

module.exports = {callSafely, delayQueue, arrayRemoveIf, addSignalHook, removeSignalHooks};
