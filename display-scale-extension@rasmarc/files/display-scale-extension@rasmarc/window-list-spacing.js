// Reversible compatibility fix for the grouped window list in Cinnamon 6.6.
// An output zoom reduces the panel's available logical width. Its old button
// minimum (1 px) allows the layout to allocate less space than an icon needs.
// Keep the icon's actual preferred size plus the applet's existing 6 px gap.
// No panel heights, configured icon sizes or system applet files are changed.

const AppletManager = imports.ui.appletManager;
const Mainloop = imports.mainloop;

const WINDOW_LIST_UUID = "grouped-window-list@cinnamon.org";

class WindowListSpacingGuard {
    constructor() {
        this._enabled = false;
        this._sourceId = 0;
        this._patches = [];
        this._clips = new Map();
        this._reportedError = false;
    }

    setEnabled(enabled) {
        if (!enabled) {
            this._stop();
            return;
        }
        this._enabled = true;
        this._scan(true);
        if (!this._sourceId) {
            // Also discover a window list loaded later or a new workspace.
            // New groups of an already discovered class inherit the fix.
            this._sourceId = Mainloop.timeout_add(1000, () => {
                this._scan(false);
                return true;
            });
        }
    }

    _instances() {
        return AppletManager.getRunningInstancesForUuid(WINDOW_LIST_UUID);
    }

    _patchPrototype(prototype, method, axis, horizontal) {
        if (this._patches.some(patch => patch.prototype === prototype && patch.method === method))
            return false;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
        if (!descriptor || typeof descriptor.value !== "function" || !descriptor.writable)
            return false;
        const original = descriptor.value;
        const guard = this;
        const wrapper = function(actor, constraint, alloc) {
            const result = original.call(this, actor, constraint, alloc);
            if (!guard._enabled || !this.state || this.state.isHorizontal !== horizontal || !this.iconBox)
                return result;
            const sizes = axis === "width" ? this.iconBox.get_preferred_width(constraint) :
                this.iconBox.get_preferred_height(constraint);
            const scale = Number.isFinite(global.ui_scale) && global.ui_scale > 0 ? global.ui_scale : 1;
            const iconSpace = Math.max(sizes[0], sizes[1]) + 6 * scale;
            if (Number.isFinite(iconSpace)) {
                alloc.min_size = Math.max(alloc.min_size, iconSpace);
                alloc.natural_size = Math.max(alloc.natural_size, alloc.min_size);
            }
            return result;
        };
        Object.defineProperty(prototype, method, { ...descriptor, value: wrapper });
        this._patches.push({ prototype, method, descriptor, wrapper });
        return true;
    }

    _scan(forceRelayout) {
        try {
            for (const instance of this._instances()) {
                if (!instance.actor || !Array.isArray(instance.workspaces))
                    continue;
                let changed = false;
                for (const workspace of instance.workspaces) {
                    for (const group of (workspace && workspace.appGroups) || []) {
                        if (!group || !group.actor || !group.iconBox)
                            continue;
                        const prototype = Object.getPrototypeOf(group);
                        const widthChanged = this._patchPrototype(prototype, "getPreferredWidth", "width", true);
                        const heightChanged = this._patchPrototype(prototype, "getPreferredHeight", "height", false);
                        changed = changed || widthChanged || heightChanged;
                    }
                }
                if (!this._clips.has(instance.actor)) {
                    // If even all icon minima exceed the available space, the
                    // row overflows. Keep it out of neighbouring panel applets.
                    const actor = instance.actor;
                    const previous = actor.clip_to_allocation;
                    const destroyId = actor.connect("destroy", () => this._clips.delete(actor));
                    actor.clip_to_allocation = true;
                    this._clips.set(actor, { previous, destroyId });
                    changed = true;
                }
                if (forceRelayout || changed)
                    this._queueRelayout(instance);
            }
        } catch (error) {
            // An unsupported window-list implementation must not block scaling.
            if (!this._reportedError) {
                this._reportedError = true;
                global.logError(error);
            }
        }
    }

    _queueRelayout(instance) {
        for (const workspace of instance.workspaces || []) {
            if (!workspace)
                continue;
            for (const group of workspace.appGroups || []) {
                if (group && group.actor)
                    group.actor.queue_relayout();
            }
            if (workspace.actor)
                workspace.actor.queue_relayout();
        }
        if (instance.actor)
            instance.actor.queue_relayout();
    }

    _stop() {
        this._enabled = false;
        if (this._sourceId) {
            Mainloop.source_remove(this._sourceId);
            this._sourceId = 0;
        }
        if (!this._patches.length && !this._clips.size)
            return;
        for (const patch of this._patches) {
            // Preserve a replacement installed by another extension meanwhile.
            if (patch.prototype[patch.method] === patch.wrapper)
                Object.defineProperty(patch.prototype, patch.method, patch.descriptor);
        }
        this._patches = [];
        for (const [actor, { previous, destroyId }] of this._clips) {
            actor.disconnect(destroyId);
            if (actor.clip_to_allocation === true)
                actor.clip_to_allocation = previous;
        }
        this._clips.clear();
        try {
            for (const instance of this._instances())
                this._queueRelayout(instance);
        } catch (error) {
            global.logError(error);
        }
    }

    destroy() {
        this._stop();
    }
}

module.exports = WindowListSpacingGuard;
