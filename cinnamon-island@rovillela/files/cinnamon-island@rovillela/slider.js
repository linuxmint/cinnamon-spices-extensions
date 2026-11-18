const { Clutter, St } = imports.gi;
const Signals = imports.signals;

const TRACK = 4;
const KNOB_RADIUS = 7;
const SCROLL_STEP = 0.05;

// The island's slider: a thin track with a knob. Emits 'value-changed' (value
// from 0 to 1), 'drag-begin' and 'drag-end'.
class Slider {
    // `options.vertical` stands the control upright (the value grows upwards)
    // and `options.color` is the [r, g, b] colour of the filled part (white by
    // default).
    constructor(options = {}) {
        this._vertical = !!options.vertical;
        this._color = options.color || [255, 255, 255];
        this.value = 0;
        // Position (0 to 1) of a small tick on the track, or null. Marks 100%
        // on controls that go beyond it.
        this.mark = null;
        this._dimmed = false;
        this._dragging = false;

        this.actor = new St.DrawingArea({
            style_class: (this._vertical ? 'island-slider-vertical' : 'island-slider') + ' island-wheel',
            reactive: true,
            track_hover: true,
            x_expand: !this._vertical,
            y_expand: this._vertical,
        });
        this.actor.connect('repaint', area => this._draw(area));
        this.actor.connect('button-press-event', (actor, event) => this._onPress(event));
        this.actor.connect('motion-event', (actor, event) => this._onMotion(event));
        this.actor.connect('button-release-event', (actor, event) => this._onRelease(event));
        this.actor.connect('scroll-event', (actor, event) => this._onScroll(event));
    }

    setValue(value) {
        this.value = Math.max(0, Math.min(1, value));
        this.actor.queue_repaint();
    }

    setColor(color) {
        if (color.join() !== this._color.join()) {
            this._color = color;
            this.actor.queue_repaint();
        }
    }

    // Dimmed: used when the sound is muted.
    setDimmed(dimmed) {
        if (dimmed !== this._dimmed) {
            this._dimmed = dimmed;
            this.actor.queue_repaint();
        }
    }

    _change(value) {
        value = Math.max(0, Math.min(1, value));
        if (value === this.value)
            return;
        this.setValue(value);
        this.emit('value-changed', this.value);
    }

    _valueAt(event) {
        let [x, y] = event.get_coords();
        let [ok, localX, localY] = this.actor.transform_stage_point(x, y);
        if (this._vertical)
            return 1 - (localY - KNOB_RADIUS) / (this.actor.height - 2 * KNOB_RADIUS);
        return (localX - KNOB_RADIUS) / (this.actor.width - 2 * KNOB_RADIUS);
    }

    _onPress(event) {
        this._dragging = true;
        event.get_device().grab(this.actor);
        this.emit('drag-begin');
        this._change(this._valueAt(event));
        return Clutter.EVENT_STOP;
    }

    _onMotion(event) {
        if (!this._dragging)
            return Clutter.EVENT_PROPAGATE;
        this._change(this._valueAt(event));
        return Clutter.EVENT_STOP;
    }

    _onRelease(event) {
        if (!this._dragging)
            return Clutter.EVENT_PROPAGATE;
        this._dragging = false;
        event.get_device().ungrab();
        this.emit('drag-end');
        return Clutter.EVENT_STOP;
    }

    _onScroll(event) {
        let direction = event.get_scroll_direction();
        if (direction === Clutter.ScrollDirection.UP || direction === Clutter.ScrollDirection.RIGHT)
            this._change(this.value + SCROLL_STEP);
        else if (direction === Clutter.ScrollDirection.DOWN || direction === Clutter.ScrollDirection.LEFT)
            this._change(this.value - SCROLL_STEP);
        return Clutter.EVENT_STOP;
    }

    _draw(area) {
        let cr = area.get_context();
        let [width, height] = area.get_surface_size();
        // Everything is drawn as if the control lay flat, on an axis going
        // from `start` to `end`; upright, the axis runs bottom to top.
        let length = this._vertical ? height : width;
        let middle = (this._vertical ? width : height) / 2;
        let start = KNOB_RADIUS;
        let end = length - KNOB_RADIUS;
        let knob = start + (end - start) * this.value;
        let point = (along, across) => this._vertical ? [across, length - along] : [along, across];

        let track = (from, to, color, alpha) => {
            if (to - from < 1)
                return;
            cr.setSourceRGBA(color[0] / 255, color[1] / 255, color[2] / 255, alpha);
            cr.setLineWidth(TRACK);
            cr.setLineCap(1);  // rounded ends
            cr.moveTo(...point(from, middle));
            cr.lineTo(...point(to, middle));
            cr.stroke();
        };
        track(start, end, [255, 255, 255], 0.2);
        if (this.mark !== null) {
            let at = Math.round(start + (end - start) * this.mark);
            cr.setSourceRGBA(1, 1, 1, 0.45);
            cr.setLineWidth(2);
            cr.setLineCap(0);
            cr.moveTo(...point(at, middle - 5));
            cr.lineTo(...point(at, middle + 5));
            cr.stroke();
        }
        track(start, knob, this._color, this._dimmed ? 0.35 : 1);

        // The knob, always white, with a light shadow to stand out.
        let [kx, ky] = point(knob, middle);
        cr.setSourceRGBA(0, 0, 0, 0.3);
        cr.arc(kx, ky + 1, KNOB_RADIUS, 0, 2 * Math.PI);
        cr.fill();
        cr.setSourceRGBA(1, 1, 1, this._dimmed ? 0.6 : 1);
        cr.arc(kx, ky, KNOB_RADIUS - 0.5, 0, 2 * Math.PI);
        cr.fill();

        cr.$dispose();
    }
}
Signals.addSignalMethods(Slider.prototype);

module.exports = { Slider };
