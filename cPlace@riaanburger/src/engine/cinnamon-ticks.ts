// Cinnamon's check box and radio button, as cPlace ticks with them, in the
// two shapes Cinnamon has given them. Up to Cinnamon 6.6 each is a plain
// object holding its `actor`, an St.Button, with setToggleState on it;
// from 6.8 each is the St.Button itself, a GObject class, and the radio
// group that held radios together is gone. Both shapes answer here as one,
// the button and its label, and the group is cPlace's own: one radio
// checked at a time, and a word when the choice changes.

const St = imports.gi.St;
const CheckBoxes = imports.ui.checkBox;
const RadioButtons = imports.ui.radioButton;

/** A tick as the chooser uses it: the button, checked or not, and its
 * label. */
export interface Tick {
    actor: imports.gi.St.Button;
    label: imports.gi.St.Label;
}

/** What Cinnamon hands back for either widget, in either shape. */
interface Made {
    actor?: imports.gi.St.Button;
    getLabelActor(): imports.gi.St.Label;
}

function asTick(made: Made): Tick {
    const actor = made instanceof St.Button ? made : made.actor;
    if (actor === undefined) {
        throw new Error("cPlace: Cinnamon's tick has no actor");
    }
    return { actor, label: made.getLabelActor() };
}

/** A check box with its label, checked as asked. */
export function tickBox(label: string, checked: boolean): Tick {
    const tick = asTick(new CheckBoxes.CheckBox(label, {}, checked));
    tick.actor.checked = checked;
    return tick;
}

/** A radio button with its label, unchecked. */
export function radioButton(label: string): Tick {
    return asTick(new RadioButtons.RadioButton(label));
}

/** Radios in a column, one checked at a time, each known by an id; a
 * click, or setActive, that changes the choice is told. */
export class RadioGroup {
    readonly actor = new St.BoxLayout({ vertical: true });
    private readonly buttons: { id: string; tick: Tick }[] = [];
    private activeId: string | null = null;

    constructor(private readonly onChange: (id: string) => void) {}

    addButton(id: string, label: string): Tick {
        const tick = radioButton(label);
        tick.actor.connect("clicked", () => {
            this.setActive(id);
        });
        this.buttons.push({ id, tick });
        this.actor.add_child(tick.actor);
        return tick;
    }

    setActive(id: string): void {
        for (const button of this.buttons) {
            button.tick.actor.checked = button.id === id;
        }
        if (this.activeId !== id) {
            this.activeId = id;
            this.onChange(id);
        }
    }

    getActive(): string | null {
        return this.activeId;
    }
}
