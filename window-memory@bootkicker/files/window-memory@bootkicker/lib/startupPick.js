// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

// Pure logic for "Pick a window to start at login": a desktop Exec value from the arguments of a process, the choice
// between an application (its desktop file) and the form (a command), and the text that carries the result to the
// settings tab.

// An argument that has any of these (or is empty) is quoted. The set is the one of the Desktop Entry specification for
// Exec: space, tab, newline, " ' \ > < ~ | & ; $ * ? # ( ) and the backtick.
const NEEDS_QUOTES = /[\s"'\\><~|&;$*?#()`]/;

// One argument as a word of a desktop Exec value, which a shell reads back as the same argument. A plain argument stays
// bare. Any other goes between double quotes with a backslash before " ` $ and \. In both a % is written %%, the escape
// of Exec's field codes (so a shell sees %% for it: only a "%" in an argument differs, and Exec is the reader that counts).
function quoteArg(arg) {
    const text = String(arg).replace(/%/g, '%%');
    if (text !== '' && !NEEDS_QUOTES.test(text)) return text;
    return '"' + text.replace(/["`$\\]/g, '\\$&') + '"';
}

// argv: array of strings. The string is a valid value of the Exec key: one quoted word per argument, joined by a space.
function quoteArgs(argv) {
    return (argv || []).map(quoteArg).join(' ');
}

function basename(path) {
    const parts = String(path).split('/');
    return parts[parts.length - 1];
}

function nonEmpty(value) {
    return typeof value === 'string' && value !== '';
}

// info: {desktopFile: string|null, name: string|null, argv: string[]|null}, what the window's application and process
// say, each of them null when it could not be found. An application only when there is a desktop file: the settings tab
// copies that file. Otherwise the form, whose command is the guess from the arguments: empty when there are none, and
// the name is the application's, else the first argument's basename, else empty.
function classify(info) {
    const i = info || {};
    if (nonEmpty(i.desktopFile)) {
        const name = nonEmpty(i.name) ? i.name : basename(i.desktopFile).replace(/\.desktop$/, '');
        return { kind: 'app', desktopFile: i.desktopFile, name: name };
    }
    const argv = Array.isArray(i.argv) ? i.argv : [];
    const first = argv.length > 0 && nonEmpty(argv[0]) ? basename(argv[0]) : '';
    return { kind: 'form', name: nonEmpty(i.name) ? i.name : first, command: quoteArgs(argv) };
}

// The text written to the settings key startup-pick, which the tab parses. The stamp (Date.now() of the pick) makes two
// picks of the same application two different values, so the tab sees each one change the key.
function encodeResult(result, stamp) {
    if (result.kind === 'app') {
        return JSON.stringify({ v: 1, stamp: stamp, kind: 'app', desktopFile: result.desktopFile, name: result.name });
    }
    return JSON.stringify({ v: 1, stamp: stamp, kind: 'form', name: result.name, command: result.command });
}
