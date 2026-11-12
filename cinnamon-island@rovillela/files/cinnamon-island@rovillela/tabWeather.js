const { Clutter, GLib, Pango, St } = imports.gi;
const { _, COLORS, css, makeDot, scrollStep } = require('./util');

// The Weather tab shows only the forecast; events live in the Agenda tab.

// Open-Meteo weather codes (WMO standard) -> [icon, description].
function describe(code, isDay) {
    if (code === 0)
        return [isDay ? 'weather-clear-symbolic' : 'weather-clear-night-symbolic', _("Clear sky")];
    if (code <= 2)
        return [isDay ? 'weather-few-clouds-symbolic' : 'weather-few-clouds-night-symbolic', _("Partly cloudy")];
    if (code === 3)
        return ['weather-overcast-symbolic', _("Cloudy")];
    if (code <= 48)
        return ['weather-fog-symbolic', _("Fog")];
    if (code <= 57)
        return ['weather-showers-scattered-symbolic', _("Drizzle")];
    if (code <= 67)
        return ['weather-showers-symbolic', _("Rain")];
    if (code <= 77)
        return ['weather-snow-symbolic', _("Snow")];
    if (code <= 82)
        return ['weather-showers-symbolic', _("Showers")];
    if (code <= 86)
        return ['weather-snow-symbolic', _("Snow")];
    return ['weather-storm-symbolic', _("Thunderstorm")];
}

// Icon colour according to the weather: light yellow sun, light blue rain; the
// rest (clouds, fog, snow) stays uncoloured.
function weatherStyle(code, isDay) {
    if (code <= 2)
        return isDay ? 'color: ' + css(COLORS.amber) + ';' : null;
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95)
        return 'color: ' + css(COLORS.blue) + ';';
    return null;
}

const SEARCH_DELAY_MS = 400;

class WeatherTab {
    // `editing` receives { begin(), end() }, as in the Pomodoro and Notes
    // tabs. `openSite(latitude, longitude)` opens the forecast in the browser.
    constructor(engine, editing, openSite) {
        this._openSite = openSite;
        this._placesKey = '';
        this._engine = engine;
        this._editing = editing;
        this._state = null;
        this._searchMode = false;
        this._isEditing = false;
        this._searchTimer = 0;

        this.actor = new St.BoxLayout({ style_class: 'island-weather-tab', x_expand: true, y_expand: true });

        // On the left, the saved cities, one per row (like the outputs in the
        // Volume tab): clicking switches, right-click removes from the list,
        // the wheel moves from one to the next and the "+" searches for
        // another.
        this._citiesColumn = new St.BoxLayout({
            style_class: 'island-outputs-column island-wheel',
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            track_hover: true,
        });
        this._citiesColumn.add_child(new St.Label({ style_class: 'island-column-title', text: _("Cities") }));
        this._cities = new St.BoxLayout({ style_class: 'island-outputs-list', vertical: true });
        this._citiesColumn.add_child(this._cities);
        this._divider = new St.Widget({ style_class: 'island-dash' });
        this._citiesColumn.connect('scroll-event', (actor, event) => {
            let state = this._state;
            let step = scrollStep(event);
            if (!state || !step || state.places.length < 2)
                return Clutter.EVENT_PROPAGATE;
            let index = (state.selected + step + state.places.length) % state.places.length;
            engine.call('Weather', 'ChoosePlace', new GLib.Variant('(u)', [index]));
            return Clutter.EVENT_STOP;
        });
        this.actor.add_child(this._citiesColumn);
        this.actor.add_child(this._divider);

        this._body = new St.BoxLayout({ style_class: 'island-weather', x_expand: true, y_expand: true });
        this.actor.add_child(this._body);

        // Spacers that centre the forecast (they go away during the search).
        this._padStart = new St.Widget({ x_expand: true });
        this._padEnd = new St.Widget({ x_expand: true });
        this._body.add_child(this._padStart);

        // Now: icon, temperature, city and description. Clicking here opens
        // the full forecast in the browser.
        this._now = new St.BoxLayout({
            style_class: 'island-weather-now',
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            track_hover: true,
        });
        this._now.connect('button-release-event', () => {
            let weather = this._state && this._state.weather;
            if (weather && !weather.error)
                this._openSite(weather.latitude, weather.longitude);
            return Clutter.EVENT_STOP;
        });
        this._icon = new St.Icon({ icon_size: 58, y_align: Clutter.ActorAlign.CENTER });
        let nowText = new St.BoxLayout({ vertical: true, y_align: Clutter.ActorAlign.CENTER });
        this._temperature = new St.Label({ style_class: 'island-clock-large' });
        this._city = new St.Label({ style_class: 'island-weather-city' });
        this._description = new St.Label({ style_class: 'island-weather-description' });
        nowText.add_child(this._temperature);
        nowText.add_child(this._city);
        nowText.add_child(this._description);
        this._now.add_child(this._icon);
        this._now.add_child(nowText);
        this._body.add_child(this._now);

        // Coming days.
        this._days = new St.BoxLayout({ style_class: 'island-weather-days', y_align: Clutter.ActorAlign.CENTER });
        this._body.add_child(this._days);

        this._weatherHint = new St.Label({ style_class: 'island-empty', y_align: Clutter.ActorAlign.CENTER });
        this._weatherHint.clutter_text.line_wrap = true;
        this._weatherHint.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this._body.add_child(this._weatherHint);
        this._body.add_child(this._padEnd);

        // City search: field on the left, results on the right.
        this._search = new St.BoxLayout({ style_class: 'island-weather-search', x_expand: true, y_align: Clutter.ActorAlign.CENTER });
        let searchLeft = new St.BoxLayout({ vertical: true, style_class: 'island-weather-search-field', y_align: Clutter.ActorAlign.CENTER });
        this._entry = new St.Entry({
            style_class: 'island-task',
            hint_text: _("Search for a city…"),
            can_focus: true,
        });
        this._entry.connect('captured-event', (actor, event) => {
            if (event.type() === Clutter.EventType.BUTTON_PRESS)
                this._beginEdit();
            return Clutter.EVENT_PROPAGATE;
        });
        this._entry.clutter_text.connect('key-press-event', (actor, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Escape) {
                this._setSearchMode(false);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this._entry.clutter_text.connect('activate', () => this._pick(0));
        this._entry.clutter_text.connect('text-changed', () => this._queueSearch());
        this._searchStatus = new St.Label({ style_class: 'island-time' });
        searchLeft.add_child(this._entry);
        searchLeft.add_child(this._searchStatus);
        this._search.add_child(searchLeft);
        this._matches = new St.BoxLayout({
            vertical: true,
            style_class: 'island-clipboard-list',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._search.add_child(this._matches);
        this._body.add_child(this._search);

        this.update(null);
    }

    _setSearchMode(on) {
        if (!on)
            this._endEdit();
        this._searchMode = on;
        if (on) {
            this._entry.set_text('');
            this._engine.call('Weather', 'Search', new GLib.Variant('(s)', ['']));
        }
        this.update(this._state);
        if (on)
            this._beginEdit();
    }

    // One pill per saved city and, if one more still fits, the "+".
    _updateCities(state, searching) {
        let places = state ? state.places : [];
        this._citiesColumn.visible = this._divider.visible = places.length > 0 && !searching;
        let key = JSON.stringify([places, state && state.max_places]);
        if (key !== this._placesKey) {
            this._placesKey = key;
            this._cities.destroy_all_children();
            places.forEach((place, i) => {
                let box = new St.BoxLayout({ style_class: 'island-output-box' });
                let dot = makeDot(COLORS.green);
                box.add_child(dot);
                let label = new St.Label({ text: place.name, y_align: Clutter.ActorAlign.CENTER });
                label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
                box.add_child(label);
                let button = new St.Button({
                    style_class: 'island-output-row',
                    child: box,
                    x_align: St.Align.START,
                    button_mask: St.ButtonMask.ONE | St.ButtonMask.THREE,
                });
                button.set_x_align(Clutter.ActorAlign.FILL);
                button._index = i;
                button._dot = dot;
                button.connect('clicked', (actor, mouseButton) => this._engine.call('Weather',
                    mouseButton === 3 ? 'RemovePlace' : 'ChoosePlace', new GLib.Variant('(u)', [i])));
                this._cities.add_child(button);
            });
            if (places.length < (state ? state.max_places : 0)) {
                let addBox = new St.BoxLayout({ style_class: 'island-output-box' });
                addBox.add_child(new St.Icon({ icon_name: 'list-add-symbolic', icon_size: 12 }));
                addBox.add_child(new St.Label({ text: _("Add city"), y_align: Clutter.ActorAlign.CENTER }));
                let add = new St.Button({ style_class: 'island-output-row', child: addBox, x_align: St.Align.START });
                add.set_x_align(Clutter.ActorAlign.FILL);
                add.connect('clicked', () => this._setSearchMode(true));
                this._cities.add_child(add);
            }
        }
        for (let button of this._cities.get_children()) {
            if (button._dot)
                button._dot.opacity = state && button._index === state.selected ? 255 : 0;
            if (state && button._index === state.selected)
                button.add_style_pseudo_class('checked');
            else
                button.remove_style_pseudo_class('checked');
        }
    }

    _beginEdit() {
        if (this._isEditing || !this._editing.begin(() => this._endEdit()))
            return;
        this._isEditing = true;
        this._entry.grab_key_focus();
    }

    _endEdit() {
        if (!this._isEditing)
            return;
        this._isEditing = false;
        this._editing.end();
    }

    _queueSearch() {
        if (this._searchTimer)
            GLib.source_remove(this._searchTimer);
        this._searchTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SEARCH_DELAY_MS, () => {
            this._searchTimer = 0;
            if (this._searchMode)
                this._engine.call('Weather', 'Search', new GLib.Variant('(s)', [this._entry.get_text()]));
            return GLib.SOURCE_REMOVE;
        });
    }

    _pick(index) {
        if (!this._state || index >= this._state.matches.length)
            return;
        this._engine.call('Weather', 'SelectPlace', new GLib.Variant('(u)', [index]));
        this._setSearchMode(false);
    }

    update(state) {
        this._state = state;
        let weather = state && state.weather;
        let ok = !!(weather && !weather.error);
        // With no city chosen, the tab opens straight on the search.
        let searching = !!state && (this._searchMode || !state.place_set);
        this._updateCities(state, searching);

        this._now.visible = ok && !searching;
        this._days.visible = ok && !searching;
        this._search.visible = searching;
        this._padStart.visible = this._padEnd.visible = !searching;
        this._weatherHint.visible = !ok && !searching;
        if (!state)
            this._weatherHint.text = _("The Cinnamon Island engine is not running");
        else if (!weather)
            this._weatherHint.text = _("Loading the forecast…");
        else if (weather.error)
            this._weatherHint.text = _("Couldn't load the forecast");

        if (searching) {
            this._matches.destroy_all_children();
            state.matches.forEach((match, i) => {
                let parts = [match.name, match.region, match.country].filter(p => p);
                let label = new St.Label({ text: parts.join(', ') });
                label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
                let row = new St.Button({ style_class: 'island-clipboard-item', child: label, x_expand: true, x_align: St.Align.START });
                row.set_x_align(Clutter.ActorAlign.FILL);
                row.connect('clicked', () => this._pick(i));
                this._matches.add_child(row);
            });
            let typed = this._entry.get_text().trim().length >= 2;
            if (state.searching)
                this._searchStatus.text = _("Searching…");
            else if (typed && state.matches.length === 0)
                this._searchStatus.text = _("No city found");
            else
                this._searchStatus.text = _("Type the name and pick from the list");
        }

        if (ok && !searching) {
            let [icon, text] = describe(weather.code, weather.is_day);
            this._icon.icon_name = icon;
            this._icon.set_style(weatherStyle(weather.code, weather.is_day));
            this._temperature.text = weather.temperature + '°';
            this._city.text = weather.city;
            this._description.text = text;

            this._days.destroy_all_children();
            weather.days.forEach((day, i) => {
                let box = new St.BoxLayout({ vertical: true, style_class: 'island-weather-day' });
                let date = new Date(day.date + 'T12:00:00');
                let name = i === 0 ? _("Today")
                    : [_("Sun"), _("Mon"), _("Tue"), _("Wed"), _("Thu"), _("Fri"), _("Sat")][date.getDay()];
                box.add_child(new St.Label({ style_class: 'island-weather-day-name', text: name, x_align: Clutter.ActorAlign.CENTER }));
                box.add_child(new St.Icon({
                    icon_name: describe(day.code, true)[0],
                    icon_size: 28,
                    style: weatherStyle(day.code, true),
                    x_align: Clutter.ActorAlign.CENTER,
                }));
                // High in white, low in grey.
                let range = new St.BoxLayout({ style_class: 'island-weather-band', x_align: Clutter.ActorAlign.CENTER });
                range.add_child(new St.Label({ text: day.max + '°' }));
                range.add_child(new St.Label({ style_class: 'island-weather-low', text: day.min + '°' }));
                box.add_child(range);
                this._days.add_child(box);
            });
        }
    }

    destroy() {
        if (this._searchTimer)
            GLib.source_remove(this._searchTimer);
        this._searchTimer = 0;
    }
}

module.exports = { WeatherTab };
