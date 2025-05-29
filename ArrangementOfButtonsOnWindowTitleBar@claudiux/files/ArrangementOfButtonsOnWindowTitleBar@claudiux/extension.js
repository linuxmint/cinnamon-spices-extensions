//!/usr/bin/cjs
const Main = imports.ui.main;
const Settings = imports.ui.settings;
const Gio = imports.gi.Gio;

const UUID = "ArrangementOfButtonsOnWindowTitleBar@claudiux";

const SCHEMA = "org.cinnamon.desktop.wm.preferences";
const KEY = "button-layout";

class MyExtension {
    constructor(meta) {
        this._meta = meta;
        this.enabled = false;
        this.layoutButton = "";
        this.layoutButtonSettings = new Gio.Settings({ schema_id: SCHEMA });
        this.layoutButtonSettings.connect("changed::"+KEY, () => { this._layoutChanged() });
        this.settings = new Settings.ExtensionSettings(this, UUID);
        this.settings.bind("useEM", "expertMode", (value) => { this._on_apply(value) });
        this.settings.bind("leftMenu", "leftMenu", (value) => { this._onLeftMenu(value) });
        this.settings.bind("leftClose", "leftClose", (value) => { this._onLeftClose(value) });
        this.settings.bind("rightClose", "rightClose", (value) => { this._onRightClose(value) });
        this.settings.bind("leftMaximize", "leftMaximize", (value) => { this._onLeftMaximize(value) });
        this.settings.bind("rightMaximize", "rightMaximize", (value) => { this._onRightMaximize(value) });
        this.settings.bind("leftMinimize", "leftMinimize", (value) => { this._onLeftMinimize(value) });
        this.settings.bind("rightMinimize", "rightMinimize", (value) => { this._onRightMinimize(value) });
        this.settings.bind("rightMenu", "rightMenu", (value) => { this._onRightMenu(value) });
        this.settings.bind("spacer", "spacer", () => { this._on_apply() });
        this.settings.bind("stringEM", "stringEM", (value) => { this._onStringEM(value) });
        this.settings.bind("applyChangesEM", "applyChangesEM", (value) => { this._onApplyChangesEM(value) });
        this.stringEM = this.layoutButtonSettings.get_string(KEY);
        this.applyChangesEM = false;
        this._layoutChanged();
    }

    enable() {
        this.enabled = true;
    }

    disable() {
        this.enabled = false;
    }

    _onLeftMenu(value) {
        this._changeOtherValueLater(value, 'rightMenu');
    }

    _onRightMenu(value) {
        this._changeOtherValueLater(value, 'leftMenu');
    }

    _onLeftClose(value) {
        this._changeOtherValueLater(value, 'rightClose');
    }

    _onRightClose(value) {
        this._changeOtherValueLater(value, 'leftClose');
    }

    _onLeftMaximize(value) {
        this._changeOtherValueLater(value, 'rightMaximize');
    }

    _onRightMaximize(value) {
        this._changeOtherValueLater(value, 'leftMaximize');
    }

    _onLeftMinimize(value) {
        this._changeOtherValueLater(value, 'rightMinimize');
    }

    _onRightMinimize(value) {
        this._changeOtherValueLater(value, 'leftMinimize');
    }

    _changeOtherValueLater(value, name){
        let _to = setTimeout( () => {
                clearTimeout(_to);
                if (value === true)
                    this.settings.setValue(name, false);
                this._on_apply();
            },
            2100
        );
    }

    _onStringEM(value) {
        this.applyChangesEM = false;
    }

    _onApplyChangesEM(value) {
        if (!value) return;

        this.layoutButtonSettings.set_string(KEY, this.stringEM);
        let _to = setTimeout( () => {
            clearTimeout(_to);
            this.applyChangesEM = false;
        }, 2100);
    }

    _layoutChanged() {
        if (this.expertMode) {
            let reg = this.layoutButtonSettings.get_string(KEY);
            if (reg !== this.stringEM)
                this.stringEM = reg;
            return;
        }
        this.layoutButton = this.layoutButtonSettings.get_string(KEY);
        let [leftStr, rightStr] = this.layoutButton.split(":");
        this.leftMenu = leftStr.includes("menu");
        this.leftClose = leftStr.includes("close");
        this.leftMaximize = leftStr.includes("maximize");
        this.leftMinimize = leftStr.includes("minimize");
        this.rightClose = rightStr.includes("close");
        this.rightMaximize = rightStr.includes("maximize");
        this.rightMinimize = rightStr.includes("minimize");
        this.rightMenu = rightStr.includes("menu");
        this.spacer = leftStr.includes("spacer") || rightStr.includes("spacer");
    }

    _on_apply(value=false) {
        if (!this.enabled) return;
        if (!value) {
            var leftPart = [];
            var rightPart = [];
            if (this.leftMenu) leftPart.push("menu");
            if (this.leftClose) leftPart.push("close");
            if (this.leftMaximize) leftPart.push("maximize");
            if (this.leftMinimize) leftPart.push("minimize");
            if (this.rightMinimize) rightPart.push("minimize");
            if (this.rightMaximize) rightPart.push("maximize");
            if (this.rightClose) rightPart.push("close");
            if (this.rightMenu) rightPart.push("menu");

            if (this.spacer === true) {
                if (leftPart.length === 4) {
                    leftPart.splice(1, 0, "spacer");
                    leftPart.splice(3, 0, "spacer");
                    leftPart.splice(5, 0, "spacer");
                } else if (leftPart.length === 3) {
                    leftPart.splice(1, 0, "spacer");
                    leftPart.splice(3, 0, "spacer");
                } else if (leftPart.length === 2) {
                    leftPart.splice(1, 0, "spacer");
                }
                if (rightPart.length === 4) {
                    rightPart.splice(1, 0, "spacer");
                    rightPart.splice(3, 0, "spacer");
                    rightPart.splice(5, 0, "spacer");
                } else if (rightPart.length === 3) {
                    rightPart.splice(1, 0, "spacer");
                    rightPart.splice(3, 0, "spacer");
                } else if (rightPart.length === 2) {
                    rightPart.splice(1, 0, "spacer");
                }
            }

            let layoutStr = leftPart.join(",") + ":" + rightPart.join(",");

            this.layoutButtonSettings.set_string(KEY, layoutStr);
            let _to = setTimeout( () => {
                clearTimeout(_to);
                this.stringEM = layoutStr;
            }, 2100);
        } else {
            let _to = setTimeout( () => {
                clearTimeout(_to);
                this.stringEM = this.layoutButtonSettings.get_string(KEY);
            }, 2100);
        }
    }
}

let extension = null;

function enable() {
    try {
        extension.enable();
    } catch (err) {
        extension.disable();
        throw err;
    }
}

function disable() {
    try {
        extension.disable();
    } catch (err) {
        global.logError(err);
    } finally {
        extension = null;
    }
}

function init(metadata) {
    extension = new MyExtension(metadata);
}
