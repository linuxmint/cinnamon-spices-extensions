// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

// Trailing debounce: fn runs delayMs after the last call().
function createDebouncer(delayMs, fn, sched) {
    let handle = null;

    function fire() {
        handle = null;
        fn();
    }

    return {
        call() {
            if (handle !== null) sched.clearTimeout(handle);
            handle = sched.setTimeout(fire, delayMs);
        },
        flush() {
            if (handle === null) return;
            sched.clearTimeout(handle);
            fire();
        },
        cancel() {
            if (handle !== null) sched.clearTimeout(handle);
            handle = null;
        },
    };
}
