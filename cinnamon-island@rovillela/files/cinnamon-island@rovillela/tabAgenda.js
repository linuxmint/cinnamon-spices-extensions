const { Clutter, Pango, St } = imports.gi;
const { _, COLORS, css, makeDot, getLocale } = require('./util');

function pad(n) {
    return (n < 10 ? '0' : '') + n;
}

function sameDay(a, b) {
    return a.toDateString() === b.toDateString();
}

// When the event is, in two parts: the day ("Today", "Tomorrow", "Mon 10/12")
// and the time ("14:00" or "all day").
function formatWhen(event) {
    let start = new Date(event.start);
    let today = new Date();
    let tomorrow = new Date(today.getTime() + 86400000);
    let day;
    if (sameDay(start, today) || start < today)
        day = _("Today");
    else if (sameDay(start, tomorrow))
        day = _("Tomorrow");
    else
        day = [_("Sun"), _("Mon"), _("Tue"), _("Wed"), _("Thu"), _("Fri"), _("Sat")][start.getDay()] +
            ' ' + pad(start.getDate()) + '/' + pad(start.getMonth() + 1);
    let time = event.all_day ? _("all day") : pad(start.getHours()) + ':' + pad(start.getMinutes());
    return [day, time];
}

// Upcoming calendar events (read by the engine from an iCal link). On the
// left, the current month; on the right, one event per row.
class AgendaTab {
    // `onOpen` opens the person's calendar (click on the month or on an
    // event).
    constructor(onOpen) {
        this._onOpen = onOpen;
        this.actor = new St.BoxLayout({ style_class: 'island-agenda-tab', x_expand: true, y_expand: true });

        // On the left, the month: today highlighted and a mark on days with
        // events.
        this._month = new St.BoxLayout({
            vertical: true,
            style_class: 'island-month',
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            track_hover: true,
        });
        this._month.connect('button-release-event', () => {
            this._onOpen();
            return Clutter.EVENT_STOP;
        });
        this._monthTitle = new St.Label({ style_class: 'island-month-title' });
        this._month.add_child(this._monthTitle);
        this._monthGrid = new St.BoxLayout({ vertical: true });
        this._month.add_child(this._monthGrid);
        this._monthKey = '';
        this.actor.add_child(this._month);

        this._list = new St.BoxLayout({
            style_class: 'island-agenda',
            vertical: true,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this._list);

        this.update(null);
    }

    // Builds the current month: a row with the weekday initials and one row
    // per week, starting on Sunday.
    _renderMonth(eventDays) {
        let now = new Date();
        let key = now.toDateString() + '|' + eventDays.join(',') + '|' + getLocale();
        if (key === this._monthKey)
            return;
        this._monthKey = key;

        let locale = getLocale();
        let title = now.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
        this._monthTitle.text = title.charAt(0).toUpperCase() + title.slice(1);

        this._monthGrid.destroy_all_children();
        let cell = (text, styleClass, style = null) => new St.Label({
            text,
            style_class: 'island-month-day ' + styleClass,
            style,
        });
        let header = new St.BoxLayout();
        for (let i = 0; i < 7; i++) {
            // January 4, 2026 is a Sunday.
            let day = new Date(2026, 0, 4 + i).toLocaleDateString(locale, { weekday: 'narrow' });
            header.add_child(cell(day.toUpperCase(), 'island-month-week'));
        }
        this._monthGrid.add_child(header);

        let first = new Date(now.getFullYear(), now.getMonth(), 1);
        let count = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        let row = null;
        for (let slot = 0; slot < first.getDay() + count; slot++) {
            if (slot % 7 === 0) {
                row = new St.BoxLayout();
                this._monthGrid.add_child(row);
            }
            let day = slot - first.getDay() + 1;
            if (day < 1)
                row.add_child(cell('', ''));
            else if (day === now.getDate())
                row.add_child(cell(String(day), 'island-month-today'));
            else if (eventDays.indexOf(day) >= 0)
                row.add_child(cell(String(day), 'island-month-marked', 'color: ' + css(COLORS.green) + ';'));
            else
                row.add_child(cell(String(day), day < now.getDate() ? 'island-month-past' : ''));
        }
    }

    update(state) {
        this._renderMonth(state ? state.month_days || [] : []);

        this._list.destroy_all_children();
        let note = null;
        if (!state)
            note = _("The Cinnamon Island engine is not running");
        else if (state.calendar_invalid)
            note = _("The calendar link in the settings isn't a valid link");
        else if (!state.calendar_set)
            note = _("To see your events here, add your calendar link in the Cinnamon Island settings");
        else if (state.calendar_error && state.events.length === 0)
            note = _("Couldn't load the calendar");
        else if (state.events.length === 0)
            note = _("No upcoming events");
        if (note) {
            let label = new St.Label({ style_class: 'island-empty', text: note });
            label.clutter_text.line_wrap = true;
            label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
            this._list.add_child(label);
            return;
        }

        for (let event of state.events) {
            let [day, time] = formatWhen(event);
            let isToday = day === _("Today");
            let row = new St.BoxLayout({ style_class: 'island-agenda-row', reactive: true, track_hover: true });
            row.connect('button-release-event', () => {
                this._onOpen();
                return Clutter.EVENT_STOP;
            });
            // Green dot only on today's events.
            row.add_child(makeDot(isToday ? COLORS.green : [90, 90, 96]));
            row.add_child(new St.Label({ style_class: 'island-agenda-day', text: day }));
            row.add_child(new St.Label({ style_class: 'island-agenda-time', text: time }));
            let title = new St.Label({ style_class: 'island-agenda-title', text: event.title, x_expand: true });
            title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            row.add_child(title);
            this._list.add_child(row);
        }
    }
}

module.exports = { AgendaTab };
