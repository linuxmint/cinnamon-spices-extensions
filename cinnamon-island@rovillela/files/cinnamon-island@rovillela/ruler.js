const { Clutter, St } = imports.gi;
const { scrollStep } = require('./util');

// The timer ruler goes from 1 to 60 minutes, with a number every 5.
const RULER_MAX = 60;
const RULER_MARGIN = 10;

// Minute ruler: one small tick per minute. Clicking or dragging picks the
// time; the ticks up to the chosen time take the colour of the ruler. Emits
// `onChange(minutes)`.
class Ruler {
    constructor(onChange, color) {
        this._onChange = onChange;
        this._color = color;
        this._minutes = 5;
        this._enabled = true;
        this._dragging = false;

        this.actor = new St.DrawingArea({ style_class: 'island-ruler island-wheel', reactive: true, track_hover: true, x_expand: true });
        this.actor.connect('repaint', area => this._draw(area));
        this.actor.connect('button-press-event', (actor, event) => {
            if (!this._enabled)
                return Clutter.EVENT_PROPAGATE;
            this._dragging = true;
            event.get_device().grab(this.actor);
            this._pick(event);
            return Clutter.EVENT_STOP;
        });
        this.actor.connect('motion-event', (actor, event) => {
            if (this._dragging)
                this._pick(event);
            return Clutter.EVENT_PROPAGATE;
        });
        this.actor.connect('button-release-event', (actor, event) => {
            if (!this._dragging)
                return Clutter.EVENT_PROPAGATE;
            this._dragging = false;
            event.get_device().ungrab();
            return Clutter.EVENT_STOP;
        });
        this.actor.connect('scroll-event', (actor, event) => {
            if (this._enabled)
                this._set(this._minutes - scrollStep(event));
            return Clutter.EVENT_STOP;
        });
    }

    get dragging() {
        return this._dragging;
    }

    _pick(event) {
        let [x, y] = event.get_coords();
        let [ok, localX] = this.actor.transform_stage_point(x, y);
        let span = this.actor.width - 2 * RULER_MARGIN;
        this._set(Math.round(1 + (localX - RULER_MARGIN) / span * (RULER_MAX - 1)));
    }

    _set(minutes) {
        minutes = Math.max(1, Math.min(RULER_MAX, minutes));
        if (minutes === this._minutes)
            return;
        this._minutes = minutes;
        this.actor.queue_repaint();
        this._onChange(minutes);
    }

    setColor(color) {
        if (color.join() !== this._color.join()) {
            this._color = color;
            this.actor.queue_repaint();
        }
    }

    // `minutes` is the time to show; with `enabled` false the ruler is display
    // only.
    show(minutes, enabled) {
        minutes = Math.max(0, Math.min(RULER_MAX, minutes));
        if (minutes !== this._minutes || enabled !== this._enabled) {
            this._minutes = minutes;
            this._enabled = enabled;
            this.actor.queue_repaint();
        }
    }

    _draw(area) {
        let cr = area.get_context();
        let [width, height] = area.get_surface_size();
        let span = width - 2 * RULER_MARGIN;
        let [r, g, b] = this._color.map(v => v / 255);
        let top = 15;

        cr.selectFontFace('Sans', 0, 0);
        cr.setFontSize(9);
        for (let minute = 1; minute <= RULER_MAX; minute++) {
            let x = Math.round(RULER_MARGIN + (minute - 1) / (RULER_MAX - 1) * span) + 0.5;
            let major = minute % 5 === 0;
            let on = minute <= this._minutes;
            if (on)
                cr.setSourceRGBA(r, g, b, major ? 1 : 0.8);
            else
                cr.setSourceRGBA(1, 1, 1, major ? 0.38 : 0.2);
            cr.setLineWidth(major ? 2 : 1);
            cr.moveTo(x, major ? top : top + 5);
            cr.lineTo(x, height - 7);
            cr.stroke();
            if (major && minute % 10 === 0 || minute === 5) {
                let label = String(minute);
                cr.moveTo(x - (label.length > 1 ? 6 : 3), 10);
                cr.showText(label);
            }
        }

        // Marker of the chosen time.
        if (this._minutes >= 1) {
            let x = RULER_MARGIN + (this._minutes - 1) / (RULER_MAX - 1) * span;
            cr.setSourceRGBA(r, g, b, 1);
            cr.moveTo(x, height - 6);
            cr.lineTo(x - 4, height);
            cr.lineTo(x + 4, height);
            cr.closePath();
            cr.fill();
        }
        cr.$dispose();
    }
}

module.exports = { Ruler };
