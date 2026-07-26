const { St, GLib, Gio, Clutter, Pango } = imports.gi;
const Main = imports.ui.main;
const Settings = imports.ui.settings;
const Gettext = imports.gettext;

let ext  = null;
let uuid = null;

function _(str) {
    return Gettext.dgettext(uuid, str);
}

function TrackNotify(metadata) {
    this._init(metadata);
}

TrackNotify.prototype = {

    _init: function (metadata) {
        this.uuid = metadata.uuid;
        this.settings = new Settings.ExtensionSettings(this, this.uuid);

        const keys = [
            ["duration",      "duration"],
            ["fade-time",     "fadeTime"],
            ["debounce",      "debounceMs"],
            ["bg-color",      "bgColor"],
            ["bg-opacity",    "bgOpacity"],
            ["text-color",    "textColor"],
            ["font-size",     "fontSize"],
            ["header-text",   "headerText"],
            ["hover-opacity", "hoverOpacity"],
            ["show-cover",    "showCover"],
            ["cover-size",    "coverSize"],
            ["position",      "position"],
            ["margin",        "margin"],
            ["max-width",     "maxWidth"],
        ];
        for (const [key, prop] of keys)
            this.settings.bind(key, prop, () => this._onSettingsChanged());

        this._sub         = null;
        this._debounce    = null;
        this._holdTimer   = null;
        this._fadeTimer   = null;
        this._pointerTimer = null;

        this._lastKey    = null;
        this._pending    = null;
        this._state      = "hidden";   // hidden | in | shown | out
        this._coverSeq   = 0;
        this._coverStyle = "";
        this._coverFiles = [];
    },

    _build: function () {
        this._box = new St.BoxLayout({
            vertical: false,
            reactive: false,
            track_hover: false,
            can_focus: false,
        });

        this._cover = new St.Bin({ reactive: false });

        this._textBox = new St.BoxLayout({
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: false,
        });

        this._head = new St.Label({ text: "", reactive: false });
        this._body = new St.Label({ text: "", reactive: false });
        this._body.clutter_text.ellipsize = Pango.EllipsizeMode.END;

        this._textBox.add_actor(this._head);
        this._textBox.add_actor(this._body);

        this._box.add_actor(this._cover);
        this._box.add_actor(this._textBox);

        this._box.opacity = 0;
        this._box.hide();

        Main.layoutManager.addChrome(this._box, {
            visibleInFullscreen: true,
            affectsInputRegion: false,
            affectsStruts: false,
        });

        this._applyStyle();
    },

    _rgba: function (rgbString, percent) {
        const m = /(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(rgbString || "");
        const [r, g, b] = m ? [m[1], m[2], m[3]] : [0, 0, 0];
        return `rgba(${r},${g},${b},${(percent / 100).toFixed(2)})`;
    },

    _applyStyle: function () {
        if (!this._box) return;

        this._box.style =
            `background-color: ${this._rgba(this.bgColor, this.bgOpacity)};` +
            `border-radius: 12px; padding: 12px 18px 12px 12px;`;

        this._textBox.style = "spacing: 2px;";

        this._head.text = this.headerText || "";
        this._head.visible = !!this.headerText;
        this._head.style =
            `color: ${this.textColor}; font-size: ${Math.round(this.fontSize * 0.85)}px;`;
        this._head.opacity = 190;

        this._body.style =
            `color: ${this.textColor}; font-size: ${this.fontSize}px;` +
            `font-weight: bold; max-width: ${Math.round(this.maxWidth)}px;`;

        if (this.showCover) {
            this._cover.show();
            this._cover.set_size(this.coverSize, this.coverSize);
            this._cover.style =
                (this._coverStyle || "") +
                `border-radius: 6px; margin-right: 12px;` +
                `background-size: cover; background-position: center;` +
                `background-color: rgba(255,255,255,0.12);`;
        } else {
            this._cover.hide();
        }
    },

    _onSettingsChanged: function () {
        this._applyStyle();
        if (this._state !== "hidden") this._place();
    },

    _place: function () {
        const mon = Main.layoutManager.primaryMonitor;
        const [, w] = this._box.get_preferred_width(-1);
        const [, h] = this._box.get_preferred_height(w);
        const m = this.margin;

        const x = this.position.endsWith("center")
            ? mon.x + Math.round((mon.width - w) / 2)
            : this.position.endsWith("right")
                ? mon.x + mon.width - w - m
                : mon.x + m;
        const y = this.position.startsWith("bottom")
            ? mon.y + mon.height - h - m
            : mon.y + m;

        this._box.set_position(Math.round(x), Math.round(y));
    },

    _setCover: function (artUrl) {
        this._coverStyle = "";

        if (!this.showCover || !artUrl) {
            this._applyStyle();
            return;
        }

        if (artUrl.startsWith("file://")) {
            try {
                const [path] = GLib.filename_from_uri(artUrl);
                this._coverStyle = `background-image: url("${path}");`;
            } catch (e) {}
            this._applyStyle();
            return;
        }

        if (artUrl.startsWith("http")) {
            const seq  = ++this._coverSeq;
            const dest = GLib.build_filenamev([
                GLib.get_tmp_dir(), `track-notify-cover-${seq}`
            ]);
            Gio.File.new_for_uri(artUrl).load_contents_async(null, (f, res) => {
                try {
                    const [ok, data] = f.load_contents_finish(res);
                    if (!ok || seq !== this._coverSeq) return;
                    GLib.file_set_contents(dest, data);
                    this._coverFiles.push(dest);
                    this._coverStyle = `background-image: url("${dest}");`;
                    this._applyStyle();
                    if (this._state !== "hidden") this._place();
                } catch (e) {}
            });
            return;
        }

        this._applyStyle();
    },

    _cleanupCovers: function () {
        for (const p of this._coverFiles) {
            try { GLib.unlink(p); } catch (e) {}
        }
        this._coverFiles = [];
    },

    _clearTimer: function (name) {
        if (this[name] !== null && this[name] !== undefined) {
            GLib.source_remove(this[name]);
            this[name] = null;
        }
    },

    _fadeTo: function (opacity, duration) {
        this._box.save_easing_state();
        this._box.set_easing_duration(duration);
        this._box.set_easing_mode(Clutter.AnimationMode.EASE_OUT_QUAD);
        this._box.opacity = opacity;
        this._box.restore_easing_state();
    },

    _show: function (artist, title) {
        this._clearTimer("_holdTimer");
        this._clearTimer("_fadeTimer");

        this._body.text = artist ? `${artist} — ${title}` : title;
        this._place();

        const fade = Math.round(this.fadeTime);

        if (this._state === "hidden") {
            this._box.opacity = 0;
            this._box.show();
        }

        this._state = "in";
        this._fadeTo(255, fade);
        this._startPointerWatch();

        this._fadeTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, fade, () => {
            this._fadeTimer = null;
            this._state = "shown";

            this._holdTimer = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                Math.round(this.duration * 1000),
                () => {
                    this._holdTimer = null;
                    this._hide();
                    return GLib.SOURCE_REMOVE;
                }
            );
            return GLib.SOURCE_REMOVE;
        });
    },

    _hide: function () {
        const fade = Math.round(this.fadeTime);
        this._state = "out";
        this._fadeTo(0, fade);

        this._clearTimer("_fadeTimer");
        this._fadeTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, fade, () => {
            this._fadeTimer = null;
            if (this._box) this._box.hide();
            this._state = "hidden";
            this._stopPointerWatch();
            return GLib.SOURCE_REMOVE;
        });
    },

    _startPointerWatch: function () {
        if (this._pointerTimer !== null) return;

        this._pointerTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
            if (this._state !== "shown") return GLib.SOURCE_CONTINUE;

            const [px, py] = global.get_pointer();
            const [bx, by] = this._box.get_transformed_position();
            const [bw, bh] = this._box.get_size();
            const inside = px >= bx && px <= bx + bw && py >= by && py <= by + bh;

            const target = inside
                ? Math.round(255 * this.hoverOpacity / 100)
                : 255;

            if (Math.abs(this._box.opacity - target) > 2)
                this._fadeTo(target, 200);

            return GLib.SOURCE_CONTINUE;
        });
    },

    _stopPointerWatch: function () {
        this._clearTimer("_pointerTimer");
    },

    previewNotification: function () {
        if (!this._box) this._build();
        this._setCover(null);
        this._show(_("Test artist"), _("Test track title"));
    },

    _handleMetadata: function (meta) {
        const title = meta["xesam:title"] ?? "";
        if (!title) return;   // signal without a title = end of track, ignore

        const artist  = (meta["xesam:artist"] ?? []).join(", ");
        const trackId = meta["mpris:trackid"] ?? "";
        const artUrl  = meta["mpris:artUrl"] ?? null;
        const key     = `${trackId}::${artist}::${title}`;

        this._pending = { key, title, artist, artUrl };

        this._clearTimer("_debounce");
        this._debounce = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            Math.round(this.debounceMs),
            () => {
                this._debounce = null;
                const p = this._pending;
                if (!p || p.key === this._lastKey) return GLib.SOURCE_REMOVE;

                this._lastKey = p.key;
                this._setCover(p.artUrl);
                this._show(p.artist, p.title);
                return GLib.SOURCE_REMOVE;
            }
        );
    },

    enable: function () {
        this._build();

        this._sub = Gio.DBus.session.signal_subscribe(
            null,
            "org.freedesktop.DBus.Properties",
            "PropertiesChanged",
            "/org/mpris/MediaPlayer2",
            null,
            Gio.DBusSignalFlags.NONE,
            (conn, sender, path, iface, signal, params) => {
                let changed, invalidated;
                try {
                    changed     = params.get_child_value(1).recursiveUnpack();
                    invalidated = params.get_child_value(2).deep_unpack();
                } catch (e) { return; }

                if (changed.Metadata) {
                    this._handleMetadata(changed.Metadata);
                    return;
                }

                // Some players, on Next/Previous (including via hotkeys), don't include
                // Metadata in the signal itself, only mark it as invalidated — in that
                // case the current value needs to be requested via a separate Get call.
                if (invalidated && invalidated.includes("Metadata")) {
                    conn.call(
                        sender, path, "org.freedesktop.DBus.Properties", "Get",
                        new GLib.Variant("(ss)", ["org.mpris.MediaPlayer2.Player", "Metadata"]),
                        null, Gio.DBusCallFlags.NONE, -1, null,
                        (c, res) => {
                            try {
                                const reply = c.call_finish(res);
                                const meta  = reply.get_child_value(0).get_variant().recursiveUnpack();
                                this._handleMetadata(meta);
                            } catch (e) {}
                        }
                    );
                }
            }
        );
    },

    disable: function () {
        for (const t of ["_debounce", "_holdTimer", "_fadeTimer", "_pointerTimer"])
            this._clearTimer(t);

        if (this._sub !== null) {
            Gio.DBus.session.signal_unsubscribe(this._sub);
            this._sub = null;
        }

        if (this._box) {
            Main.layoutManager.removeChrome(this._box);
            this._box.destroy();
            this._box = null;
        }

        this._cleanupCovers();
        this.settings.finalize();

        this._lastKey = null;
        this._pending = null;
        this._state   = "hidden";
    },
};

function init(metadata) {
    uuid = metadata.uuid;
    Gettext.bindtextdomain(uuid, GLib.get_home_dir() + "/.local/share/locale");
    ext = new TrackNotify(metadata);
}
function disable()      { ext.disable(); }

function enable() {
    ext.enable();
    // Cinnamon calls button callbacks from settings-schema.json via the object
    // returned by enable() — the regular this._box is not accessible here
    return { previewNotification: () => ext.previewNotification() };
}
