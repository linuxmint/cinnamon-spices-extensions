import { Extension } from "./extension";

const { ExtensionSettings } = imports.ui.settings;

const CONFIG_KEYS = {
    CUSTOM_FONT: "panelFont"
}

export class Config {
    private readonly _panelFont!: string;

    private panelFont: string | null = null;
    public get PanelFont(): string | null {
        return this.panelFont;
    }

    private panelFontSize: number | null = null;
    public get PanelFontSize(): number | null {
        return this.panelFontSize;
    }

    settings = new ExtensionSettings(this, 'extra-panel-settings@gr3q');
    private readonly app: Extension; 

    constructor(app: Extension) {
        this.app = app;
    }

    Enable() {
        this.settings.bind(CONFIG_KEYS.CUSTOM_FONT, "_" + CONFIG_KEYS.CUSTOM_FONT, () => {
            this.ProcessSelectedFont();
            this.app.UpdateCurrentFont();
        });

        this.ProcessSelectedFont();
    }

    Disable() {
        let key: keyof typeof CONFIG_KEYS;
        for (key in CONFIG_KEYS) {
            this.settings.unbindAll(CONFIG_KEYS[key]);
        }
    }

    private ProcessSelectedFont() {
        if (this._panelFont == "") {
            this.panelFont = null;
            this.panelFontSize = null;
            return;
        }

        const words = this._panelFont.split(" ");

        this.panelFontSize = parseFloat(words[words.length - 1]);

        // Parse special stuff in Font
        const fontName: string[] = [];
        for (const word of words.slice(0, words.length - 1)) {
            if (word.includes("=")) {
                continue;
            }
            fontName.push(word);
        }
        this.panelFont = fontName.join(" ");
    }
}