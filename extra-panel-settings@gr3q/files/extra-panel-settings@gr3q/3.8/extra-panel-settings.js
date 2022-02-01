var extraPanelSettings;
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	// The require scope
/******/ 	var __webpack_require__ = {};
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  "Extension": () => (/* binding */ Extension),
  "disable": () => (/* binding */ disable),
  "enable": () => (/* binding */ enable),
  "init": () => (/* binding */ init)
});

;// CONCATENATED MODULE: ./src/3_8/config.ts
const { ExtensionSettings } = imports.ui.settings;
const CONFIG_KEYS = {
    CUSTOM_FONT: "panelFont"
};
class Config {
    constructor(app) {
        this.panelFont = null;
        this.panelFontSize = null;
        this.settings = new ExtensionSettings(this, 'extra-panel-settings@gr3q');
        this.app = app;
    }
    get PanelFont() {
        return this.panelFont;
    }
    get PanelFontSize() {
        return this.panelFontSize;
    }
    Enable() {
        this.settings.bind(CONFIG_KEYS.CUSTOM_FONT, "_" + CONFIG_KEYS.CUSTOM_FONT, () => {
            this.ProcessSelectedFont();
            this.app.UpdateCurrentFont();
        });
        this.ProcessSelectedFont();
    }
    Disable() {
        let key;
        for (key in CONFIG_KEYS) {
            this.settings.unbindAll(CONFIG_KEYS[key]);
        }
    }
    ProcessSelectedFont() {
        if (this._panelFont == "") {
            this.panelFont = null;
            this.panelFontSize = null;
            return;
        }
        const words = this._panelFont.split(" ");
        this.panelFontSize = parseFloat(words[words.length - 1]);
        const fontName = [];
        for (const word of words.slice(0, words.length - 1)) {
            if (word.includes("=")) {
                continue;
            }
            fontName.push(word);
        }
        this.panelFont = fontName.join(" ");
    }
}

;// CONCATENATED MODULE: ./src/3_8/extension.ts

const { panelManager } = imports.ui.main;
class Extension {
    constructor() {
        this.originalPanelStyles = [];
        this.enabled = false;
        this.panelsChangedKey = null;
        this.UpdateCurrentFont = () => {
            var _a;
            if (this.settings.PanelFont == null) {
                this.CleanupCurrentFont();
            }
            else {
                for (const panel of panelManager.getPanels()) {
                    if (panel == null)
                        continue;
                    if (this.originalPanelStyles[panel.panelId] == null) {
                        this.originalPanelStyles[panel.panelId] = panel.actor.style;
                    }
                    panel.actor.style = ((_a = this.originalPanelStyles[panel.panelId]) !== null && _a !== void 0 ? _a : "") + `font-family: ${this.settings.PanelFont};`;
                }
            }
        };
        this.CleanupCurrentFont = () => {
            for (const panel of panelManager.getPanels()) {
                if (panel == null)
                    continue;
                panel.actor.style = this.originalPanelStyles[panel.panelId];
            }
            this.originalPanelStyles = [];
        };
        this.settings = new Config(this);
    }
    Enable() {
        this.enabled = true;
        this.settings.Enable();
        this.UpdateCurrentFont();
        this.panelsChangedKey = global.settings.connect("changed::panels-enabled", () => {
            this.UpdateCurrentFont();
        });
    }
    Disable() {
        this.settings.Disable();
        this.CleanupCurrentFont();
        if (this.panelsChangedKey != null) {
            global.settings.disconnect(this.panelsChangedKey);
            this.panelsChangedKey = null;
        }
    }
}
let app;
const init = (meta) => {
    app = new Extension();
};
const enable = () => {
    app.Enable();
};
const disable = () => {
    app.Disable();
};

extraPanelSettings = __webpack_exports__;
/******/ })()
;