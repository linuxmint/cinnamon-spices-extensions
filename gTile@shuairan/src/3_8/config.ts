import { App } from "./extension";
import { GridSettingsButton } from "./ui/GridSettingsButton";

const Settings = imports.ui.settings;
const Main = imports.ui.main;

export class Config {
    private app: App;
    public gridSettingsButton: GridSettingsButton[] = [];
    private settings: imports.ui.settings.ExtensionSettings;

    public readonly hotkey!: string;
    public readonly lastGridRows!: number;
    public readonly lastGridCols!: number;
    public readonly animation!: boolean;
    public readonly autoclose!: boolean;
    public readonly gridbutton1x!: number;
    public readonly gridbutton1y!: number;
    public readonly gridbutton2x!: number;
    public readonly gridbutton2y!: number;
    public readonly gridbutton3x!: number;
    public readonly gridbutton3y!: number;
    public readonly gridbutton4x!: number;
    public readonly gridbutton4y!: number;
    public readonly nbRows!: number;
    public readonly nbCols!: number;

    constructor(app: App) {
        this.app = app;

        this.settings = new Settings.ExtensionSettings(this, 'gTile@shuairan');
        //hotkey
        this.settings.bindProperty(Settings.BindingDirection.IN, 'hotkey', 'hotkey', this.EnableHotkey, null);
        //grid (nbCols and nbRows)
        this.settings.bindProperty(Settings.BindingDirection.OUT, 'lastGridRows', 'nbCols');
        this.settings.bindProperty(Settings.BindingDirection.OUT, 'lastGridCols', 'nbRows');

        this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL, 'animation', 'animation', this.updateSettings, null);
        this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL, 'autoclose', 'autoclose', this.updateSettings, null);

        let basestr = 'gridbutton';

        this.initGridSettings();

        for (let i = 1; i <= 4; i++) {
            let sgbx = basestr + i + 'x';
            let sgby = basestr + i + 'y';
            this.settings.bindProperty(Settings.BindingDirection.IN, sgbx, sgbx, this.updateGridSettings, null);
            this.settings.bindProperty(Settings.BindingDirection.IN, sgby, sgby, this.updateGridSettings, null);
        }

        this.EnableHotkey();
    }

    private EnableHotkey = () => {
        this.DisableHotkey();
        Main.keybindingManager.addHotKey('gTile', this.hotkey, this.app.ToggleUI);
    }
    
    private DisableHotkey = () => {
        Main.keybindingManager.removeHotKey('gTile');
    }

    private updateSettings = () => {
        this.app.Grid.UpdateSettingsButtons();
    }
    
    private initGridSettings = () => {
        let basestr = 'gridbutton';
        for (let i = 1; i <= 4; i++) {
            let sgbx = basestr + i + 'x';
            let sgby = basestr + i + 'y';
            let gbx = this.settings.getValue(sgbx);
            let gby = this.settings.getValue(sgby);
            this.gridSettingsButton.push(new GridSettingsButton(this.app, gbx + 'x' + gby, gbx, gby));
        }
    }
    
    private updateGridSettings = () => {
        this.gridSettingsButton = [];
        this.initGridSettings();
        this.app.Grid.RebuildGridSettingsButtons();
    }

    public destroy = () => {
        this.DisableHotkey();
    }
}