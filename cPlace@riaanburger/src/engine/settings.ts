// The engine's half of the settings: the engine's own keys bound to
// properties here, and typed reads and writes for the keys each
// arrangement's page declares, so no arrangement's variables are named in
// this module. Storage, binding and the settings dialogue stay with the
// engine; the pages consume and write values. Every key read or written
// here must be declared in settings-schema.json: Cinnamon answers a read of
// an undeclared key with null, which the readers turn into their fallback,
// and drops a write to one, logging only that the key could not be found.

import { focusedWindow, windowAppId } from "./gather";
import type { PresetStore } from "./presets";
import { parsePresets } from "./presets";

const ExtensionSettings = imports.ui.settings.ExtensionSettings;

export class EngineSettings {
    participants = "";
    placeHotkey = "<Super>z";
    presets = "{}";

    private readonly settings: imports.ui.settings.ExtensionSettings;

    constructor(uuid: string, onHotkeyChange: () => void) {
        this.settings = new ExtensionSettings(this, uuid);
        this.settings.bind("participants", "participants");
        this.settings.bind("place-hotkey", "placeHotkey", onHotkeyChange);
        this.settings.bind("presets", "presets");
    }

    /** A page's number, or its fallback when the store holds anything
     * else; the values read live, so a write is visible at once. */
    number(key: string, fallback: number): number {
        const value = this.settings.getValue<unknown>(key);
        return typeof value === "number" && Number.isFinite(value)
            ? value
            : fallback;
    }

    text(key: string, fallback: string): string {
        const value = this.settings.getValue<unknown>(key);
        return typeof value === "string" ? value : fallback;
    }

    flag(key: string, fallback: boolean): boolean {
        const value = this.settings.getValue<unknown>(key);
        return typeof value === "boolean" ? value : fallback;
    }

    /** A page's list: the rows a list setting holds, each a plain object
     * keyed by the column ids its schema declares; empty when the store
     * holds anything else. */
    list(key: string): unknown[] {
        const value = this.settings.getValue<unknown>(key);
        return Array.isArray(value) ? value : [];
    }

    /** A page's write, into the store the settings dialogue binds as well,
     * so the chooser and the dialogue never disagree. */
    write(key: string, value: number | string | boolean | object): void {
        this.settings.setValue(key, value);
    }

    /** Whatever the store holds under a key, for the development handle. */
    raw(key: string): unknown {
        return this.settings.getValue<unknown>(key);
    }

    presetStore(): PresetStore {
        return parsePresets(this.presets);
    }

    writePresetStore(store: PresetStore): void {
        this.settings.setValue("presets", JSON.stringify(store));
    }

    /** The applications that arrive ticked: the participants setting's,
     * or, while it names none, the focused window's, the one the user is
     * likeliest to be arranging. */
    participantIds(): string[] {
        const named = this.participants
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id.length > 0);
        if (named.length > 0) {
            return named;
        }
        const focused = focusedWindow();
        const app = focused === null ? null : windowAppId(focused);
        return app === null ? [] : [app];
    }

    finalize(): void {
        this.settings.finalize();
    }
}
