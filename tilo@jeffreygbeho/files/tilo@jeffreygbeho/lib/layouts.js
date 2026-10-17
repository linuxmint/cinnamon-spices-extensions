/* tilo - layout definitions. Draws nothing, moves nothing. */

const Tree = require('./lib/layoutTree');
const Geometry = require('./lib/geometry');
const { _ } = require('./lib/i18n');

const { leaf, branch } = Tree;
const row = (children, weights) => branch('row', children, weights);
const col = (children, weights) => branch('col', children, weights);

/*
 * Direct positions bound to keyboard shortcuts, as plain fractions
 * [x, y, width, height] within 0..1. These are single placements rather than
 * layouts, so they need no tree.
 */
const QUICK = {
    left:        [0,    0,    0.5,  1   ],
    right:       [0.5,  0,    0.5,  1   ],
    top:         [0,    0,    1,    0.5 ],
    bottom:      [0,    0.5,  1,    0.5 ],
    fill:        [0,    0,    1,    1   ],
    center:      [0.2,  0.15, 0.6,  0.7 ],
    topLeft:     [0,    0,    0.5,  0.5 ],
    topRight:    [0.5,  0,    0.5,  0.5 ],
    bottomLeft:  [0,    0.5,  0.5,  0.5 ],
    bottomRight: [0.5,  0.5,  0.5,  0.5 ]
};

/* The layouts offered in the picker, as split trees. See layoutTree.js. */
const BUILTIN = [
    { id: 'halves', name: _('Two halves'),
      tree: row([leaf(), leaf()]) },

    { id: 'thirds', name: _('Three columns'),
      tree: row([leaf(), leaf(), leaf()]) },

    { id: 'main-side', name: _('Main plus two'),
      tree: row([leaf(), col([leaf(), leaf()])], [2, 1]) },

    { id: 'quarters', name: _('Four quarters'),
      tree: col([row([leaf(), leaf()]), row([leaf(), leaf()])]) },

    { id: 'grid-4x3', name: _('Grid 4 x 3'),
      tree: col([
          row([leaf(), leaf(), leaf(), leaf()]),
          row([leaf(), leaf(), leaf(), leaf()]),
          row([leaf(), leaf(), leaf(), leaf()])
      ]) }
];

/* Layouts the user drew, loaded from settings. Rejected if malformed, so a
   corrupted stored value cannot stop the extension from loading. */
let custom = [];

function setCustom(list) {
    custom = (Array.isArray(list) ? list : [])
        .filter(l => l && typeof l.id === 'string' && Tree.isValid(l.tree))
        .map(l => ({ id: l.id, name: l.name || _('Custom'), tree: l.tree, custom: true }));
}

function getCustom() {
    return custom.map(l => ({ id: l.id, name: l.name, tree: l.tree }));
}

/* Zones are derived from the tree rather than stored, so the two can never
   disagree. */
function withZones(layout) {
    return Object.assign({}, layout, { zones: Tree.toFractions(layout.tree) });
}

function all() {
    return BUILTIN.concat(custom).map(withZones);
}

function layoutById(id) {
    return all().find(layout => layout.id === id) || null;
}

/* Resolves every zone of a layout into pixel rectangles. */
function resolveLayout(layout, workArea, innerGap, outerGap) {
    const zones = layout.zones || Tree.toFractions(layout.tree);
    return zones.map(zone => Geometry.resolveZone(zone, workArea, innerGap, outerGap));
}

/* Hit test: which zone sits under the pointer? -1 when none. */
function zoneAt(resolvedZones, pointerX, pointerY) {
    for (let i = 0; i < resolvedZones.length; i++) {
        if (Geometry.contains(resolvedZones[i], pointerX, pointerY)) return i;
    }
    return -1;
}

module.exports = {
    QUICK, BUILTIN, all, layoutById, resolveLayout, zoneAt, setCustom, getCustom
};
