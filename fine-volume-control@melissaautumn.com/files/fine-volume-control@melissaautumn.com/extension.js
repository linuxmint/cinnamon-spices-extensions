/*
Fine Volume Control by Melissa Autumn
*/
const Cvc = imports.gi.Cvc;
const Main = imports.ui.main;
const Lang = imports.lang;
const Settings = imports.ui.settings;  // Needed for settings API
const Gio = imports.gi.Gio;

// Some ugly globals
let key_volume_up = null;
let key_volume_down = null;
let settings = null;
let mixer_control = null;

let selected_stream = null;
let streams = [];

let UUID = null;

let volume_step = 1;

// Icons (found in /usr/share/icons/Mint-Y/status/symbolic)
const icon_vol_mute = Gio.ThemedIcon.new("audio-status-volume-muted-symbolic");
const icon_vol_low = Gio.ThemedIcon.new("audio-status-volume-low-symbolic");
const icon_vol_medium = Gio.ThemedIcon.new("audio-status-volume-medium-symbolic");
const icon_vol_high = Gio.ThemedIcon.new("audio-status-volume-high-symbolic");

/**
 * called when extension is loaded
 */
function init(extensionMeta) {
  //extensionMeta holds your metadata.json info
  this.UUID = extensionMeta['uuid'];

  // Setup the settings
  this.settings = new Settings.ExtensionSettings(this, this.UUID);
  this.settings.bind("volume-up", "key_volume_up", this.on_keybinding_changed);
  this.settings.bind("volume-down", "key_volume_down", this.on_keybinding_changed);
  this.settings.bind("volume-steps", "volume_step", this.on_step_changed);

  // Open the mixer, so we can play with some audio streams
  this.mixer_control = new Cvc.MixerControl({name: 'Cinnamon Volume Control'});
  this.mixer_control.open();
  this.mixer_control.connect('stream-added', (...args) => this.onStreamAdded(...args));
  this.mixer_control.connect('stream-removed', (...args) => this.onStreamRemoved(...args));
  this.mixer_control.connect('stream-changed', (...args) => this.onStreamChanged(...args));
}

/**
 * called when extension is loaded
 */
function enable() {
  this.on_keybinding_changed();
}

/**
 * Called on Volume Up/Down keybind change
 */
function on_keybinding_changed() {
  // Remove them first (in case of step change!)
  Main.keybindingManager.removeHotKey(`fvc-volume-up-${this.UUID}`);
  Main.keybindingManager.removeHotKey(`fvc-volume-down-${this.UUID}`);

  Main.keybindingManager.addHotKey(`fvc-volume-up-${this.UUID}`, this.key_volume_up, Lang.bind(this, this.volume_up));
  Main.keybindingManager.addHotKey(`fvc-volume-down-${this.UUID}`, this.key_volume_down, Lang.bind(this, this.volume_down));
}

/**
 * Called on Volume Step setting change
 */
function on_step_changed() {
  // Refresh the key bindings
  this.on_keybinding_changed();
}

/**
 * Helper function to return icons
 * @param volume
 * @returns {*}
 */
function get_icon_from_volume(volume) {
  if (volume === 0) {
    return this.icon_vol_mute;
  }

  if (volume <= 25) {
    return this.icon_vol_low;
  }

  if (volume <= 75) {
    return this.icon_vol_medium;
  }

  return this.icon_vol_high
}

/**
 * Normalizes the volume, clamps it 0-100, and rounds it
 * @param volume
 * @param adjustment
 * @returns {number}
 */
function validate_volume(volume, adjustment) {
  // My device is 0 - 65536, so we need to normalize it
  volume = (volume * 100) / this.mixer_control.get_vol_max_norm();

  // Now make the adjustment!
  volume += adjustment;

  // Clamp to 0 - 100
  volume = Math.min(volume, 100);
  volume = Math.max(volume, 0);

  // Make it nice and whole! (TODO: Do we want half values?)
  volume = Math.round(volume);

  return volume;
}

/**
 * Un-normalizes the volume and pushes it out to Mint
 * @param stream
 * @param volume
 */
function set_volume(stream, volume) {
  volume = (volume / 100) * this.mixer_control.get_vol_max_norm();

  stream.volume = volume;
  stream.push_volume();
}

/**
 * Called on Volume Up keybind
 */
function volume_up() {
  // No stream yet!
  if (!this.selected_stream) {
    return;
  }

  const volume = this.validate_volume(this.selected_stream.volume, this.volume_step);
  Main.osdWindowManager.show(-1, this.get_icon_from_volume(volume), volume);
  this.set_volume(this.selected_stream, volume);
}

/**
 * Called on Volume Down keybind
 */
function volume_down() {
  // No stream yet!
  if (!this.selected_stream) {
    return;
  }

  const volume = this.validate_volume(this.selected_stream.volume, -this.volume_step);
  Main.osdWindowManager.show(-1, this.get_icon_from_volume(volume), volume);
  this.set_volume(this.selected_stream, volume);
}

/**
 * called when extension gets disabled
 */
function disable() {
  this.settings.finalize();
  this.settings = null;
}

function onStreamAdded(control, id) {
  // Update the stream
  this.selected_stream = this.mixer_control.get_default_sink();
}
function onStreamRemoved(control, id) {
 // Empty right now
}
function onStreamChanged(control, id) {
  this.onStreamRemoved(control, id);
  this.onStreamAdded(control, id);
}