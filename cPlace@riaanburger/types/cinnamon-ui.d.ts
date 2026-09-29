// Hand-kept declarations for Cinnamon ui classes the shipped typings leave
// empty. The shapes are read from Cinnamon 6.6's own
// /usr/share/cinnamon/js/ui/radioButton.js, which is what runs; contribute
// them upstream once settled.

declare module imports.ui.radioButton {
    export class RadioButtonGroup {
        actor: imports.gi.St.BoxLayout;
        constructor();
        addButton(buttonId: string, label: string): void;
        setActive(buttonId: string): void;
        getActive(): string | null;
        connect(
            signal: "radio-changed",
            callback: (group: RadioButtonGroup, buttonId: string) => void,
        ): number;
    }
}
