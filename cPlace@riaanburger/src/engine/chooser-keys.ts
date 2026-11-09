// The chooser's keys: which preset a key names, what Enter does with the
// focus where it is, and the route every other key takes, the shell's own
// keys first and then the page's. The chooser lends the actions; this module
// decides which one a key means. Only what St does not already do is taken,
// so Tab, Space and the widgets' own keys keep their native behaviour.

import { rowDigit } from "./digit-row";
import type { KeyModifiers } from "./page";

const Clutter = imports.gi.Clutter;

/** What Enter does with the key focus where it is. */
export type EnterAction = "apply" | "commit, then apply" | "left to the control";

/** A key as pressed: the symbol it types, the place it sits, and the
 * modifiers held with it. */
export interface KeyPress {
    symbol: number;
    code: number;
    modifiers: KeyModifiers;
}

/** What the shell does with the keys it takes, lent by the chooser. */
export interface KeyRoute {
    close(): void;
    undo(): void;
    runPreset(digit: number): void;
    savePreset(digit: number): void;
    /** Delete on a preset's row: true when the row took it. */
    deletePreset(): boolean;
    /** Any other key lets an armed row go. */
    disarm(): void;
    /** A page's letter selects its arrangement: true when one did. */
    selectLetter(symbol: number): boolean;
    /** Whatever the shell leaves, the page may take. */
    page(symbol: number, modifiers: KeyModifiers): boolean;
}

/** The preset digit a key names, from the top row or, with Num Lock on,
 * the keypad; zero for any other key. */
export function presetDigit(symbol: number): number {
    for (const zero of [Clutter.KEY_0, Clutter.KEY_KP_0]) {
        const digit = symbol - zero;
        if (digit >= 1 && digit <= 9) {
            return digit;
        }
    }
    return 0;
}

function isEnter(symbol: number): boolean {
    return symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter;
}

/** Enter applies from anywhere in the content, except on a control whose
 * own press already leaves the dialog. A number field's key focus is the
 * text inside it, which Enter commits before applying. */
export function enterAction(
    focus: imports.gi.Clutter.Actor | null,
    leftToControl: boolean,
): EnterAction {
    if (leftToControl) {
        return "left to the control";
    }
    return focus instanceof Clutter.Text ? "commit, then apply" : "apply";
}

/** What the chooser lends Enter. */
export interface EnterHost {
    action(): EnterAction;
    /** Leave a number field, which commits it as Tab leaving it does. */
    commit(): void;
    apply(): void;
}

/** Enter, taken on its way down to the focused control rather than on its
 * way back up: a focused button takes Enter as a press and a number field
 * takes it to commit, and neither lets it go, so taken any later it would
 * never arrive. True when Enter was taken. */
export function captureEnter(
    event: imports.gi.Clutter.Event,
    host: EnterHost,
): boolean {
    if (
        event.type() !== Clutter.EventType.KEY_PRESS ||
        !isEnter(event.get_key_symbol())
    ) {
        return false;
    }
    const action = host.action();
    if (action === "left to the control") {
        return false;
    }
    if (action === "commit, then apply") {
        host.commit();
    }
    host.apply();
    return true;
}

/** The key a key-press signal carries. The typed signal hands a bare
 * KeyEvent struct; the runtime object is a Clutter.Event carrying the
 * symbol, the place and the modifier state. */
export function keyOf(event: imports.gi.Clutter.KeyEvent): KeyPress {
    const real = event as unknown as {
        get_key_symbol(): number;
        get_key_code(): number;
        get_state(): number;
    };
    const state = real.get_state();
    return {
        symbol: real.get_key_symbol(),
        code: real.get_key_code(),
        modifiers: {
            control: (state & Clutter.ModifierType.CONTROL_MASK) !== 0,
            shift: (state & Clutter.ModifierType.SHIFT_MASK) !== 0,
        },
    };
}

/** Escape, Delete on a preset's row, the digits, u and the letters, then
 * whatever the page wants. Enter is taken earlier, on its way down. */
export function routeKey(key: KeyPress, route: KeyRoute): boolean {
    return (
        deleteKey(key.symbol, route) ||
        shellKey(key, route) ||
        route.selectLetter(key.symbol) ||
        route.page(key.symbol, key.modifiers)
    );
}

/** Delete goes to a preset's row, and any other key disarms one. */
function deleteKey(symbol: number, route: KeyRoute): boolean {
    if (symbol !== Clutter.KEY_Delete && symbol !== Clutter.KEY_KP_Delete) {
        route.disarm();
        return false;
    }
    return route.deletePreset();
}

/** The keys the shell keeps before any page: Escape closes, u undoes, and
 * a digit runs its preset, or saves it with Ctrl, named by what the key
 * types or, on the digit row, by where it sits. */
function shellKey(key: KeyPress, route: KeyRoute): boolean {
    if (key.symbol === Clutter.KEY_Escape) {
        route.close();
        return true;
    }
    // The letter u is the shell's, reserved for undo before any page's.
    if (key.symbol === Clutter.KEY_u) {
        route.undo();
        return true;
    }
    const digit = presetDigit(key.symbol) || rowDigit(key.code);
    if (digit === 0) {
        return false;
    }
    if (key.modifiers.control) {
        route.savePreset(digit);
    } else {
        route.runPreset(digit);
    }
    return true;
}
