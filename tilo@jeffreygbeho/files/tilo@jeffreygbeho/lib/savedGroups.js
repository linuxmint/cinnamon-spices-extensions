/*
 * tilo - saved arrangements.
 *
 * Remembering a set of windows and putting them back is the most requested
 * thing in this whole category and one of the least served. The GNOME shell
 * issue asking for it is the highest voted of any tiling project, KDE has had
 * one open since 2023, and Windows 11 snap groups evaporate when a single
 * member closes or you reboot.
 *
 * A saved group is a layout plus, per zone, enough to recognise the window that
 * was there. Restoring matches those descriptions against the windows already
 * open. It never launches anything: adopting the windows you have is both the
 * useful half and the half nobody implements.
 */

const Tree = require('./lib/layoutTree');
const Geometry = require('./lib/geometry');
const WindowMover = require('./lib/windowMover');
const { alive } = require('./lib/tileGroup');
const Logger = require('./lib/logger');

function isValid(group) {
    return group
        && typeof group.id === 'string'
        && Tree.isValid(group.tree)
        && Array.isArray(group.windows)
        && group.windows.every(w => w && typeof w.zoneIndex === 'number');
}

function load(raw) {
    return (Array.isArray(raw) ? raw : []).filter(isValid);
}

function create(snapshot, name) {
    return {
        id: `group-${Date.now()}`,
        name,
        tree: snapshot.tree,
        layoutId: snapshot.layoutId,
        windows: snapshot.windows
    };
}

/* The apps a saved group expects, for the label on its card. */
function describe(group) {
    const names = group.windows
        .map(w => (w.wmClass || '').split('.').pop())
        .filter(Boolean);
    return Array.from(new Set(names)).join(', ');
}

function candidatesOn(workspace) {
    return workspace.list_windows().filter(w => WindowMover.isTileable(w));
}

/*
 * Picks the open window that best answers a saved slot. Same application is
 * the requirement; the same title on top of that breaks ties, so restoring a
 * group of three terminals puts each one back where it was rather than in
 * whatever order the window list happens to be in.
 */
function match(slot, pool) {
    const sameApp = pool.filter(w => (w.get_wm_class() || '') === slot.wmClass);
    if (sameApp.length === 0) return null;

    const sameTitle = sameApp.find(w => (w.get_title() || '') === slot.title);
    return sameTitle || sameApp[0];
}

/*
 * Puts a saved group back on screen. Returns how many slots were filled, so the
 * caller can tell the difference between a group that came back and one whose
 * windows are all closed.
 */
function restore(group, workspace, workArea, gaps, tileGroups) {
    const zones = Tree.toZones(group.tree);
    const pool = candidatesOn(workspace);
    const layout = { id: group.layoutId || 'saved', name: group.name, tree: group.tree };

    let filled = 0;
    const slots = group.windows.slice().sort((a, b) => a.zoneIndex - b.zoneIndex);

    for (const slot of slots) {
        const zone = zones[slot.zoneIndex];
        if (!zone) continue;

        const window = match(slot, pool);
        if (!window) continue;

        pool.splice(pool.indexOf(window), 1);   /* one window per slot */

        WindowMover.place(window,
            Geometry.resolveZone(zone.rect, workArea, gaps.inner, gaps.outer));

        /* Registering it rebuilds the tile group, so neighbours resize together
           again straight after a restore. */
        if (tileGroups) tileGroups.assign(window, layout, slot.zoneIndex);
        filled++;
    }

    Logger.info(`restored "${group.name}": ${filled}/${slots.length} windows`);
    return filled;
}

module.exports = { isValid, load, create, describe, restore };
