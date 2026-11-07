/*
 * tilo - the layout model.
 *
 * A layout is a tree, not a list of rectangles.
 *
 *   leaf   = {}
 *   branch = { dir: 'row' | 'col', children: [node, ...], weights: [n, ...] }
 *
 * 'row' lays its children out left to right, 'col' top to bottom. Weights are
 * relative, so [2, 1] means the first child takes two thirds.
 *
 * Why a tree rather than absolute rectangles, which is what FancyZones' canvas
 * mode uses: overlaps and gaps become impossible to express. A zone cannot
 * drift out of the screen or land on top of its neighbour, because no zone has
 * coordinates of its own. Splitting is a local edit, and dragging a border is
 * one weight changing. KWin's tiling editor is built the same way, and it is
 * the part of it people ask other projects to copy.
 *
 * Every function here is pure: operations return a new tree and never touch the
 * one they were given.
 */

function leaf() {
    return {};
}

function isLeaf(node) {
    return !node.children || node.children.length === 0;
}

function clone(node) {
    return JSON.parse(JSON.stringify(node));
}

function branch(dir, children, weights) {
    return { dir, children, weights: weights || children.map(() => 1) };
}

/*
 * Walks the tree and returns one entry per zone:
 *   { rect: [x, y, width, height], path: [childIndex, ...] }
 * Rectangles are fractions of the whole area, so they survive any resolution.
 * The path addresses that zone for later edits.
 */
function toZones(root) {
    const out = [];
    (function walk(node, x, y, w, h, path) {
        if (isLeaf(node)) {
            out.push({ rect: [x, y, w, h], path: path.slice() });
            return;
        }
        const total = node.weights.reduce((a, b) => a + b, 0);
        let offset = 0;
        node.children.forEach((child, i) => {
            const share = node.weights[i] / total;
            if (node.dir === 'row') {
                walk(child, x + offset * w, y, share * w, h, path.concat(i));
            } else {
                walk(child, x, y + offset * h, w, share * h, path.concat(i));
            }
            offset += share;
        });
    })(root, 0, 0, 1, 1, []);
    return out;
}

/* Just the rectangles, in the same order, for callers that do not edit. */
function toFractions(root) {
    return toZones(root).map(z => z.rect);
}

function nodeAt(root, path) {
    return path.reduce((node, i) => node.children[i], root);
}

function countZones(root) {
    return toZones(root).length;
}

/*
 * Splits one zone in two along `dir`. The new pair inherits the space the
 * original zone occupied, so nothing else in the layout moves.
 */
function splitAt(root, path, dir) {
    const tree = clone(root);
    const replacement = branch(dir, [leaf(), leaf()]);

    if (path.length === 0) return replacement;

    const parent = nodeAt(tree, path.slice(0, -1));
    parent.children[path[path.length - 1]] = replacement;
    return tree;
}

/*
 * Removes a zone. Its space goes back to its siblings in proportion to what
 * they already had, and a branch left holding a single child dissolves into it.
 * The last remaining zone cannot be removed.
 */
function removeAt(root, path) {
    if (path.length === 0) return clone(root);

    const tree = clone(root);
    const parent = nodeAt(tree, path.slice(0, -1));
    const index = path[path.length - 1];

    parent.children.splice(index, 1);
    parent.weights.splice(index, 1);

    return normalize(tree);
}

/* Collapses any branch left with one child. Applied after every removal. */
function normalize(node) {
    if (isLeaf(node)) return node;
    node.children = node.children.map(normalize);
    if (node.children.length === 1) return node.children[0];
    return node;
}

/*
 * Moves the boundary between children `index` and `index + 1` of a branch.
 * `delta` is a fraction of that branch's own extent, positive towards the end.
 * Both neighbours keep a floor so a drag can never collapse a zone to nothing.
 */
function resizeAt(root, path, index, delta) {
    const MIN = 0.05;
    const tree = clone(root);
    const node = nodeAt(tree, path);
    if (isLeaf(node) || index < 0 || index + 1 >= node.children.length) return tree;

    const total = node.weights.reduce((a, b) => a + b, 0);
    const move = delta * total;
    const a = node.weights[index] + move;
    const b = node.weights[index + 1] - move;
    const floor = MIN * total;
    if (a < floor || b < floor) return tree;

    node.weights[index] = a;
    node.weights[index + 1] = b;
    return tree;
}

/* Rejects anything that is not a well formed tree, so bad stored JSON cannot
   take the extension down at load time. */
function isValid(node) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
    if (isLeaf(node)) return true;
    if (node.dir !== 'row' && node.dir !== 'col') return false;
    if (!Array.isArray(node.children) || node.children.length < 2) return false;
    if (!Array.isArray(node.weights) || node.weights.length !== node.children.length) return false;
    if (!node.weights.every(w => typeof w === 'number' && w > 0)) return false;
    return node.children.every(isValid);
}

/* The fractional rectangle any node occupies, branches included. Needed to turn
   a drag measured in pixels into a weight change on the right branch. */
function rectAt(root, path) {
    let rect = [0, 0, 1, 1];
    let node = root;
    for (const index of path) {
        const total = node.weights.reduce((a, b) => a + b, 0);
        const before = node.weights.slice(0, index).reduce((a, b) => a + b, 0) / total;
        const share = node.weights[index] / total;
        if (node.dir === 'row') {
            rect = [rect[0] + before * rect[2], rect[1], share * rect[2], rect[3]];
        } else {
            rect = [rect[0], rect[1] + before * rect[3], rect[2], share * rect[3]];
        }
        node = node.children[index];
    }
    return rect;
}

/*
 * Finds the split that owns one edge of a zone.
 *
 * Dragging the right edge of a zone does not necessarily move its own parent's
 * boundary: a zone can be the last child of its parent and still sit against a
 * boundary owned by a grandparent. So walk up until a split in the matching
 * direction has a neighbour on that side.
 *
 * Returns { path, index } addressing the boundary between children `index` and
 * `index + 1`, or null when the edge is the screen edge and nothing can move.
 */
function boundaryFor(root, path, edge) {
    const wanted = (edge === 'left' || edge === 'right') ? 'row' : 'col';
    const towardsEnd = (edge === 'right' || edge === 'bottom');

    for (let depth = path.length - 1; depth >= 0; depth--) {
        const parentPath = path.slice(0, depth);
        const parent = nodeAt(root, parentPath);
        const childIndex = path[depth];
        if (parent.dir !== wanted) continue;

        if (towardsEnd && childIndex < parent.children.length - 1) {
            return { path: parentPath, index: childIndex };
        }
        if (!towardsEnd && childIndex > 0) {
            return { path: parentPath, index: childIndex - 1 };
        }
    }
    return null;
}

module.exports = {
    leaf, branch, isLeaf, clone, toZones, toFractions, nodeAt,
    countZones, splitAt, removeAt, resizeAt, isValid, rectAt, boundaryFor
};
