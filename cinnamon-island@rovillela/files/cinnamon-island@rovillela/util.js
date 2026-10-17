const { Clutter, Gio, GLib } = imports.gi;
const Gettext = imports.gettext;

const UUID = 'cinnamon-island@rovillela';

// Translations of a language the person picked in the settings: English text
// -> translated text. Null while the island follows the system language, in
// which case gettext does the work.
let forced = null;
// What `forced` holds: 'system' or the language code it was loaded for.
let loaded = 'system';
// Language in use, in the format JavaScript understands ("pt-BR", "en").
let locale = 'en';

function getLocale() {
    return locale;
}

// Where the compiled translations live: next to the system ones when the
// extension is installed system-wide, in the home folder otherwise (which is
// where Cinnamon puts them when it installs a spice).
function bindTranslations(extensionDir) {
    Gettext.bindtextdomain(UUID, extensionDir.startsWith('/usr/')
        ? '/usr/share/locale' : GLib.get_home_dir() + '/.local/share/locale');
}

function unquote(text) {
    return text.replace(/\\(.)/g, (match, c) => c === 'n' ? '\n' : c);
}

// Reads a simple .po file (msgid/msgstr, with continuation lines).
function parsePo(text) {
    let entries = {};
    let id = null, str = null, target = null;
    let flush = () => {
        if (id && str)
            entries[id] = str;
        id = str = target = null;
    };
    for (let line of text.split('\n')) {
        let match;
        if ((match = line.match(/^msgid "(.*)"\s*$/))) {
            flush();
            id = unquote(match[1]);
            target = 'id';
        } else if ((match = line.match(/^msgstr "(.*)"\s*$/))) {
            str = unquote(match[1]);
            target = 'str';
        } else if ((match = line.match(/^"(.*)"\s*$/))) {
            if (target === 'id')
                id += unquote(match[1]);
            else if (target === 'str')
                str += unquote(match[1]);
        }
    }
    flush();
    return entries;
}

// Picks the language of the island's texts.
//
// 'system' follows the system language through gettext, like any Cinnamon
// spice; a language without a translation falls back to English, which is the
// text in the code.
//
// Any other value is a language the person picked in the settings. gettext
// only knows the system language, so in that case the .po file is read and
// used directly. The read is asynchronous: `changed` is called when the texts
// are ready, and the caller rebuilds what it had already drawn.
function setLanguage(dir, language, changed) {
    language = language || 'system';
    if (language === loaded)
        return;
    loaded = language;
    if (language === 'system') {
        forced = null;
        // The header of the loaded catalog says which language gettext found.
        let match = /^Language: *([A-Za-z_]+)/m.exec(Gettext.dgettext(UUID, ''));
        locale = match ? match[1].replace('_', '-') : 'en';
        return;
    }
    // Until the file is read (and if it cannot be), the texts are in English.
    forced = {};
    locale = 'en';
    if (language === 'en')
        return;
    Gio.File.new_for_path(dir + '/po/' + language + '.po').load_contents_async(null, (file, result) => {
        try {
            let [ok, bytes] = file.load_contents_finish(result);
            if (!ok || loaded !== language)
                return;
            forced = parsePo(imports.byteArray.toString(bytes));
            locale = language.replace('_', '-');
            changed();
        } catch (e) {
            // No such translation: English stays.
        }
    });
}

function _(str) {
    if (forced)
        return forced[str] || str;
    return Gettext.dgettext(UUID, str);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

// Direction of a mouse scroll: +1 for down or right, -1 for up or left, 0 for
// the rest ("smooth" scrolling comes with a regular event too, so it can be
// ignored).
function scrollStep(event) {
    switch (event.get_scroll_direction()) {
    case Clutter.ScrollDirection.DOWN:
    case Clutter.ScrollDirection.RIGHT:
        return 1;
    case Clutter.ScrollDirection.UP:
    case Clutter.ScrollDirection.LEFT:
        return -1;
    default:
        return 0;
    }
}

// The four detail colours of the island. They are used sparingly and always
// with meaning: blue is sound (and rain), green is microphone and "active",
// yellow is application, timer and sun, rose is mute and alert.
const COLORS = {
    green: [105, 215, 149],
    amber: [242, 208, 107],
    rose: [232, 169, 154],
    blue: [111, 176, 242],
};

function css(color, alpha = 1) {
    return 'rgba(' + color.join(', ') + ', ' + alpha + ')';
}

// A coloured dot, to mark the active item of a list.
function makeDot(color) {
    const { Clutter, St } = imports.gi;
    return new St.Widget({
        style_class: 'island-dot',
        style: 'background-color: ' + css(color) + ';',
        y_align: Clutter.ActorAlign.CENTER,
    });
}

const ROLL_DISTANCE = 26;
const ROLL_MS = 300;

function resetRoll(actor) {
    actor.remove_all_transitions();
    actor.set_pivot_point(0.5, 0.5);
    actor.translation_y = 0;
    actor.scale_x = actor.scale_y = 1;
    actor.opacity = 255;
}

// Swaps one content for another by "rolling", like a wheel: the old one goes
// up (or down) and disappears, the new one comes from the other side.
// `direction` is +1 when moving forward (wheel down) and -1 when going back.
// `animate` false swaps instantly.
function rollSwitch(oldActor, newActor, direction, animate, onDone = null) {
    const { Clutter } = imports.gi;
    resetRoll(newActor);
    newActor.visible = true;
    if (!animate || !oldActor || oldActor === newActor) {
        if (oldActor && oldActor !== newActor) {
            resetRoll(oldActor);
            oldActor.visible = false;
        }
        if (onDone)
            onDone();
        return;
    }
    resetRoll(oldActor);
    oldActor.ease({
        opacity: 0,
        translation_y: -direction * ROLL_DISTANCE,
        scale_x: 0.94,
        scale_y: 0.94,
        duration: ROLL_MS * 0.7,
        mode: Clutter.AnimationMode.EASE_IN_QUAD,
        onComplete: () => {
            oldActor.visible = false;
            resetRoll(oldActor);
        },
    });
    newActor.opacity = 0;
    newActor.translation_y = direction * ROLL_DISTANCE;
    newActor.scale_x = newActor.scale_y = 0.94;
    newActor.ease({
        opacity: 255,
        translation_y: 0,
        scale_x: 1,
        scale_y: 1,
        duration: ROLL_MS,
        mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        onComplete: () => {
            if (onDone)
                onDone();
        },
    });
}

module.exports = { UUID, _, lerp, bindTranslations, setLanguage, getLocale, scrollStep, COLORS, css, makeDot, rollSwitch, resetRoll };
