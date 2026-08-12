/*
 * Keyboard layout search -- a Cinnamon extension
 *
 * Makes the menu find applications by the KEYS you pressed rather than the
 * characters your active keyboard layout produced. On a Russian layout the
 * word "муыл" is typed on the same physical keys as "vesk", so Vesktop should
 * come up -- but the menu searches text, so it finds nothing.
 *
 * The key mapping is not hardcoded. It is read from the live X keymap, which
 * knows every layout the user actually has enabled, so any pair of layouts
 * works and adding or removing one takes effect immediately.
 *
 * Implementation: the menu applet's own _listApplications() is wrapped. The
 * original runs first and reports what matched as typed; we then scan the same
 * button list for the retyped spellings and append what it missed. Results are
 * therefore genuine ApplicationButtons -- right-click menus, drag to
 * favourites and icon rendering all keep working -- and because the applet
 * sorts by matchIndex, they slot in after every native match instead of
 * being pinned to the bottom of the list.
 *
 * Copyright (C) 2026 S4Y0R4. Licensed under the GPL, version 3 or later.
 */

const Gdk = imports.gi.Gdk;
const AppletManager = imports.ui.appletManager;
const Extension = imports.ui.extension;
const Settings = imports.ui.settings;

const MENU_UUID = 'menu@cinnamon.org';

/* Mirrors of menu@cinnamon.org internals. The applet keeps these module-local,
 * so they cannot be imported -- but they are part of how it ranks results, and
 * our ranks have to live on the same scale. */
const NO_MATCH = 99999;
const MATCH_ADDERS = [
    0,      // ApplicationButton.searchStrings[0]: name
    1000,   // [1]: keywords
    2000,   // [2]: description
    3000,   // [3]: desktop file id
];

/* Retyped hits rank above every native hit (worst case 3000 + offset) and
 * below NO_MATCH, so the applet's own sort interleaves them correctly. */
const LAYOUT_BAND = 10000;

let uuid = null;
let config = null;
let keymapIndex = null;
let keymapWatch = null;      // {keymap, handlerId}
let appletWatchId = null;
let patches = [];            // [{proto, original}]

// ------------------------------------------------------------------ settings

function Config(uuid) {
    this._init(uuid);
}

Config.prototype = {
    _init: function (uuid) {
        this.settings = new Settings.ExtensionSettings(this, uuid);
        this.settings.bind('min-chars', 'minChars');
        this.settings.bind('max-results', 'maxResults');
        this.settings.bind('skip-when-native-matches', 'skipWhenNativeMatches');
        this.settings.bind('match-keywords', 'matchKeywords');
        this.settings.bind('match-description', 'matchDescription');
        this.settings.bind('match-desktop-id', 'matchDesktopId');
    },

    /* Which entries of ApplicationButton.searchStrings we are allowed to look
     * at. The name is always searched -- excluding it would leave nothing
     * recognisable to match against. */
    get searchableFields() {
        return [true, this.matchKeywords, this.matchDescription, this.matchDesktopId];
    },

    destroy: function () {
        this.settings.finalize();
        this.settings = null;
    },
};

// ------------------------------------------------------------- keymap index

/* Walk every hardware keycode and record which character each
 * (keycode, group, level) slot produces. That gives both directions at once:
 * character -> physical key, and physical key -> character in another group. */
function buildKeymapIndex() {
    let keymap = Gdk.Keymap.get_for_display(Gdk.Display.get_default());
    let byKey = new Map();     // "keycode:group:level" -> character
    let byChar = new Map();    // character -> {keycode, group, level}
    let groups = new Set();

    for (let keycode = 8; keycode < 256; keycode++) {
        // Returns [found, keys, keyvals]. GdkKeymapKey carries only
        // keycode/group/level; the keyvals arrive in a parallel array.
        let [found, keys, keyvals] = keymap.get_entries_for_keycode(keycode);
        if (!found || !keys)
            continue;

        for (let i = 0; i < keys.length; i++) {
            let unichar = Gdk.keyval_to_unicode(keyvals[i]);
            if (!unichar)
                continue;

            let ch = String.fromCodePoint(unichar).toLowerCase();
            let slot = `${keycode}:${keys[i].group}:${keys[i].level}`;

            // First writer wins, which keeps the plain character for a slot
            // rather than whatever a later duplicate keycode reports.
            if (!byKey.has(slot))
                byKey.set(slot, ch);
            if (!byChar.has(ch))
                byChar.set(ch, {keycode: keycode, group: keys[i].group, level: keys[i].level});

            groups.add(keys[i].group);
        }
    }

    return {byKey: byKey, byChar: byChar, groups: Array.from(groups).sort((a, b) => a - b)};
}

function getKeymapIndex() {
    if (keymapIndex === null)
        keymapIndex = buildKeymapIndex();
    return keymapIndex;
}

/* Retype `pattern` as though the same physical keys had been pressed with
 * keyboard group `group` active. Characters that are not on the keyboard at
 * all (digits shared across groups, punctuation, emoji) pass through. */
function translateToGroup(pattern, group) {
    let index = getKeymapIndex();
    let out = '';
    for (let ch of pattern) {
        let slot = index.byChar.get(ch);
        let translated = slot ? index.byKey.get(`${slot.keycode}:${group}:${slot.level}`) : null;
        out += (translated != null) ? translated : ch;
    }
    return out;
}

/* Every distinct reading of the pressed keys in another layout. Groups that
 * duplicate each other (X pads the group list out) collapse here, and the
 * pattern as literally typed is dropped -- the menu just searched for it. */
function layoutVariants(pattern) {
    let seen = new Set([pattern]);
    let variants = [];
    for (let group of getKeymapIndex().groups) {
        let candidate = translateToGroup(pattern, group);
        if (seen.has(candidate))
            continue;
        seen.add(candidate);
        variants.push(candidate);
    }
    return variants;
}

// ----------------------------------------------------------------- matching

/* Application buttons that match the pattern once retyped into another
 * layout, excluding those the menu already matched as typed. Ranks are
 * assigned in place, the way the applet does it. */
function layoutMatches(applet, pattern, nativeMatches) {
    if (!pattern || pattern.length < config.minChars)
        return [];
    if (config.skipWhenNativeMatches && nativeMatches.length > 0)
        return [];

    let variants = layoutVariants(pattern)
        .filter(variant => variant.length >= config.minChars);
    if (variants.length === 0)
        return [];

    let fields = config.searchableFields;
    let matches = [];

    for (let button of applet._applicationsButtons) {
        // The original pass ranked everything it matched and set the rest to
        // NO_MATCH, so this both skips native hits and avoids duplicates.
        if (button.matchIndex !== NO_MATCH)
            continue;

        let best = -1;
        for (let variant of variants) {
            for (let i = 0; i < button.searchStrings.length; i++) {
                if (!fields[i])
                    continue;
                let at = button.searchStrings[i].indexOf(variant);
                if (at < 0)
                    continue;
                let rank = LAYOUT_BAND + at + MATCH_ADDERS[i];
                if (best < 0 || rank < best)
                    best = rank;
            }
        }

        if (best >= 0) {
            button.matchIndex = best;
            matches.push(button);
        }
    }

    matches.sort((a, b) => a.matchIndex - b.matchIndex);

    if (matches.length > config.maxResults) {
        // Anything trimmed has to go back to NO_MATCH: the button objects are
        // reused across searches, and a stale rank would resurrect them.
        for (let button of matches.slice(config.maxResults))
            button.matchIndex = NO_MATCH;
        matches = matches.slice(0, config.maxResults);
    }

    return matches;
}

// -------------------------------------------------------------- menu patches

function patchApplet(applet) {
    // Patching the prototype rather than the instance covers every panel the
    // user has a menu on, including ones added later.
    let proto = Object.getPrototypeOf(applet);
    if (!proto || typeof proto._listApplications !== 'function')
        return;
    if (patches.some(patch => patch.proto === proto))
        return;

    let original = proto._listApplications;

    proto._listApplications = function (pattern) {
        let buttons = original.call(this, pattern);
        try {
            return buttons.concat(layoutMatches(this, pattern, buttons));
        } catch (e) {
            // A broken search is worse than a search that only finds the
            // native spelling, so fall back instead of throwing.
            global.logError(`[keylayout-search] ${e}`);
            return buttons;
        }
    };

    patches.push({proto: proto, original: original});
}

function patchRunningMenus() {
    let applets = AppletManager.getRunningInstancesForUuid(MENU_UUID);

    // Reloading the menu applet replaces its class, so a patch recorded against
    // a prototype nothing runs on any more is dead weight. Only prune when at
    // least one menu is running, otherwise a reload caught mid-flight would
    // discard the record of a patch that is still installed.
    let live = applets.map(applet => Object.getPrototypeOf(applet));
    if (live.length > 0)
        patches = patches.filter(patch => live.indexOf(patch.proto) > -1);

    for (let applet of applets)
        patchApplet(applet);
}

function unpatchAll() {
    for (let patch of patches)
        patch.proto._listApplications = patch.original;
    patches = [];
}

function watchKeymap() {
    let keymap = Gdk.Keymap.get_for_display(Gdk.Display.get_default());
    keymapWatch = {
        keymap: keymap,
        handlerId: keymap.connect('keys-changed', () => { keymapIndex = null; }),
    };
}

function unwatchKeymap() {
    if (keymapWatch) {
        keymapWatch.keymap.disconnect(keymapWatch.handlerId);
        keymapWatch = null;
    }
    keymapIndex = null;
}

// ---------------------------------------------------------------- lifecycle

function init(metadata) {
    uuid = metadata.uuid;
}

function enable() {
    // Built here rather than in init() so that every enable() starts from a
    // settings object that disable() has not already finalized.
    config = new Config(uuid);
    watchKeymap();
    patchRunningMenus();

    // The menu applet can load after us, and reloading it (a panel edit, an
    // applet update) replaces its class, so the old prototype patch is gone.
    appletWatchId = Extension.Type.APPLET.connect('extension-loaded', (type, uuid) => {
        if (uuid === MENU_UUID)
            patchRunningMenus();
    });
}

function disable() {
    if (appletWatchId !== null) {
        Extension.Type.APPLET.disconnect(appletWatchId);
        appletWatchId = null;
    }
    unpatchAll();
    unwatchKeymap();

    if (config) {
        config.destroy();
        config = null;
    }
}
