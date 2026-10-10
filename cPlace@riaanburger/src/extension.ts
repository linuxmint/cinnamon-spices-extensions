// The engine: the extension around the arrangement contract. It owns the
// settings, the hotkey, and the chooser the hotkey opens; the chooser
// gathers, previews and applies through the pure arrangement. Foreign
// snake_case Muffin calls stay in the engine modules, and a value takes our
// name the moment it crosses into contract types.

import { registerDevHandle, removeDevHandle } from "./dev-handle";
import { apply, forgetUndo, undo } from "./engine/apply";
import { Chooser } from "./engine/chooser";
import { cascadePage } from "./engine/pages/cascade";
import { columnsPage } from "./engine/pages/columns";
import { gridPage } from "./engine/pages/grid";
import { recordedPage } from "./engine/pages/recorded";
import { EngineSettings } from "./engine/settings";
import { bindTranslations, unbindTranslations } from "./i18n";

const UUID = "cPlace@riaanburger";
const HOTKEY_ID = "cPlace-place";

let engineSettings: EngineSettings | null = null;
let chooser: Chooser | null = null;
let hotkeyRegistered = false;

function registerHotkey(): void {
    if (engineSettings === null) {
        return;
    }
    if (hotkeyRegistered) {
        imports.ui.main.keybindingManager.removeHotKey(HOTKEY_ID);
    }
    imports.ui.main.keybindingManager.addHotKey(
        HOTKEY_ID,
        engineSettings.placeHotkey,
        () => {
            chooser?.toggle();
        },
    );
    hotkeyRegistered = true;
}

export function init(): void {
    global.log(`${UUID}: init`);
}

export function enable(): void {
    bindTranslations(UUID);
    engineSettings = new EngineSettings(UUID, () => {
        registerHotkey();
    });
    chooser = new Chooser(
        [
            cascadePage(engineSettings),
            columnsPage(engineSettings),
            gridPage(engineSettings),
            recordedPage(engineSettings),
        ],
        engineSettings,
        (targets, liveWindows) => {
            apply(targets, liveWindows);
        },
        () => {
            undo();
        },
    );
    registerHotkey();
    if (CPLACE_DEVELOPMENT) {
        registerDevHandle(chooser, engineSettings);
    }
    global.log(
        `${UUID}: enabled, ${engineSettings.placeHotkey} opens the chooser`,
    );
}

export function disable(): void {
    if (hotkeyRegistered) {
        imports.ui.main.keybindingManager.removeHotKey(HOTKEY_ID);
        hotkeyRegistered = false;
    }
    if (chooser !== null) {
        chooser.dispose();
        chooser = null;
    }
    if (engineSettings !== null) {
        engineSettings.finalize();
        engineSettings = null;
    }
    if (CPLACE_DEVELOPMENT) {
        removeDevHandle();
    }
    forgetUndo();
    unbindTranslations();
    global.log(`${UUID}: disabled`);
}
