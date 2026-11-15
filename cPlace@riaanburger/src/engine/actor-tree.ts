// A structural dump of a live actor tree, for debugging the chooser through
// the development handle: what the tree really holds beats theorising over
// a screenshot. One line per actor, indented by depth, with its class, its
// position relative to the root, its size, its style classes and any text,
// so vertical centring is a number rather than an impression.

type Actor = imports.gi.Clutter.Actor;

/** Every actor under the root, the root included, one line each. */
export function actorTree(root: Actor): string {
    const [originX, originY] = root.get_transformed_position();
    const lines = (actor: Actor, depth: number): string[] => {
        // Any actor may be a widget with a style class, or a label or an
        // entry with text; reading the properties by name covers every kind
        // at once, where a type test would need one for each.
        const widget = actor as unknown as {
            style_class?: string;
            text?: string;
        };
        const [x, y] = actor.get_transformed_position();
        // The GObject class's own name, which the typings don't carry.
        const name = (actor.constructor as unknown as { name: string }).name;
        const line =
            `${"  ".repeat(depth)}${name}` +
            ` [${Math.round((x ?? 0) - (originX ?? 0))},` +
            `${Math.round((y ?? 0) - (originY ?? 0))}` +
            ` ${Math.round(actor.width)}x${Math.round(actor.height)}]` +
            (widget.style_class ? ` .${widget.style_class}` : "") +
            (typeof widget.text === "string" ? ` "${widget.text}"` : "");
        return [
            line,
            ...actor.get_children().flatMap((child) => lines(child, depth + 1)),
        ];
    };
    return lines(root, 0).join("\n");
}
