// The bundle as Cinnamon's loaders see it: run as a plain script, with
// nothing bound to `module`, the way Cinnamon 6.8's importer evaluates an
// extension's main file, and with Cinnamon's own objects stood in for by a
// stub that answers any property, so only the bundle's own top level runs.
// Passing means it runs through and leaves init, enable and disable as
// top-level functions, which both loaders export; a module.exports line, or
// an export statement, fails here before it fails on a desktop.

import { readFileSync } from "node:fs";
import vm from "node:vm";

const path = process.argv[2];
if (path === undefined) {
    console.error("usage: check-bundle.mjs <extension.js>");
    process.exit(2);
}

// Anything: a property of it is itself, it can be called and constructed,
// and as a class it can be extended.
const anything = new Proxy(function anything() {}, {
    get: (target, key) =>
        key === "prototype" ? target.prototype : key === Symbol.toPrimitive ? () => "" : anything,
    construct: () => Object.create(anything.prototype),
    apply: () => anything,
});

const context = vm.createContext({
    imports: anything,
    global: anything,
    globalThis: undefined,
    console,
    Set, Map, Math, Object, Array, String, Number, JSON, Symbol, Error, RegExp, Date, Promise,
});
Object.defineProperty(context, "module", { get: () => undefined });
context.globalThis = context;

try {
    vm.runInContext(readFileSync(path, "utf8"), context, { filename: path });
} catch (error) {
    console.error(`check-bundle: the bundle fails where module is undefined: ${error}`);
    process.exit(1);
}
const missing = ["init", "enable", "disable"].filter(
    (name) => typeof context[name] !== "function",
);
if (missing.length > 0) {
    console.error(`check-bundle: not a top-level function: ${missing.join(", ")}`);
    process.exit(1);
}
console.log("check-bundle: init, enable and disable are top-level functions, and nothing needs module");
