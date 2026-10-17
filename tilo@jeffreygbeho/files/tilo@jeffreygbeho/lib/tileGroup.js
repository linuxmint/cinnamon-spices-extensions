/*
 * tilo - what is tiled where.
 *
 * Placing a window used to be a one shot operation: compute a rectangle, move
 * the window, forget. Two features need more than that. Dragging the border
 * between two tiled windows has to know they are neighbours, and saving an
 * arrangement has to know what the arrangement is.
 *
 * A group is one layout in use on one monitor of one workspace, plus which
 * window sits in which zone. Choosing a different layout there replaces the
 * group rather than merging into it.
 */

const Geometry = require('./lib/geometry');
const WindowMover = require('./lib/windowMover');
const Tree = require('./lib/layoutTree');
const Logger = require('./lib/logger');

/* A window whose actor is gone has been closed; its slot is stale. */
function alive(window) {
    try {
        return window && window.get_compositor_private() !== null;
    } catch (e) {
        return false;
    }
}

class TileGroups {
    /* getGaps: () => ({ inner, outer }) */
    constructor(getGaps) {
        this._getGaps = getGaps;
        this._groups = new Map();
    }

    clear() {
        this._groups.clear();
    }

    _key(window) {
        try {
            return `${window.get_monitor()}:${window.get_workspace().index()}`;
        } catch (e) {
            return null;
        }
    }

    /* Records that `window` now occupies zone `zoneIndex` of `layout`. */
    assign(window, layout, zoneIndex) {
        const key = this._key(window);
        if (key === null) return;

        let group = this._groups.get(key);
        const treeJson = JSON.stringify(layout.tree);

        if (!group || JSON.stringify(group.tree) !== treeJson) {
            group = { tree: Tree.clone(layout.tree), layoutId: layout.id, slots: new Map() };
            this._groups.set(key, group);
        }

        /* One window per zone, and one zone per window. */
        for (const [index, held] of group.slots) {
            if (held === window) group.slots.delete(index);
        }
        group.slots.set(zoneIndex, window);
    }

    forWindow(window) {
        const key = this._key(window);
        if (key === null) return null;

        const group = this._groups.get(key);
        if (!group) return null;

        for (const [zoneIndex, held] of group.slots) {
            if (held === window) return { group, zoneIndex };
        }
        return null;
    }

    /* Drops closed windows, and groups left with nothing in them. */
    prune() {
        for (const [key, group] of this._groups) {
            for (const [index, window] of group.slots) {
                if (!alive(window)) group.slots.delete(index);
            }
            if (group.slots.size === 0) this._groups.delete(key);
        }
    }

    /*
     * A window in a group was resized by hand. Translate the edges that moved
     * into weight changes on the splits that own them, then lay the whole group
     * out again so the neighbours follow.
     *
     * Cinnamon used to resize adjacent tiled windows together and lost it in the
     * Mutter rebase, with no note in the changelog. It is the single feature
     * people cite for staying on native snapping instead of a zone tool.
     */
    resizeFrom(window, startRect, endRect) {
        const found = this.forWindow(window);
        if (!found) return false;

        const { group, zoneIndex } = found;
        const workArea = Geometry.workAreaFor(window);
        const zone = Tree.toZones(group.tree)[zoneIndex];
        if (!zone) return false;

        const EDGES = [
            { name: 'left',   delta: endRect.x - startRect.x, axis: 'x' },
            { name: 'right',  delta: (endRect.x + endRect.width) - (startRect.x + startRect.width), axis: 'x' },
            { name: 'top',    delta: endRect.y - startRect.y, axis: 'y' },
            { name: 'bottom', delta: (endRect.y + endRect.height) - (startRect.y + startRect.height), axis: 'y' }
        ];

        let changed = false;
        for (const edge of EDGES) {
            if (Math.abs(edge.delta) < 3) continue;

            const boundary = Tree.boundaryFor(group.tree, zone.path, edge.name);
            if (!boundary) continue;

            /* The weight change is a fraction of the branch that owns the
               boundary, not of the whole screen. */
            const branchRect = Tree.rectAt(group.tree, boundary.path);
            const extent = edge.axis === 'x'
                ? branchRect[2] * workArea.width
                : branchRect[3] * workArea.height;
            if (extent <= 0) continue;

            group.tree = Tree.resizeAt(group.tree, boundary.path, boundary.index,
                                       edge.delta / extent);
            changed = true;
        }

        if (!changed) return false;

        this.apply(group, workArea);
        Logger.debug(`resized group of ${group.slots.size} window(s)`);
        return true;
    }

    /* Lays every window of a group back out against the current tree. */
    apply(group, workArea) {
        const { inner, outer } = this._getGaps();
        const zones = Tree.toZones(group.tree);

        for (const [zoneIndex, window] of group.slots) {
            if (!alive(window)) { group.slots.delete(zoneIndex); continue; }
            const zone = zones[zoneIndex];
            if (!zone) continue;
            WindowMover.place(window,
                Geometry.resolveZone(zone.rect, workArea, inner, outer));
        }
    }

    /* The arrangement in front of the user right now, for saving. */
    snapshot(window) {
        const found = this.forWindow(window);
        if (!found) return null;

        const { group } = found;
        const windows = [];
        for (const [zoneIndex, held] of group.slots) {
            if (!alive(held)) continue;
            windows.push({
                zoneIndex,
                wmClass: held.get_wm_class() || '',
                title: held.get_title() || ''
            });
        }
        if (windows.length === 0) return null;

        return { tree: Tree.clone(group.tree), layoutId: group.layoutId, windows };
    }
}

module.exports = { TileGroups, alive };
