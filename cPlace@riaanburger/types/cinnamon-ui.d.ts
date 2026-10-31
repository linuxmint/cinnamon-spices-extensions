// Hand-kept declarations for Cinnamon ui classes the shipped typings leave
// empty or out of date. Cinnamon's radio button is read from its
// radioButton.js: up to 6.6 a plain object holding its actor, from 6.8
// the St.Button itself, which src/engine/cinnamon-ticks.ts tells apart.

declare module imports.ui.radioButton {
    export class RadioButton {
        actor?: imports.gi.St.Button;
        constructor(label: string);
        setLabel(label: string): void;
        getLabelActor(): imports.gi.St.Label;
    }
}
