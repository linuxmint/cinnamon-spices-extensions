const Clutter = imports.gi.Clutter
const GLib = imports.gi.GLib
const GObject = imports.gi.GObject
const Gio = imports.gi.Gio
const St = imports.gi.St
const Util = imports.misc.util
const UPowerGlib = imports.gi.UPowerGlib
const Main = imports.ui.main
const ModalDialog = imports.ui.modalDialog
const Settings = imports.ui.settings
const Dialog = imports.ui.dialog

const UUID = "battery-guardian@beatlink"
const dialogTitle = "Low Battery Warning"

const SystemCommands = {
    'shutdown': ['systemctl', 'poweroff'],
    'suspend': ['systemctl', 'suspend'],
    'hibernate': ['systemctl', 'hibernate'],
}

// ── Sound Player ──────────────────────────────────────────────────────────────

var SoundPlayer = class {
    constructor() {
        this._playing = false
        this._loopId = null
        this._cancellable = null
        this._path = null
        this._isFile = false
        this.loopInterval = 3500
    }

    setSound(path) {
        this._path = path
        this._isFile = !!(path && path.includes('/'))
    }

    play() {
        if (this._playing) return
        this._playing = true

        const trigger = () => {
            if (!this._playing) return GLib.SOURCE_REMOVE
            try {
                if (this._cancellable) this._cancellable.cancel()
                this._cancellable = new Gio.Cancellable()
                let player = global.display.get_sound_player()

                if (this._isFile) {
                    player.play_from_file(Gio.File.new_for_path(this._path), 'bg-sound', this._cancellable)
                } else {
                    player.play_from_theme(this._path || 'alarm-clock-elapsed', 'bg-sound', this._cancellable)
                }
            } catch (e) {
                if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
                    global.logWarning("[" + UUID + "] Sound file not found: " + this._path)
                } else {
                    global.logError("[" + UUID + "] Sound player error: " + e.message)
                }
            }
            return GLib.SOURCE_CONTINUE
        }

        trigger()
        this._loopId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this.loopInterval, trigger)
    }

    stop() {
        this._playing = false
        if (this._loopId) {
            GLib.source_remove(this._loopId)
            this._loopId = null
        }
        if (this._cancellable) {
            this._cancellable.cancel()
            this._cancellable = null
        }
    }
}

// ── Stage 1: Modal Dialog ─────────────────────────────────────────────────────

var MainDialog = GObject.registerClass({
    GTypeName: 'BatteryGuardianMainDialog',
}, class MainDialog extends ModalDialog.ModalDialog {
    _init(onSave) {
        super._init({ styleClass: 'end-session-dialog', destroyOnClose: false })

        this._messageDialogContent = new Dialog.MessageDialogContent()
        this.contentLayout.add_child(this._messageDialogContent)
        this._messageDialogContent.title = dialogTitle

        this.setButtons([{
            label: 'Save Unfinished Work',
            action: () => onSave(),
            key: Clutter.KEY_Escape
        }])
    }

    update(message) {
        this._messageDialogContent.description = message
    }

    destroy() {
        this.close()
        super.destroy()
    }
})

// ── Stage 2: Floating Overlay ─────────────────────────────────────────────────

var FloatingDialog = class {
    constructor() {
        // Create a container that mimics the look of a dialog window
        this.actor = new St.BoxLayout({
            style_class: 'end-session-dialog', // Reuses Cinnamon's dialog styling
            style: 'padding: 12px; border-radius: 12px; background-color: #2f2f2f;',
            vertical: true,
            reactive: true
        })
        this._messageDialogContent = new Dialog.MessageDialogContent()
        this._messageDialogContent.title = dialogTitle
        this.actor.add_child(this._messageDialogContent)
        Main.layoutManager.addChrome(this.actor, { visibleInFullscreen: true })
        this._signalId = this.actor.connect('notify::allocation', () => this._position())
    }

    _position() {
        let monitor = Main.layoutManager.primaryMonitor
        let x = monitor.x + monitor.width - this.actor.width - 20
        let y = monitor.y + monitor.height - this.actor.height - 40
        this.actor.set_position(Math.floor(x), Math.floor(y))
    }

    update(message) {
        this._messageDialogContent.description = message
    }

    destroy() {
        if (this.actor) {
            if (this._signalId) this.actor.disconnect(this._signalId)
            Main.layoutManager.removeChrome(this.actor)
            this.actor.destroy()
            this.actor = null
        }
    }
}

// ── Controller ────────────────────────────────────────────────────────────────

class BatteryGuardianExtension {
    constructor(metadata) {
        this.metadata = metadata
        this._dialog = null
        this._timerId = null
        this._device = null
        this._soundPlayer = new SoundPlayer()
        this._defaultSoundPath = GLib.build_filenamev([metadata.path, 'sounds', 'countdown.ogg'])
        this._settings = new Settings.ExtensionSettings(this, UUID)

        // Centralized bindings
        this._settings.bindProperty(Settings.BindingDirection.IN, 'sound-loop-interval', '_loopInterval', () => this._onLoopIntervalChanged(), null)
        this._settings.bindProperty(Settings.BindingDirection.IN, 'sound-file', '_soundFile', () => this._updateSound(), null)
        this._settings.bindProperty(Settings.BindingDirection.IN, 'battery-threshold', '_threshold', () => this._onBatteryChanged(), null)
        this._settings.bindProperty(Settings.BindingDirection.IN, 'action', '_action', null, null)
        this._settings.bindProperty(Settings.BindingDirection.IN, 'countdown-duration', '_countdownDuration', null, null)
        this._settings.bindProperty(Settings.BindingDirection.IN, 'test-mode', '_testMode', null, null)

        this._upower = new UPowerGlib.Client()
        this._updateSound()
    }

    _getFormattedMessage() {
        return `Your system will ${this._action} in ${this._currentTime} seconds.\n` +
            `Either connect to external power or save your unfinished work.`
    }

    _updateUI() {
        if (this._dialog) {
            this._dialog.update(this._getFormattedMessage())
        }
    }

    _onLoopIntervalChanged() {
        this._soundPlayer.loopInterval = this._loopInterval
        if (this._soundPlayer._playing) {
            this._soundPlayer.stop()
            this._soundPlayer.play()
        }
    }

    _updateSound() {
        let path = this._defaultSoundPath
        if (this._soundFile) {
            try {
                let actualPath = this._soundFile.startsWith('file://')
                    ? GLib.filename_from_uri(this._soundFile, null)[0]
                    : this._soundFile
                path = actualPath
            } catch (e) {
                global.logError("[" + UUID + "] Path conversion error: " + e)
            }
        }
        this._soundPlayer.setSound(path)
        this._soundPlayer.loopInterval = this._loopInterval || 3500
    }

    enable() {
        this._device = this._upower.get_display_device()
        if (this._device) {
            this._sigPct = this._device.connect('notify::percentage', () => this._onBatteryChanged())
            this._sigState = this._device.connect('notify::state', () => this._onBatteryChanged())
            this._onBatteryChanged()
        }
    }

    _onBatteryChanged() {
        if (!this._device) return
        let state = this._device.state
        let onAC = (state === UPowerGlib.DeviceState.CHARGING || state === UPowerGlib.DeviceState.FULLY_CHARGED)

        if (onAC) {
            this._stopLogic()
        } else if (!this._timerId && this._device.percentage <= this._threshold) {
            this._startLogic()
        }
    }

    _startLogic() {
        this._currentTime = Math.floor(this._countdownDuration)
        this._soundPlayer.play()
        this._showMainDialog()

        this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            if (this._currentTime <= 0) {
                this._executeFinalAction()
                return GLib.SOURCE_REMOVE
            }
            this._currentTime--
            this._updateUI()
            return GLib.SOURCE_CONTINUE
        })
    }

    _showMainDialog() {
        if (this._dialog) this._dialog.destroy()
        this._dialog = new MainDialog(() => this._showFloatingDialog())
        this._updateUI()
        this._dialog.open()
    }

    _showFloatingDialog() {
        if (this._dialog) this._dialog.destroy()
        this._dialog = new FloatingDialog()
        this._updateUI()
    }

    _executeFinalAction() {
        this._stopLogic()
        if (this._testMode) {
            global.log("[" + UUID + "] Test Mode: Skipping execution of " + this._action)
            return
        }
        try {
            // trySpawn takes an array: ["command", "arg1", "arg2"]
            Util.trySpawn(SystemCommands[this._action])
        } catch (e) {
            global.logError("[" + UUID + "] Failed to execute " + this._action + ": " + e.message)
        }
    }

    _stopLogic() {
        if (this._timerId) {
            GLib.source_remove(this._timerId)
            this._timerId = null
        }
        this._soundPlayer.stop()
        if (this._dialog) {
            this._dialog.destroy()
            this._dialog = null
        }
    }

    disable() {
        this._stopLogic()
        if (this._device) {
            this._device.disconnect(this._sigPct)
            this._device.disconnect(this._sigState)
            this._device = null
        }
    }
}

// ── Entry points ──────────────────────────────────────────────────────────────

let guardian
function init(metadata) { guardian = new BatteryGuardianExtension(metadata) }
function enable() { guardian.enable() }
function disable() { guardian.disable() }