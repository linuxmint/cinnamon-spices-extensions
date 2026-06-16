const St = imports.gi.St;
const Main = imports.ui.main;
const GLib = imports.gi.GLib;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Settings = imports.ui.settings;

let osds = [];
let signalSubscriptionId = null;
let settings = null;
let timeoutId = null;

let settingsValues = {
    show_on_all_monitors: false,
    timeout_ms: 3000,
    popup_position: 'center',
    font_size: 32,
    padding_vertical: 24,
    padding_horizontal: 32,
    margin_vertical: 32,
    margin_horizontal: 32,
    border_radius: 12,
    bg_opacity: 75,
    text_color: 'rgb(255,255,255)',
    bg_color: 'rgb(50,50,50)',
    border_color: 'rgb(50,50,50)'
};

function init(metadata) {}

function enable() {
    global.log('LayoutPopup: Активация.');

    try {
        settings = new Settings.ExtensionSettings(settingsValues, 'key-switcher-popup@dmitriy71n');
        settings.bind('show_on_all_monitors', 'show_on_all_monitors', () => {});
        settings.bind('timeout_ms', 'timeout_ms', () => {});
        settings.bind('popup_position', 'popup_position', () => {});
        settings.bind('font_size', 'font_size', () => {});
        settings.bind('padding_vertical', 'padding_vertical', () => {});
        settings.bind('padding_horizontal', 'padding_horizontal', () => {});
        settings.bind('margin_vertical', 'margin_vertical', () => {});
        settings.bind('margin_horizontal', 'margin_horizontal', () => {});
        settings.bind('border_radius', 'border_radius', () => {});
        settings.bind('bg_opacity', 'bg_opacity', () => {});
        settings.bind('text_color', 'text_color', () => {});
        settings.bind('bg_color', 'bg_color', () => {});
        settings.bind('border_color', 'border_color', () => {});
        
        global.log('LayoutPopup: Связь с GUI настроек успешно установлена.');
    } catch (e) {
        global.logError('LayoutPopup: Критическая ошибка связи с настройками: ' + e.message);
    }

    try {
        const sessionBus = Gio.bus_get_sync(Gio.BusType.SESSION, null);
        signalSubscriptionId = sessionBus.signal_subscribe(
            null,
            'org.Cinnamon',
            'CurrentInputSourceChanged',
            '/org/Cinnamon',
            null,
            Gio.DBusSignalFlags.NONE,
            _onCinnamonDbusSignal
        );
    } catch (e) {
        global.logError('LayoutPopup: Ошибка подписки на D-Bus: ' + e.message);
    }
}

function disable() {
    if (signalSubscriptionId) {
        try {
            const sessionBus = Gio.bus_get_sync(Gio.BusType.SESSION, null);
            sessionBus.signal_unsubscribe(signalSubscriptionId);
        } catch (e) {}
        signalSubscriptionId = null;
    }

    if (timeoutId) {
        GLib.source_remove(timeoutId);
        timeoutId = null;
    }
    destroyAllOSDs();

    if (settings) {
        settings.finalize();
        settings = null;
    }
}

function _onCinnamonDbusSignal(connection, sender_name, object_path, interface_name, signal_name, parameters) {
    try {
        if (parameters.n_children() > 0) {
            const rawVariant = parameters.get_child_value(0);
            const rawLangCode = rawVariant.get_string()[0];

            let lang = rawLangCode.toUpperCase();
            if (lang === 'US') lang = 'EN';

            if (timeoutId) {
                GLib.source_remove(timeoutId);
                timeoutId = null;
            }

            showLayoutPopup(lang);
        }
    } catch (e) {
        global.logError('LayoutPopup: Ошибка обработки сигнала: ' + e.message);
    }
}

function showLayoutPopup(text) {
    destroyAllOSDs();

    let targets = [];

    if (settingsValues.show_on_all_monitors) {
        const monitors = Main.layoutManager.monitors;
        if (monitors && monitors.length > 0) {
            for (let i = 0; i < monitors.length; i++) {
                targets.push(monitors[i]);
            }
        }
    } else {
        const currentMonitor = getMonitorAtMousePosition();
        if (currentMonitor) {
            targets.push(currentMonitor);
        }
    }

    if (targets.length === 0) return;

    let systemFont = 'sans-serif';
    try {
        const ifaceSettings = new Gio.Settings({ schema: 'org.cinnamon.desktop.interface' });
        const fontName = ifaceSettings.get_string('font-name');
        if (fontName) {
            const parts = fontName.trim().split(' ');
            if (parts.length > 1 && !isNaN(parseFloat(parts[parts.length - 1]))) {
                parts.pop();
            }
            systemFont = parts.join(' ') || 'sans-serif';
        }
    } catch (e) {}

    let alpha = settingsValues.bg_opacity / 100;
    let bg = settingsValues.bg_color;
    let finalBgColor = bg;

    if (bg.startsWith('rgb(')) {
        finalBgColor = bg.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
    } else if (bg.startsWith('#')) {
        let hex = bg.replace('#', '');
        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        let r = parseInt(hex.substring(0, 2), 16);
        let g = parseInt(hex.substring(2, 4), 16);
        let b = parseInt(hex.substring(4, 6), 16);
        finalBgColor = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    const containerStyle = `
        background-color: ${finalBgColor};
        border-radius: ${settingsValues.border_radius}px;
        border: 1px solid ${settingsValues.border_color};
        padding: ${settingsValues.padding_vertical}px ${settingsValues.padding_horizontal}px;
    `;

    const labelStyle = `
        font-family: "${systemFont}";
        font-size: ${settingsValues.font_size}px;
        font-weight: bold;
        color: ${settingsValues.text_color};
    `;

    targets.forEach(monitor => {
        let container = new St.BoxLayout({
            style: containerStyle,
            reactive: false,
        });

        let label = new St.Label({
            style: labelStyle,
            text: text
        });

        container.add_actor(label);

        Main.uiGroup.add_child(container);
        container.raise_top();

        let [, naturalWidth] = container.get_preferred_width(-1);
        let [, naturalHeight] = container.get_preferred_height(-1);

        let marginX = settingsValues.margin_horizontal;
        let marginY = settingsValues.margin_vertical;

        let x = monitor.x + marginX;
        let y = monitor.y + marginY;

        switch (settingsValues.popup_position) {
            case 'top_right':
                x = monitor.x + monitor.width - naturalWidth - marginX;
                y = monitor.y + marginY;
                break;
            case 'bottom_right':
                x = monitor.x + monitor.width - naturalWidth - marginX;
                y = monitor.y + monitor.height - naturalHeight - marginY;
                break;
            case 'bottom_left':
                x = monitor.x + marginX;
                y = monitor.y + monitor.height - naturalHeight - marginY;
                break;
            case 'top_center':
                x = monitor.x + (monitor.width - naturalWidth) / 2;
                y = monitor.y + marginY;
                break;
            case 'bottom_center':
                x = monitor.x + (monitor.width - naturalWidth) / 2;
                y = monitor.y + monitor.height - naturalHeight - marginY;
                break;
            case 'center':
                x = monitor.x + (monitor.width - naturalWidth) / 2;
                y = monitor.y + (monitor.height - naturalHeight) / 2;
                break;
            case 'top_left':
            default:
                x = monitor.x + marginX;
                y = monitor.y + marginY;
                break;
        }

        container.set_position(Math.round(x), Math.round(y));

        container.opacity = 0;
        container.ease({
            opacity: 255,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        osds.push(container);
    });

    timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, settingsValues.timeout_ms, () => {
        hideAllOSDs();
        timeoutId = null;
        return GLib.SOURCE_REMOVE;
    });
}

function hideAllOSDs() {
    if (osds.length === 0) return;
    osds.forEach(osd => {
        if (osd && !osd.is_finalized()) {
            osd.ease({
                opacity: 0,
                duration: 250,
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => {
                    if (osd && !osd.is_finalized()) osd.destroy();
                }
            });
        }
    });
    osds = [];
}

function destroyAllOSDs() {
    if (osds.length === 0) return;
    osds.forEach(osd => {
        if (osd && !osd.is_finalized()) osd.destroy();
    });
    osds = [];
}

function getMonitorAtMousePosition() {
    try {
        const [mouseX, mouseY] = global.get_pointer();
        const monitors = Main.layoutManager.monitors;
        for (let i = 0; i < monitors.length; i++) {
            const mon = monitors[i];
            if (mouseX >= mon.x && mouseX < mon.x + mon.width &&
                mouseY >= mon.y && mouseY < mon.y + mon.height) {
                return mon;
            }
        }
    } catch (e) {
        global.logError('LayoutPopup: Ошибка определения монитора: ' + e.message);
    }
    return Main.layoutManager.primaryMonitor;
}