// Cinnamon port by Kevin Langman 2024

//////////////////////////////////////////////////////////////////////////////////////////
//          )                                                   (                       //
//       ( /(   (  (               )    (       (  (  (         )\ )    (  (            //
//       )\()) ))\ )(   (         (     )\ )    )\))( )\  (    (()/( (  )\))(  (        //
//      ((_)\ /((_|()\  )\ )      )\  '(()/(   ((_)()((_) )\ )  ((_)))\((_)()\ )\       //
//      | |(_|_))( ((_)_(_/(    _((_))  )(_))  _(()((_|_)_(_/(  _| |((_)(()((_|(_)      //
//      | '_ \ || | '_| ' \))  | '  \()| || |  \ V  V / | ' \)) _` / _ \ V  V (_-<      //
//      |_.__/\_,_|_| |_||_|   |_|_|_|  \_, |   \_/\_/|_|_||_|\__,_\___/\_/\_//__/      //
//                                 |__/                                                 //
//////////////////////////////////////////////////////////////////////////////////////////

// SPDX-FileCopyrightText: Simon Schneegans <code@simonschneegans.de>
// SPDX-License-Identifier: GPL-3.0-or-later

'use strict';

const AperturePanels = require('./effects/AperturePanels.js');
const Apparition = require('./effects/Apparition.js');
const AuraGlow = require('./effects/AuraGlow.js');
//const BrokenGlass = require('./effects/BrokenGlass.js');
const Doom = require('./effects/Doom.js');
const EnergizeA = require('./effects/EnergizeA.js');
const EnergizeB = require('./effects/EnergizeB.js');
const Fire = require('./effects/Fire.js');
const Focus = require('./effects/Focus.js');
const Glide = require('./effects/Glide.js');
const Glitch = require('./effects/Glitch.js');
const Hexagon = require('./effects/Hexagon.js');
const Incinerate = require('./effects/Incinerate.js');
const MagicLamp = require('./effects/MagicLamp.js');
const Materialize = require('./effects/Materialize.js');
const Morph = require('./effects/Morph.js');
//const Matrix = require('./effects/Matrix.js');
const Mushroom = require('./effects/Mushroom.js');
//const PaintBrush = require('./effects/PaintBrush.js');
const Pixelate = require('./effects/Pixelate.js');
const PixelWheel = require('./effects/PixelWheel.js');
const PixelWipe = require('./effects/PixelWipe.js');
const Portal = require('./effects/Portal.js');
const RGBWarp = require('./effects/RGBWarp.js');
const Shredder = require('./effects/Shredder.js');
//const SnapOfDisintegration = require('./effects/SnapOfDisintegration.js');
const TeamRocket = require('./effects/TeamRocket.js');
//const TRexAttack = require('./effects/TRexAttack.js');
const TVEffect = require('./effects/TVEffect.js');
const TVGlitch = require('./effects/TVGlitch.js');
const VenetianBlinds = require('./effects/VenetianBlinds.js');
const Wisps = require('./effects/Wisps.js');
const Wormhole = require('./effects/Wormhole.js');

const ShouldAnimateManager = require("ShouldAnimateManager.js");
const Layers = require('./LayeredEffect.js');
const RaiseEffect = require('./RaiseEffect.js');
const ShaderModule = require('./Shader.js');
const ShaderFactoryModule = require('./ShaderFactory.js');

// The shared modules (effects/, LayeredEffect.js, ...) are loaded differently on
// Cinnamon 6.2 and 6.7.6+, so they don't import each other. Hand them the modules
// they need before anything gets constructed.
const SHARED_MODULES = {
  Shader:               ShaderModule,
  ShaderFactory:        ShaderFactoryModule.ShaderFactory,
  Layers:               Layers,
  LayeredEffect:        Layers.LayeredEffect,
  ShouldAnimateManager: ShouldAnimateManager,
};
for (const mod of [ShaderFactoryModule, RaiseEffect, AperturePanels, Apparition,
                   AuraGlow, Doom, EnergizeA, EnergizeB, Fire, Focus, Glide, Glitch,
                   Hexagon, Incinerate, MagicLamp, Materialize, Morph, Mushroom,
                   Pixelate, PixelWheel, PixelWipe, Portal, RGBWarp, Shredder,
                   TeamRocket, TVEffect, TVGlitch, VenetianBlinds, Wisps, Wormhole]) {
  mod.setModules(SHARED_MODULES);
}

const Main = imports.ui.main;
const Gio = imports.gi.Gio;
const Meta = imports.gi.Meta;
const Clutter = imports.gi.Clutter;
const GObject = imports.gi.GObject;
const Gettext = imports.gettext;
const GLib = imports.gi.GLib;
const Settings = imports.ui.settings;
const MessageTray = imports.ui.messageTray;
const St = imports.gi.St;
const Cinnamon = imports.gi.Cinnamon;
const Util = imports.misc.util;
const SignalManager = imports.misc.signalManager;
const UPowerGlib = imports.gi.UPowerGlib;
const SoundManager = imports.ui.soundManager;

const Effect = {
  AperturePanels: {idx: 27, name: "Aperture Panels"},
  Apparition:  {idx: 0,  name: "Apparition"},
  AuraGlow:    {idx: 22, name: "Aura Glow"},
  //BrokenGlass: {idx: 1,  name: "Broken Glass"},
  Doom:        {idx: 2,  name: "Doom"},
  EnergizeA:   {idx: 3,  name: "Energize A"},
  EnergizeB:   {idx: 4,  name: "Energize B"},
  Fire:        {idx: 5,  name: "Fire"},
  Focus:       {idx: 21, name: "Focus"},
  Glide:       {idx: 6,  name: "Glide"},
  Glitch:      {idx: 7,  name: "Glitch"},
  Hexagon:     {idx: 8,  name: "Hexagon"},
  Incinerate:  {idx: 9,  name: "Incinerate"},
  MagicLamp:   {idx: 26, name: "Magic Lamp"},
  Materialize: {idx: 30, name: "Materialize"},
  Morph:       {idx: 29, name: "Morph"},
  Mushroom:    {idx: 25, name: "Mushroom"},
  //Matrix:      {idx: 10, name: "Matrix"},
  //PaintBrush:  {idx: 11, name: "Paint Brush"},
  Pixelate:    {idx: 12, name: "Pixelate"},
  PixelWheel:  {idx: 13, name: "Pixel Wheel"},
  PixelWipe:   {idx: 14, name: "Pixel Wipe"},
  Portal:      {idx: 15, name: "Portal"},
  RGBWarp:     {idx: 24, name: "RGB Warp"},
  Shredder:    {idx: 31, name: "Shredder"},
  //SnapOfDisintegration: {idx: 16, name: "Snap Of Disintegration"},
  TeamRocket:  {idx: 23, name: "Team Rocket"},
  //TRexAttack:  {idx: 17, name: "TRex Attack"},
  TVEffect:    {idx: 18, name: "TV Effect"},
  TVGlitch:    {idx: 19, name: "TV Glitch"},
  VenetianBlinds: {idx: 32, name: "Venetian Blinds"},
  Wisps:       {idx: 20, name: "Wisps"},
  Wormhole:    {idx: 28, name: "Wormhole"},
  Randomized:  {idx: 999, name: "Randomized"},
  None:        {idx: 1000, name: "None"}
}

function EffectIndex(name) {
  for (const [key, value] of Object.entries(Effect)) {
    if (name == value.name) return value.idx;
  }
  return(undefined);
}

// The settings an effect uses when the selector that chose it has custom settings for it (see the
// "effect-overrides" key and EffectSelector in CustomWidgets.py). Effects only call getValue(), so this
// can be passed anywhere the settings object is. Keys without a custom value fall back to the global
// settings (i.e. keys added by a newer version of the extension since the custom values were saved).
// A new instance is created for every animation, so values that effects cache on the settings object
// (i.e. Fire's settings.fireColor) don't leak into the global settings or other animations.
class EffectProfile {
  constructor(settings, values) {
    this._settings = settings;
    this._values = values;
  }

  getValue(key) {
    if (Object.prototype.hasOwnProperty.call(this._values, key))
      return this._values[key];
    return this._settings.getValue(key);
  }
}

const UUID = "CinnamonBurnMyWindows@klangman";

// Effects that need extra canvas (getActorScale() other than (1,1)) get it from an unscaled
// canvas holding a 1:1 clone of the window, instead of scaling the window itself. Scaling the
// window caused a visible jump at the end of the animation on Cinnamon
const USE_UNSCALED_CANVAS  = true;        // false = old behaviour: scale the window actor
const CANVAS_BEHIND_MARGIN = 64;          // px around the window covered by the behind layer
// How Clutter splits the 3px offscreen-texture padding: see TEX_PADDING in LayeredEffect.js.
const CANVAS_TEX_PADDING   = Layers.TEX_PADDING;

var extensionThis;

Gettext.bindtextdomain(UUID, GLib.get_user_data_dir() + "/locale");

function _(text) {
  let locText = Gettext.dgettext(UUID, text);
  if (locText == text) {
    locText = window._(text);
  }
  return locText;
}

//////////////////////////////////////////////////////////////////////////////////////////
// This extensions modifies the window-close and window-open animations with all kinds  //
// of effects. The effects are implemented using GLSL shaders which are applied to the  //
// window's Clutter.Actor. The extension is actually very simple, much of the           //
// complexity comes from the fact that GNOME Shell usually does not show an animation   //
// when a window is closed in the overview. Several methods need to be monkey-patched   //
// to get this working. For more details, read the other comments in this file...       //
//////////////////////////////////////////////////////////////////////////////////////////

class BurnMyWindows {

   constructor(metaData){
      this.meta = metaData;
      this._minimizeConnected = false;
   }
   // ------------------------------------------------------------------------ public stuff

   // This function could be called after the extension is enabled, which could be done
   // from GNOME Tweaks, when you log in or when the screen is unlocked.
   enable() {
      // Create the settings and signal manager
      this._settings = new Settings.ExtensionSettings(this, this.meta.uuid)
      this._signalManager = new SignalManager.SignalManager(null);
      // Save the version number to the settings so that the About page can read it (is there a better way?)
      this._settings.setValue("ext-version", this.meta.version);

      // Rewrite every "effect name" combobox option lists (and the app-rules list's
      // per-column option lists) so they match the Effect const above. settings-schema.json
      // still ships its own copy of these lists so an upgrade does not overwrite the users
      // choices with the default value, but from here on the Effect const is the single source
      // of truth and settings-schema.json's copies never need to be hand-edited again.
      this._syncEffectOptions();

      // Get the UPower Display Device which we can use to determine the battery state/percentage
      this._upClient = new UPowerGlib.Client();
      this._upDisplayDevice = this._upClient.get_display_device();

      // Effects in this array must be ordered by effect number as defined by the setting-schema.json.
      // New effects will be added in alphabetical order in the UI list, but the effect number, and
      // therefore the order in this array, might not be alphabetical.
      this._ALL_EFFECTS = [
         new Apparition.Effect(),
         null, //new BrokenGlass.Effect(),
         new Doom.Effect(),
         new EnergizeA.Effect(),
         new EnergizeB.Effect(),
         new Fire.Effect(this._signalManager, this._settings),
         new Glide.Effect(),
         new Glitch.Effect(),
         new Hexagon.Effect(),
         new Incinerate.Effect(),
         null, //new Matrix.Effect(),
         null, //new PaintBrush.Effect(),
         new Pixelate.Effect(),
         new PixelWheel.Effect(),
         new PixelWipe.Effect(),
         new Portal.Effect(),
         null, //new SnapOfDisintegration.Effect(),
         null, //new TRexAttack.Effect(),
         new TVEffect.Effect(),
         new TVGlitch.Effect(),
         new Wisps.Effect(),
         new Focus.Effect(),
         new AuraGlow.Effect(),
         new TeamRocket.Effect(),
         new RGBWarp.Effect(),
         new Mushroom.Effect(this._signalManager, this._settings),
         new MagicLamp.Effect(),
         new AperturePanels.Effect(),
         new Wormhole.Effect(),
         new Morph.Effect(),
         new Materialize.Effect(),
         new Shredder.Effect(),
         new VenetianBlinds.Effect(),
      ];

      // We will use extensionThis to refer to the extension inside the patched methods.
      extensionThis = this;

      // Raise effects (see RaiseEffect.js). Only effects that say they support raising
      // (static supportsRaise()) are offered, so this list is built from _ALL_EFFECTS.
      this._raiseEffects = new Set();
      this._raiseWatcher = new RaiseEffect.RaiseWatcher(
         (entries) => this._startRaiseEffect(entries),
         () => this._endRaiseEffects());
      this._syncRaiseEffectOptions();
      this._bindCustom("raise-effect", "raiseEffect", this._enableRaiseEffects);
      this._bindCustom("power-raise-effect", "powerRaiseEffect", this._enableRaiseEffects);
      this._settings.bind("power-onbattery", "powerOnBattery", this._enableRaiseEffects);
      this._enableRaiseEffects();

      // Bind variables to setting effect values
      this._bindCustom("minimize-effect", "minimizeEffect", this._enableMinimizeEffects);
      this._bindCustom("unminimize-effect", "unminimizeEffect", this._enableMinimizeEffects);
      this._bindCustom("power-minimize-effect", "powerMinimizeEffect", this._enableMinimizeEffects);
      this._bindCustom("power-unminimize-effect", "powerUnminimizeEffect", this._enableMinimizeEffects);
      this._bindCustom("open-window-effect", "openEffect");
      this._bindCustom("dialog-open-effect", "dialogOpenEffect");
      this._bindCustom("power-open-effect", "powerOpenEffect");
      this._bindCustom("power-dialog-open-effect", "powerDialogOpenEffect");
      this._bindCustom("close-window-effect", "closeEffect");
      this._bindCustom("dialog-close-effect", "dialogCloseEffect");
      this._bindCustom("power-close-effect", "powerCloseEffect");
      this._bindCustom("power-dialog-close-effect", "powerDialogCloseEffect");
      this._settings.bind("enable-sound", "enableSound", this._enableSounds);

      // WindowTracker so we can map windows to application
      this._windowTracker = Cinnamon.WindowTracker.get_default();

      // Intercept _shouldAnimate() for Window Map/Destroy events
      this.shouldAnimateManager = new ShouldAnimateManager.ShouldAnimateManager( UUID );
      let error = this.shouldAnimateManager.connect(ShouldAnimateManager.Events.MapWindow+ShouldAnimateManager.Events.DestroyWindow, this._shouldAnimateHandler );

      // If we failed to install a handler for the _shouldAnimate() events then show a notification
      if (error) {
         let source = new MessageTray.Source(this.meta.name);
         let notification = new MessageTray.Notification(source, _("Error") + ": " + this.meta.name + " " + _("was NOT enabled"),
            _("The existing extension") + " " + error + " " + _("conflicts with this extension."),
            {icon: new St.Icon({icon_name: "cinnamon-burn-my-window", icon_type: St.IconType.FULLCOLOR, icon_size: source.ICON_SIZE })}
            );
         Main.messageTray.add(source);
         source.notify(notification);
      }

      // If there are new effects after an applet upgrade, we might need to upgrade settings
      this._upgradeRandomIncludeEffects();
      // This call will only connect to minimize/unminimize events if needed, that way MagicLampEffect can still work if it's installed
      this._enableMinimizeEffects();

      // Monkey Patch the SoundManager.play() function if required
      this._enableSounds();

      // Make sure to remove any effects if requested by the window manager.
      this._killEffectsSignal = global.window_manager.connect('kill-window-effects', (wm, actor) => {
         const shader = actor.get_effect('burn-my-windows-effect');
         if (shader) {
            shader.endAnimation();
         }
         if (actor._bmwRaiseShader) {
            actor._bmwRaiseShader.endAnimation();
         }
      });
  }

  // Make sure the SoundManager Monkey patching is setup correctly according to the this.enableSound value
  _enableSounds() {
     if (this.enableSound && !this._originalPlay) {
        this._originalPlay = SoundManager.SoundManager.prototype.play;
        SoundManager.SoundManager.prototype.play = this._soundManager_play;
     } else if (!this.enableSound && this._originalPlay) {
        SoundManager.SoundManager.prototype.play = this._originalPlay;
        delete this._originalPlay;
     }
  }

  // Monkey patched play function, `this` will be a SoundManager instance
  _soundManager_play(event) {
     if (event == "map" || event == "close" || event == "minimize") {
        // We will play these sounds later on when we know what file to play
        return;
     }
     extensionThis._originalPlay.call(this, event);
  }

  // Builds the "name -> idx" option maps used by every "effect name" combobox, straight
  // from the Effect const above. Returns two maps: "all" includes the pseudo-effects
  // Randomized/None (used by the window-event effect selectors and the app-rules list),
  // and "effectsOnly" excludes them (used by the effect-selector, since you can't view/edit
  // settings for "None" or "Randomized"). Effects appear in the UI in the same order they
  // are declared in the Effect const above (already curated to read alphabetically) --
  // deliberately NOT re-sorted here. Randomized/None are always appended last.
  _buildEffectOptionMaps() {
    let realEffects = Object.values(Effect)
      .filter((effect) => effect.idx < 900); // idx >= 900 is reserved for Randomized/None

    let effectsOnly = {};
    for (let effect of realEffects) {
      effectsOnly[effect.name] = effect.idx;
    }

    let all = Object.assign({}, effectsOnly, {
      [Effect.Randomized.name]: Effect.Randomized.idx,
      [Effect.None.name]: Effect.None.idx
    });

    return {all, effectsOnly};
  }

  // Simple equality check for two "name -> idx" option maps, used to avoid rewriting (and
  // re-saving) the settings file on every enable() when nothing has actually changed.
  _optionsEqual(a, b) {
    if (!a) return false;
    let aKeys = Object.keys(a);
    let bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (let key of aKeys) {
      if (a[key] !== b[key]) return false;
    }
    return true;
  }

  // Overwrites the effect option lists stored in the settings file with the canonical
  // lists derived from the Effect const above, so every "effect name" combobox --
  // including each column of the app-rules list -- always reflects the effects that are
  // actually available, without having to hand-edit settings-schema.json in a dozen
  // places whenever an effect is added, renamed or retired.
  _syncEffectOptions() {
    const {all, effectsOnly} = this._buildEffectOptionMaps();
    const settingsData = this._settings.settingsData;
    let changed = false;

    // The window-event effect selectors (open/close/minimize/unminimize, their dialog and
    // "on battery power" variants) all offer the full list, including Randomized/None.
    const FULL_OPTION_KEYS = [
      "open-window-effect", "close-window-effect",
      "dialog-open-effect", "dialog-close-effect",
      "minimize-effect", "unminimize-effect",
      "power-open-effect", "power-close-effect",
      "power-dialog-open-effect", "power-dialog-close-effect",
      "power-minimize-effect", "power-unminimize-effect"
    ];

    for (let key of FULL_OPTION_KEYS) {
      if (settingsData[key] && !this._optionsEqual(settingsData[key].options, all)) {
        settingsData[key].options = all;
        changed = true;
      }
    }

    // The "Effect Selector" (used to pick which effect's settings to edit/preview) only
    // offers real effects.
    if (settingsData["effect-selector"] && !this._optionsEqual(settingsData["effect-selector"].options, effectsOnly)) {
      settingsData["effect-selector"].options = effectsOnly;
      changed = true;
    }

    // The "app-rules" list renders its own combobox per row for these four columns, each
    // with its own copy of the option list, which the public setOptions() API can't reach
    // since it only supports options that live directly on the setting itself.
    const appRules = settingsData["app-rules"];
    if (appRules && appRules.columns) {
      const EFFECT_COLUMN_IDS = ["open", "close", "minimize", "unminimize"];
      for (let column of appRules.columns) {
        if (EFFECT_COLUMN_IDS.includes(column.id) && !this._optionsEqual(column.options, all)) {
          column.options = all;
          changed = true;
        }
      }
    }

    if (changed) {
      this._settings._saveToFile();
    }
  }

  // This function will rebuild the "random-include" list. After an upgrade,
  // the Effect const might have differences that need to be reflected in the
  // "random-include" List. New effects will be added (all options enabled)
  // and retired effects will be removed. Unchanged effects will retain existing
  // settings.
  _upgradeRandomIncludeEffects() {
     let randomInclude =  this._settings.getValue("random-include");
     let newRandomInclude = [];
     let effects = Object.entries(Effect);

     for (let i=0 ; i < effects.length ; i++) {
        if (effects[i][1].idx < 900) {// An idx of 900 or higher is reserved for non-effect types, i.e. None and Random
           let element = randomInclude.find((element) => element.name == effects[i][1].name);
           if (element) {
              // Rows from before raise effects existed get the raise box ticked.
              if (element.raise === undefined) element.raise = true;
              newRandomInclude.push(element);
           } else {
              newRandomInclude.push( {name: effects[i][1].name, open: true, close: true, minimize: true, unminimize: true, raise: true} );
           }
        }
     }
     this._settings.setValue("random-include", newRandomInclude);
  }

  // Try to enable the Minimize/Unminimize event connection if there is a need
  // Disconnect Minimize/Unminimize events if there is no longer any need
  _enableMinimizeEffects() {
    // Determine if any app specific settings are using minimize or unminimize effects
    let appRules = this._settings.getValue("app-rules");
    let appRuleUses = false;
    if (appRules) {
      for (let i=0 ; i<appRules.length ; i++) {
        if (appRules[i].enabled && ((appRules[i].minimize && appRules[i].minimize !== Effect.None.idx) || (appRules[i].unminimize && appRules[i].unminimize !== Effect.None.idx))) {
          appRuleUses = true;
          break;
        }
      }
    }
    // If we now have some Minimize/Unminimize effects enabled, then we need to connect to the Minimize/Unminimize events
    if (!this._minimizeConnected && (appRuleUses || this.minimizeEffect !== Effect.None.idx || this.unminimizeEffect !== Effect.None.idx ||
         this.powerMinimizeEffect !== Effect.None.idx || this.powerUnminimizeEffect !== Effect.None.idx)) {
       let error = this.shouldAnimateManager.connect(ShouldAnimateManager.Events.Minimize+ShouldAnimateManager.Events.Unminimize, this._shouldAnimateHandler );
       if (error) {
          // Disable all the minimize/unminimize effects
          this.minimizeEffect = Effect.None.idx;
          this.unminimizeEffect = Effect.None.idx;
          this.powerMinimizeEffect = Effect.None.idx;
          this.powerUnminimizeEffect = Effect.None.idx;
          if (appRules) {
            for (let i=0 ; i<appRules.length ; i++) {
              if (appRules[i].enabled && (appRules[i].minimize !== Effect.None.idx || appRules[i].unminimize !== Effect.None.idx)) {
                appRules[i].enabled = false;
              }
            }
          }
          // Send a notification about the failure to connect to minimize/unminimize events
          let source = new MessageTray.Source(this.meta.name);
          let notification = new MessageTray.Notification(source, _("Error") + ": " + this.meta.name + " " + _("minimize/unminimize effects can not be enabled"),
            _("The existing extension") + " " + error + " " + _("already handles minimize/unminimize animation events."),
            {icon: new St.Icon({icon_name: "cinnamon-burn-my-window", icon_type: St.IconType.FULLCOLOR, icon_size: source.ICON_SIZE })}
            );
          Main.messageTray.add(source);
          source.notify(notification);
       } else {
         this._minimizeConnected = true;
       }
    } else if (this._minimizeConnected && appRuleUses === false && this.minimizeEffect === Effect.None.idx && this.unminimizeEffect === Effect.None.idx) {
      // Now there are no Minimize/Unminimize effects enabled, so we can disconnect from those events
      this.shouldAnimateManager.disconnect(ShouldAnimateManager.Events.Minimize+ShouldAnimateManager.Events.Unminimize);
      this._minimizeConnected = false;
    }
  }

  // This function is called when the _shouldAnimate function call is intercepted by the ShouldAnimateManager
  // Here we setup Cinnamon to force effects and we override the ease function to initiate the effect
  _shouldAnimateHandler(actor, types, event) {
    // If there is an applicable effect profile, we intercept the ease() method to
    // setup our own effect.
    const chosenEffect = extensionThis._chooseEffect(actor, event);

    if (chosenEffect) {
      // Store the original ease() method of the actor.
      const orig = actor.ease;

      // Temporarily force the new window, closing window & minimize effect to be enabled in cinnamon
      let orig_desktop_effects_map_type = Main.wm.desktop_effects_map_type;
      let orig_desktop_effects_close_type = Main.wm.desktop_effects_close_type;
      let orig_desktop_effects_minimize_type = Main.wm.desktop_effects_minimize_type;
      Main.wm.desktop_effects_map_type = "traditional";
      Main.wm.desktop_effects_close_type = "traditional";
      Main.wm.desktop_effects_minimize_type = "traditional";

      // Setup the sound event name and tempoarily change the Cinnamon window effect to "" so no Cinnamon effect is attempted
      let eventName;
      switch(event) {
         case ShouldAnimateManager.Events.MapWindow:
            eventName = "map";
            break;
         case ShouldAnimateManager.Events.DestroyWindow:
            eventName = "close";
            break;
         case ShouldAnimateManager.Events.Minimize:
         case ShouldAnimateManager.Events.Unminimize:
            eventName = "minimize";  // Unminimize uses the same sound as minimize in Cinnamon
            break;
      }

      // If sound effects are enabled and there is a sound to play, then play it now
      if (extensionThis.enableSound) {
        let soundSettings = new Gio.Settings({ schema_id: "org.cinnamon.sounds" });
        if (soundSettings && soundSettings.get_boolean(eventName+"-enabled")) {
           let sfx = chosenEffect.effect.constructor.getSFX(chosenEffect.profile, (event & ShouldAnimateManager.Events.MapWindow) || (event & ShouldAnimateManager.Events.Unminimize) );
           if (sfx)
              Main.soundManager.playSoundFile(0, sfx);
           else
              extensionThis._originalPlay.call(Main.soundManager, eventName);
        }
      }

      // Record the windows current position before Cinnamon mucks with it's position
      let actorX = actor.x;
      let actorY = actor.y;

      // Now intercept the next call to actor.ease().
      actor.ease = function(...params) {
         if (event === ShouldAnimateManager.Events.MapWindow || event === ShouldAnimateManager.Events.Unminimize) {
            // When using "traditional" animation in Cinnamon (which we are forcing to be the case):
            //    _mapWindow() is setting "actor.x-=1"
            //    _unminimizeWindow() is setting actors x & y to the icon geometry
            // so we need to undue these changes to make sure the window animates to to correct window position.
            // We use the actors pre-ease values so that we have a good chance of being right even if Cinnamon
            // makes further changes in future releases.
            actor.set_position(actorX, actorY);
         }

         // Quickly restore the original behavior. Nobody noticed, I guess :D
         actor.ease = orig;

         // And then create the effect!
         extensionThis._setupEffect(actor, event, chosenEffect.effect, chosenEffect.profile);

         // Restore the original cinnamon new window, closing window & minimize effect settings
         Main.wm.desktop_effects_map_type = orig_desktop_effects_map_type;
         Main.wm.desktop_effects_close_type = orig_desktop_effects_close_type;
         Main.wm.desktop_effects_minimize_type = orig_desktop_effects_minimize_type;
      };
      return true;
    }
    // There is no BMW Effect we need to play for this event, so just run the
    // original _shouldAnimate and let Cinnamon do what it would normally do.
    return ShouldAnimateManager.RUN_ORIGINAL_FUNCTION;
  }

  // This function could be called after the extension is uninstalled, disabled in GNOME
  // Tweaks, when you log out or when the screen locks.
  disable() {
    // Make sure the window picker isn't left holding the desktop
    this._endPick();

    // Stop watching for raised windows and remove any running raise effect
    if (this._raiseWatcher) {
      this._raiseWatcher.disable();
      this._raiseWatcher = null;
    }
    this._endRaiseEffects();

    // Stop monitoring signals
    this._signalManager.disconnectAllSignals();

    // Free all effect resources.
    this._ALL_EFFECTS = [];

    global.window_manager.disconnect(this._killEffectsSignal);

    // Restore the original window-open, window-close, Minimize and Unminimize animations.
    this.shouldAnimateManager.disconnect();

    // Restore the monkey patched SoundManager if it has been patched
    if (this._originalPlay) {
       SoundManager.SoundManager.prototype.play = this._originalPlay;
       delete this._originalPlay;
    }

    this._settings.finalize();
    this._settings = null;
  }

  // Choose an effect based on the users preferences as defined in the setting for the current window action
  _chooseEffect(actor, event) {
    let effectIdx;
    let metaWindow = actor.meta_window;
    let windowType = metaWindow.get_window_type();
    let power = ( this._settings.getValue("power-onbattery") === true &&
                  this._upDisplayDevice.state === UPowerGlib.DeviceState.DISCHARGING &&
                  this._upDisplayDevice.percentage < this._settings.getValue("power-percent") );
    let dialog = ( ((!power && this._settings.getValue("dialog-special")) || (power && this._settings.getValue("power-dialog-special"))) &&
                   (windowType === Meta.WindowType.DIALOG || windowType === Meta.WindowType.MODAL_DIALOG));
    let appRule = (!dialog) ? this.getAppRule(metaWindow, power) : null;

    //log( `Battery state: ${this._upDisplayDevice.state}  ${this._upDisplayDevice.percentage}%` );

    // The "effect-overrides" scope of the selector that chose the effect (its settings key name),
    // or null when there can't be custom settings (application rules, for now)
    let scope = null;
    // The "effect-overrides" scope of the application rule's effect (see AppRulesList in CustomWidgets.py)
    let appScope = null;

    switch (event) {
      case ShouldAnimateManager.Events.MapWindow:
        if (appRule) {
          effectIdx = appRule.open;
          appScope = this._appRuleScope(appRule, "open");
        } else {
          if (power) {
            scope = (!dialog) ? "power-open-effect" : "power-dialog-open-effect";
          } else {
            scope = (!dialog) ? "open-window-effect" : "dialog-open-effect";
          }
        }
        break;
      case ShouldAnimateManager.Events.DestroyWindow:
        if (appRule) {
          effectIdx = appRule.close;
          appScope = this._appRuleScope(appRule, "close");
        } else {
          if (power) {
            scope = (!dialog) ? "power-close-effect" : "power-dialog-close-effect";
          } else {
            scope = (!dialog) ? "close-window-effect" : "dialog-close-effect";
          }
        }
        break;
      case ShouldAnimateManager.Events.Minimize:
        if (appRule) {
          effectIdx = appRule.minimize;
          appScope = this._appRuleScope(appRule, "minimize");
        } else {
          scope = (power) ? "power-minimize-effect" : "minimize-effect";
        }
        break;
      case ShouldAnimateManager.Events.Unminimize:
        if (appRule) {
          effectIdx = appRule.unminimize;
          appScope = this._appRuleScope(appRule, "unminimize");
        } else {
          scope = (power) ? "power-unminimize-effect" : "unminimize-effect";
        }
        break;
    }
    if (scope) {
      effectIdx = this[this._scopeProperty[scope]];
    }
    if (effectIdx === Effect.None.idx) {
      // No effect should be applied
      return(null);
    } else if (effectIdx != Effect.Randomized.idx) {
      // Return the effect that the setting reflects
      return {effect: this._ALL_EFFECTS[effectIdx], profile: this._makeProfile(appScope || scope, effectIdx)};
    } else {
      // Add the effect indexes for each effect that is included in this events randomized set
      let effectOptions = [];
      let randomInclude = this._settings.getValue("random-include");
      for( let i=0 ; i < randomInclude.length ; i++ ) {
        let random = randomInclude[i];
        switch (event) {
          case ShouldAnimateManager.Events.MapWindow:
            if (random.open)
              effectOptions.push( EffectIndex(random.name) );
            break;
          case ShouldAnimateManager.Events.DestroyWindow:
            if (random.close)
              effectOptions.push( EffectIndex(random.name) );
            break;
          case ShouldAnimateManager.Events.Minimize:
            if (random.minimize)
              effectOptions.push( EffectIndex(random.name) );
            break;
          case ShouldAnimateManager.Events.Unminimize:
            if (random.unminimize)
              effectOptions.push( EffectIndex(random.name) );
            break;
        }
      }
      // If any random options are enabled, return a randomly chosen effect, else return null
      if (effectOptions.length > 0) {
        let randomIdx = effectOptions[(Math.floor(Math.random() * effectOptions.length))];
        // A randomly chosen effect uses the custom settings from the Randomized list (its gear buttons) for
        // this event, never those of the selector that chose Randomized.
        let randomScope = (event === ShouldAnimateManager.Events.MapWindow)     ? "random-open" :
                          (event === ShouldAnimateManager.Events.DestroyWindow) ? "random-close" :
                          (event === ShouldAnimateManager.Events.Minimize)      ? "random-minimize" :
                          (event === ShouldAnimateManager.Events.Unminimize)    ? "random-unminimize" : null;
        return {effect: this._ALL_EFFECTS[randomIdx], profile: this._makeProfile(randomScope, randomIdx)};
      } else {
        return null;
      }
    }
  }

  // Like this._settings.bind(), for keys with the "custom" settings type (i.e. the EffectSelector keys),
  // which bind() refuses since it only accepts Cinnamon's built in types. getValue(), setValue() and the
  // "changed::<key>" signal work for keys of any type.
  _bindCustom(key, property, callback) {
    Object.defineProperty(this, property, {
      get: () => this._settings.getValue(key),
      set: (value) => this._settings.setValue(key, value),
      enumerable: true,
      configurable: true
    });
    if (callback) {
      this._signalManager.connect(this._settings, "changed::" + key, () => callback.call(this));
    }
  }

  // The bound property holding each selector's value, by "effect-overrides" scope (the selector's key name)
  get _scopeProperty() {
    return {
      "open-window-effect": "openEffect",               "dialog-open-effect": "dialogOpenEffect",
      "close-window-effect": "closeEffect",             "dialog-close-effect": "dialogCloseEffect",
      "minimize-effect": "minimizeEffect",              "unminimize-effect": "unminimizeEffect",
      "power-open-effect": "powerOpenEffect",           "power-dialog-open-effect": "powerDialogOpenEffect",
      "power-close-effect": "powerCloseEffect",         "power-dialog-close-effect": "powerDialogCloseEffect",
      "power-minimize-effect": "powerMinimizeEffect",   "power-unminimize-effect": "powerUnminimizeEffect"
    };
  }

  // The settings the given effect should use: the selector's custom settings for that effect when they
  // are enabled (see EffectSelector in CustomWidgets.py), otherwise the global settings.
  // The "effect-overrides" scope of an application rule's effect for an event. A rule only has custom settings
  // once it has an id, which the settings window gives it the first time its gear is used.
  _appRuleScope(rule, event) {
    return (rule && rule.id) ? "app-" + rule.id + "-" + event : null;
  }

  _makeProfile(scope, effectIdx) {
    if (!scope) return this._settings;
    let overrides = this._settings.getValue("effect-overrides");
    let entry = (overrides && overrides[scope]) ? overrides[scope][String(effectIdx)] : null;
    if (!entry || !entry.enabled || !entry.values) return this._settings;
    let profile = new EffectProfile(this._settings, entry.values);
    // Effects with presets (Fire, Mushroom) compute values from the settings and store them on the
    // settings object for their shaders to use, so they need to do that for this profile as well.
    let effect = this._ALL_EFFECTS[effectIdx];
    if (effect && typeof effect._setupUsingPresets === "function") {
      effect._setupUsingPresets(profile);
    }
    return profile;
  }

  // Get the application specific rules for the given metaWindow
  getAppRule(metaWindow, power) {
    let app = this._windowTracker.get_window_app(metaWindow);
    if (!app) {
      app = this._windowTracker.get_app_from_pid(metaWindow.get_pid());
    }
    let appID = null;
    if (app && !app.is_window_backed()) {
      appID = app.get_id();
    }
    let wmClass = metaWindow.get_wm_class();
    // If the window is the BMW test program (aka the "effect preview window") then unconditionally use the current "Effect Selector" effect
    if (wmClass == "CinnamonBurnMyWindowsTest.py") {
       let selectedEffect = this._settings.getValue("effect-selector");
       return {open: selectedEffect, close: selectedEffect, minimize: selectedEffect, unminimize: selectedEffect};
    }
    // If there are power rules in effect, return null now
    if (power) return(null);
    // Look for application specific rules to use
    let appRules = this._settings.getValue("app-rules");
    for( let i=0 ; i < appRules.length ; i++ ) {
      if (appRules[i].enabled && ((appID && appRules[i].application == appID) || (appRules[i].application == wmClass))) {
        if ((appRules[i].minimize && appRules[i].minimize !== Effect.None.idx) || (appRules[i].unminimize && appRules[i].unminimize !== Effect.None.idx)) {
           this._enableMinimizeEffects();
        }
        return(appRules[i]);
      }
    }
    return(null);
  }

  // This method adds the given effect using the settings from the given profile to the
  // given actor.
  _setupEffect(actor, event, effect, profile) {
    let forOpening = (event & ShouldAnimateManager.Events.MapWindow) || (event & ShouldAnimateManager.Events.Unminimize);
    // There is the weird case where an animation is already ongoing. This happens when a
    // window is closed which has been created before the session was started (e.g. when
    // GNOME Shell has been restarted in the meantime). With the unscaled canvas (below) the
    // shader lives on actor._bmwEffectContainer instead of the actor itself.
    const oldShader = actor._bmwEffectContainer ?
      actor._bmwEffectContainer.get_effect('burn-my-windows-effect') :
      actor.get_effect('burn-my-windows-effect');
    if (oldShader) {
      oldShader.endAnimation();
    }

    // If we are currently performing integration test, all animations are set to a fixed
    // duration and show a fixed frame from the middle of the animation.
    const testMode = this._settings.getValue('test-mode');

    // The following is used to tweak the ongoing transitions of a window actor. Usually
    // windows are faded in / out scaled up / down slightly by GNOME Shell. Here, we tweak
    // the transitions so that nothing changes. The window stays opaque and is scaled to
    // actorScale.
    const actorScale = effect.constructor.getActorScale(profile, forOpening, actor);

    // Effects that draw on more than just the window (e.g. Aperture Panels) build their own
    // actors in createLayers() (below), instead of using the canvas or scaling.
    const layered = typeof effect.createLayers === 'function';

    // UNSCALED CANVAS: get the extra canvas without scaling anything. A plain
    // actor the size the scaled window would have had, centred on the window, holds a 1:1
    // clone of the window at its real position. Nothing is scaled, so there is no pivot for
    // the shadow-inflated paint volume or the texture padding to throw off. getInputColor()
    // maps the shader's usual 0..1 window coordinates onto the window's real place in the
    // texture via uInputRect (updated every frame, see below beginAnimation()).
    const useCanvas = !layered && USE_UNSCALED_CANVAS && (actorScale.x !== 1.0 || actorScale.y !== 1.0);
    let canvas = null, canvasClone = null, behindLayer = null, aboveLayer = null;
    let syncCanvas = null;  // set below when useCanvas; called once a frame

    // Which windows are above / below this one while the clone layers of the canvas are
    // built (see createStackTracker() in LayeredEffect.js). Layered effects have their own.
    const stack = useCanvas ? Layers.createStackTracker(actor, !forOpening) : null;

    // The canvas the effect expects is the size the scaled window would have had, centred on
    // the window (the "virtual" canvas, v*). Only its on-screen part (c*) is actually built:
    // Clutter never renders anything off-screen into an effect's texture anyway, and parent
    // groups may trim it. iTexCoord in the shaders is mapped back to the virtual canvas via
    // uCanvasRect, so the shaders' own maths doesn't change.
    const canvasGeometry = () => {
      const vw = Math.ceil(actor.width  * actorScale.x);
      const vh = Math.ceil(actor.height * actorScale.y);
      const vx = Math.round(actor.x + (actor.width  - vw) / 2);
      const vy = Math.round(actor.y + (actor.height - vh) / 2);
      const cx = Math.max(vx, 0);
      const cy = Math.max(vy, 0);
      const cw = Math.max(1, Math.min(vx + vw, global.stage.width)  - cx);
      const ch = Math.max(1, Math.min(vy + vh, global.stage.height) - cy);
      return {vx, vy, vw, vh, cx, cy, cw, ch};
    };

    // The area the behind and above layers cover (stage coordinates): the on-screen canvas
    // plus the window and a margin, so everything the effect can draw over is ours.
    const coverRect = (g) => {
      const M  = CANVAS_BEHIND_MARGIN;
      const x1 = Math.max(0, Math.min(g.cx, Math.floor(actor.x - M)));
      const y1 = Math.max(0, Math.min(g.cy, Math.floor(actor.y - M)));
      const x2 = Math.min(global.stage.width,  Math.max(g.cx + g.cw, Math.ceil(actor.x + actor.width  + M)));
      const y2 = Math.min(global.stage.height, Math.max(g.cy + g.ch, Math.ceil(actor.y + actor.height + M)));
      return {x: x1, y: y1, width: Math.max(1, x2 - x1), height: Math.max(1, y2 - y1)};
    };
    let geo = null;

    // The actor that the shader effect is actually attached to and painted on.
    let paintTarget = actor;

    if (useCanvas) {
      geo = canvasGeometry();

      canvas = new Clutter.Actor({x: geo.cx, y: geo.cy, width: geo.cw, height: geo.ch,
                                  clip_to_allocation: true, reactive: false});
      canvasClone = new Clutter.Clone({source: actor, reactive: false,
                                       x: actor.x - geo.cx, y: actor.y - geo.cy});
      canvas.add_child(canvasClone);

      // Three actors, bottom to top: clones of everything behind the window, the canvas, and
      // clones of the windows above it. Together they replace the whole area the effect can
      // draw on, so the animation keeps the window's place in the stacking order (a window
      // closing behind others stays behind them) and transparent parts of the effect don't
      // depend on Muffin painting what's under a hidden window (which it doesn't reliably do).
      // See insertAboveWindows() in LayeredEffect.js for where they go.
      const cover = coverRect(geo);
      behindLayer = this._createBehindLayer(actor, cover, stack);
      aboveLayer  = this._createAboveLayer(actor, cover, stack);
      Layers.insertAboveWindows([behindLayer, canvas, aboveLayer]);

      // Hide the real window; the clone still renders it. _bmwEffectContainer is set before
      // the opacity drops and cleared before it comes back, so other code watching the
      // window's opacity (e.g. clones in other extensions, addWindowClone()) can tell a window
      // hidden by an animation from a hidden one, and clone the animation instead.
      actor._bmwEffectContainer = canvas;
      actor.opacity = 0;
      paintTarget = canvas;

      // Rebuild the behind and above layers for the current geometry and stacking order.
      const rebuildLayers = () => {
        const parent = canvas.get_parent();
        if (!parent) return;
        const cover     = coverRect(geo);
        const oldLayers = [behindLayer, aboveLayer];
        behindLayer = this._createBehindLayer(actor, cover, stack);
        aboveLayer  = this._createAboveLayer(actor, cover, stack);
        behindLayer._bmwEffectLayer = aboveLayer._bmwEffectLayer = true;
        parent.insert_child_below(behindLayer, canvas);
        parent.insert_child_above(aboveLayer, canvas);
        oldLayers.forEach(l => l.destroy());
      };

      // Set when the canvas has moved; the stack tracker says when the stacking changed.
      let layersDirty = false;

      // During an open, the window may still be placed or resized after this point. The
      // effect used to live on the window itself and followed it automatically; now the
      // canvas has to be kept centred on the window, with the clone on top of it.
      // Called once a frame from the animation's timeline, before layout and painting. Never
      // from notify::allocation: rebuilding the layers there destroys clones while their
      // source window is being mapped, which crashes Clutter
      // (clutter_actor_set_mapped: '!CLUTTER_ACTOR_IN_MAP_UNMAP (self)').
      syncCanvas = () => {
        const g = canvasGeometry();
        if (g.vx !== geo.vx || g.vy !== geo.vy || g.vw !== geo.vw || g.vh !== geo.vh ||
            g.cx !== canvas.x || g.cy !== canvas.y || g.cw !== canvas.width || g.ch !== canvas.height) {
          geo = g;
          canvas.set_position(g.cx, g.cy);
          canvas.set_size(g.cw, g.ch);
          canvasClone.set_position(actor.x - g.cx, actor.y - g.cy);
          layersDirty = true;
        }
        const restacked = stack.takeDirty();
        if (layersDirty || restacked) {
          layersDirty = false;
          rebuildLayers();
        }
      };
    } else {
      // All scaling is relative to the window's center.
      actor.set_pivot_point(0.5, 0.5);
      actor.opacity = 255;
      actor.scale_x = actorScale.x;
      actor.scale_y = actorScale.y;
    }

    // If we are in the overview, we have to enlarge the window's clone as well. We also
    // disable the clone's overlay (e.g. its icon, name, and close button) during the
    // animation.
    if (actor._bmwOverviewClone) {
      actor._bmwOverviewClone.overlayEnabled = false;
      actor._bmwOverviewCloneContainer.set_pivot_point(0.5, 0.5);
      actor._bmwOverviewCloneContainer.scale_x = actorScale.x;
      actor._bmwOverviewCloneContainer.scale_y = actorScale.y;
    }

    // Now add a cool shader to our window actor (or its clone container)!
    const shader = effect.shaderFactory.getShader(event, this._settings);

    // To make things deterministic during testing, we set the effect duration to 8
    // seconds.
    const duration = testMode ?
      8000 :
      profile.getValue(effect.constructor.getNick() + '-animation-time');

    // Layered effects (see LayeredEffect.js): the effect hides the window, stacks its own
    // actors over it and tells us which one gets the shader. It follows the window (and the
    // stacking order) on its own, once a frame, and cleans up in layers.destroy().
    let layers = null;
    if (layered) {
      layers = effect.createLayers(actor, shader, {settings: profile, forOpening, testMode, duration});
      paintTarget = layers.paintTarget;
      actor._bmwEffectContainer = paintTarget;
    }

    paintTarget.add_effect_with_name('burn-my-windows-effect', shader);

    // At the end of the animation, we restore the scale of the overview clone (if any)
    // and call the methods which would have been called by the original ease() calls at
    // the end of the standard fade-in animation.
    const endID = shader.connect('end-animation', () => {
      shader.disconnect(endID);

      if (actor._bmwOverviewClone) {
        actor._bmwOverviewClone.overlayEnabled   = true;
        actor._bmwOverviewCloneContainer.scale_x = 1.0;
        actor._bmwOverviewCloneContainer.scale_y = 1.0;
      }

      if (shader._bmwInputRectId) {
        shader.disconnect(shader._bmwInputRectId);
        shader._bmwInputRectId = 0;
      }
      if (shader._bmwFrameId) {
        shader._timeline.disconnect(shader._bmwFrameId);
        shader._bmwFrameId = 0;
      }

      // Remove the shader and mark it being re-usable for future animations.
      paintTarget.remove_effect(shader);
      if (layers) {
        layers.destroy();
        actor._bmwEffectContainer = null;
      }
      shader.returnToFactory();
      if (stack) stack.destroy();

      if (useCanvas) {
        // Restore the real window and tear down the canvas (and behind layer).
        actor._bmwEffectContainer = null;
        actor.opacity = 255;
        canvas.destroy();  // also destroys the clone
        if (behindLayer) behindLayer.destroy();
        if (aboveLayer)  aboveLayer.destroy();
        actor._bmwEffectContainer = null;
      } else {
        // Restore the original scale of the window actor.
        actor.scale_x = 1.0;
        actor.scale_y = 1.0;
      }

      // Finally, once the animation is done or interrupted, we call the methods which
      // would normally have been called by Cinnamon
      switch (event) {
         case ShouldAnimateManager.Events.MapWindow:
            Main.wm._mapWindowDone(global.window_manager, actor);
            break;
         case ShouldAnimateManager.Events.DestroyWindow:
            Main.wm._destroyWindowDone(global.window_manager, actor);
            break;
         case ShouldAnimateManager.Events.Minimize:
            Main.wm._minimizeWindowDone(global.window_manager, actor);
            break;
         case ShouldAnimateManager.Events.Unminimize:
            Main.wm._unminimizeWindowDone(global.window_manager, actor);
            break;
      }
    });

    // Finally start the animation! Note: we always pass the real `actor` here (never the
    // clone container) -- Shader.beginAnimation() only uses it for logical measurements
    // (native width/height, meta_window frame rect), which must stay native. How much
    // extra canvas the shader has to work with is communicated separately via the
    // uActorScale-style uniform each effect's own begin-animation handler sets.
    shader.beginAnimation(profile, forOpening, testMode, duration, actor);

    // Once a frame, from the animation's timeline (before layout and painting, so actors can
    // safely be moved, created and destroyed):
    // 1. Muffin doesn't move or resize a window actor while an effect runs on it
    //    (meta_window_actor_sync_actor_geometry() returns early), but the client can still
    //    change its buffer meanwhile, e.g. Electron adding its client-side shadow margins right
    //    after an unminimize (buffer rect grew by 16px left, 10px top, ...). The window's
    //    content is then drawn offset for the whole animation and jumps into place once Muffin
    //    syncs at the end. So follow the buffer rect ourselves -- but only while the window
    //    is appearing (open / unminimize). While it disappears (close / minimize) its content
    //    is its last frame, which doesn't change any more, while the client may already have
    //    changed its buffer (Electron drops its shadow margins on minimize); moving the actor
    //    to the new buffer rect then makes the window jump at the start instead.
    // 2. The canvas follows the window (and the stacking order).
    // Layered effects do both themselves (see LayeredEffect.js).
    const followBuffer = !!forOpening;
    const metaWindow   = actor.get_meta_window();
    const onFrame = () => {
      if (stack) stack.frame();
      if (followBuffer) Layers.followBufferRect(actor, metaWindow);
      if (syncCanvas) syncCanvas();
    };
    if (shader._timeline && !layered) {
      shader._bmwFrameId = shader._timeline.connect('new-frame', onFrame);
    }

    if (useCanvas) {
      // Tell getInputColor() where the window really is inside the canvas's texture. How
      // the 3px of padding is split depends on the Muffin build (see the flip-disc
      // investigation doc and Shader.getTextureRect()).
      const updateInputRect = () => {
        let tx = canvas.x, ty = canvas.y, tw = canvas.width, th = canvas.height;
        const t = shader.getTextureRect(canvas.width, canvas.height, CANVAS_TEX_PADDING);
        if (t) {
          tx += t[0];
          ty += t[1];
          tw  = t[2];
          th  = t[3];
        }
        const ax   = canvas.x + canvasClone.x;
        const ay   = canvas.y + canvasClone.y;
        const rect = [(ax - tx) / tw, (ay - ty) / th, actor.width / tw, actor.height / th];
        shader.set_uniform_float(shader._uInputRect, 4, rect);
        // The texture's place inside the virtual canvas, for iTexCoord.
        const crect = [(tx - geo.vx) / geo.vw, (ty - geo.vy) / geo.vh, tw / geo.vw, th / geo.vh];
        shader.set_uniform_float(shader._uCanvasRect, 4, crect);
      };
      updateInputRect();
      shader._bmwInputRectId = shader.connect('update-animation', updateInputRect);
    }
  }

  // ---- Raise effects ----
  // See RaiseEffect.js. The effect runs, in its hide direction, on a "cover" actor holding
  // clones of the windows the raised window was below, so the covered parts of the raised
  // window appear as the effect removes what covered them.

  // Indexes of the effects that can be used as a raise effect.
  _raiseCapableIndexes() {
    let indexes = [];
    for (let i = 0; i < this._ALL_EFFECTS.length; i++) {
      const effect = this._ALL_EFFECTS[i];
      if (effect && typeof effect.constructor.supportsRaise === 'function' &&
          effect.constructor.supportsRaise()) {
        indexes.push(i);
      }
    }
    return indexes;
  }

  // The raise effect combobox only offers raise capable effects (plus Randomized / None).
  _syncRaiseEffectOptions() {
    const settingsData = this._settings.settingsData;
    if (!settingsData["raise-effect"]) return;
    const capable = this._raiseCapableIndexes();

    // The Random Effects list (RandomIncludeList in CustomWidgets.py) only shows a Raise
    // check box for these effects. The settings dialog can't ask the effects themselves.
    const capableNames = Object.values(Effect)
      .filter(effect => effect.idx < 900 && capable.includes(effect.idx))
      .map(effect => effect.name);
    const oldNames = this._settings.getValue("raise-capable-effects") || [];
    if (oldNames.join("\n") !== capableNames.join("\n")) {
      this._settings.setValue("raise-capable-effects", capableNames);
    }
    let options = {};
    for (let effect of Object.values(Effect)) {
      if (effect.idx < 900 && capable.includes(effect.idx)) {
        options[effect.name] = effect.idx;
      }
    }
    options[Effect.Randomized.name] = Effect.Randomized.idx;
    options[Effect.None.name] = Effect.None.idx;
    // The General tab's and the Power tab's raise effect selectors.
    let changed = false;
    for (const key of ["raise-effect", "power-raise-effect"]) {
      if (!settingsData[key] || this._optionsEqual(settingsData[key].options, options)) continue;
      settingsData[key].options = options;
      // An effect that lost raise support (or was retired) falls back to None.
      if (!Object.values(options).includes(settingsData[key].value)) {
        settingsData[key].value = Effect.None.idx;
      }
      changed = true;
    }
    if (changed) {
      this._settings._saveToFile();
    }
  }

  // True while on battery below the Power tab's threshold (if that tab is enabled): the
  // Power tab's effects are used then.
  _onLowPower() {
    return this._settings.getValue("power-onbattery") === true &&
           this._upDisplayDevice.state === UPowerGlib.DeviceState.DISCHARGING &&
           this._upDisplayDevice.percentage < this._settings.getValue("power-percent");
  }

  // Only watch for raised windows while a raise effect is selected.
  _enableRaiseEffects() {
    if (!this._raiseWatcher) return;
    // Watch while either raise effect could be used; which one is decided per raise, as the
    // battery level changes (see _chooseRaiseEffect()).
    const powerUsed = this.powerOnBattery === true && this.powerRaiseEffect !== Effect.None.idx;
    if (this.raiseEffect !== Effect.None.idx || powerUsed) {
      this._raiseWatcher.enable();
    } else {
      this._raiseWatcher.disable();
      this._endRaiseEffects();
    }
  }

  // Returns {effect, profile} (profile: the settings the effect uses, see _makeProfile()), or null.
  _chooseRaiseEffect() {
    const lowPower = this._onLowPower();
    const idx = lowPower ? this.powerRaiseEffect : this.raiseEffect;
    if (idx === Effect.None.idx || idx === undefined) return null;
    const capable = this._raiseCapableIndexes();
    if (idx === Effect.Randomized.idx) {
      // The raise capable effects ticked in the Raise column of the Random Effects list.
      const randomInclude = this._settings.getValue("random-include") || [];
      const options = capable.filter(i => randomInclude.some(r =>
        r.raise !== false && EffectIndex(r.name) === i));
      if (options.length === 0) return null;
      const randomIdx = options[Math.floor(Math.random() * options.length)];
      return {effect: this._ALL_EFFECTS[randomIdx], profile: this._makeProfile("random-raise", randomIdx)};
    }
    if (!capable.includes(idx)) return null;
    return {effect: this._ALL_EFFECTS[idx], profile: this._makeProfile(lowPower ? "power-raise-effect" : "raise-effect", idx)};
  }

  // Stop every running raise effect (they clean up in their end-animation handler).
  _endRaiseEffects() {
    if (!this._raiseEffects) return;
    for (const shader of Array.from(this._raiseEffects)) {
      shader.endAnimation();
    }
  }

  // entries: from RaiseWatcher, one per window of the raised family (a window and its
  // dialogs) that was covered, bottom to top. They all get the same effect, each on a cover
  // of its own; the covers are stacked in the same order, so a dialog's is above its parent's.
  _startRaiseEffect(entries) {
    // Not windows that are still opening / unminimizing (or animated by something else).
    entries = entries.filter(e => {
      const actor = e.window.get_compositor_private();
      return actor && !actor._bmwEffectContainer && !actor.get_effect('burn-my-windows-effect');
    });
    if (entries.length === 0) return;

    const chosen = this._chooseRaiseEffect();
    if (!chosen) return;
    const {effect, profile} = chosen;

    // A cover from an earlier raise sits above all windows, so it would hide these.
    this._endRaiseEffects();

    const testMode = this._settings.getValue('test-mode');
    // Custom settings for raising (see EffectSettingsDialog in CustomWidgets.py) can have their own duration
    const duration = testMode ? 8000 : profile.getValue('raise-animation-time');

    // Each window's shadow ring leaves out the frames of the family windows below it: their
    // own covers animate there (see createCover()).
    const below = [];
    for (const e of entries) {
      this._startRaiseCover(e.window, e.coverers, e.above, effect, profile, duration, testMode, below.slice());
      const f = e.window.get_frame_rect();
      below.push({x: f.x, y: f.y, width: f.width, height: f.height});
    }
  }

  // One window's cover and shader (see _startRaiseEffect()).
  _startRaiseCover(metaWindow, coverers, above, effect, profile, duration, testMode, exclude) {
    const actor = metaWindow.get_compositor_private();

    const {group: coverGroup, target: cover, ring} = RaiseEffect.createCover(metaWindow, coverers, above, exclude);
    const shader = effect.shaderFactory.getShader();
    cover.add_effect_with_name('burn-my-windows-raise-effect', shader);
    actor._bmwRaiseShader = shader;
    this._raiseEffects.add(shader);

    // The cover is a snapshot of where the windows were. If the raised window moves or
    // resizes (e.g. the click that raised it starts a drag), just stop.
    const windowIds = [
      metaWindow.connect('position-changed', () => shader.endAnimation()),
      metaWindow.connect('size-changed', () => shader.endAnimation()),
      metaWindow.connect('unmanaged', () => shader.endAnimation())
    ];

    // The ring around the frame (the raised window's shadow and border) has no effect on it;
    // it fades out so they fade in, between RAISE_RING_FADE_START and RAISE_RING_FADE_END of
    // the animation, eased. Not from the start: when the raised window was covered entirely
    // (e.g. by a modal dialog's parent), the effect still shows the covering window over the
    // whole frame for a while, and an early shadow looks like a dimmed copy of that window
    // around it.
    const RAISE_RING_FADE_START = 0.3;
    const RAISE_RING_FADE_END   = 0.9;
    const fadeRing = (progress) => {
      const t = Math.max(0, Math.min(1, (progress - RAISE_RING_FADE_START) /
                                        (RAISE_RING_FADE_END - RAISE_RING_FADE_START)));
      ring.opacity = Math.round(255 * (1 - t * t * (3 - 2 * t)));
    };
    const ringId = shader._timeline.connect('new-frame', (t) => {
      fadeRing(testMode ? 0.5 : t.get_progress());
    });

    const endID = shader.connect('end-animation', () => {
      shader.disconnect(endID);
      shader._timeline.disconnect(ringId);
      for (const id of windowIds) {
        try { metaWindow.disconnect(id); } catch (e) { /* window already gone */ }
      }
      this._raiseEffects.delete(shader);
      if (actor._bmwRaiseShader === shader) actor._bmwRaiseShader = null;
      cover.remove_effect(shader);
      shader.returnToFactory();
      coverGroup.destroy();  // also destroys the cover
    });

    // forOpening = false: the effect makes the cover (what used to be on top) disappear.
    shader.beginAnimation(profile, false, testMode, duration, cover);
    // Tells shaders that care (e.g. Incinerate) to draw only where the cover has content.
    shader.set_uniform_float(shader._uRaise, 1, [1]);
  }

  // An empty, clipped actor covering `rect` (stage coordinates).
  _createCloneLayer(rect) {
    return new Clutter.Actor({x: rect.x, y: rect.y, width: rect.width, height: rect.height,
                              clip_to_allocation: true, reactive: false});
  }

  // Clones of everything behind `actor` (wallpaper, desktop icons, desklets, lower windows)
  // covering `rect`. Opaque.
  _createBehindLayer(actor, rect, stack) {
    const layer = this._createCloneLayer(rect);

    for (const bg of Layers.getBackgroundActors()) Layers.addClone(layer, bg, rect.x, rect.y);

    const desklets = (Main.deskletContainer && Main.deskletContainer.actor) || null;
    let deskletsAdded = false;
    for (const wa of stack.windowsNear(rect, false)) {
      // Desklets sit above the desktop window(s) and below normal windows.
      if (!deskletsAdded && desklets && wa.get_meta_window().get_window_type() !== Meta.WindowType.DESKTOP) {
        Layers.addClone(layer, desklets, rect.x, rect.y);
        deskletsAdded = true;
      }
      Layers.addWindowClone(layer, wa, rect.x, rect.y);
    }
    if (!deskletsAdded && desklets) Layers.addClone(layer, desklets, rect.x, rect.y);

    return layer;
  }

  // Clones of the windows above `actor` covering `rect`, so they stay in front of the
  // animation.
  _createAboveLayer(actor, rect, stack) {
    const layer = this._createCloneLayer(rect);
    for (const wa of stack.windowsNear(rect, true)) {
      Layers.addWindowClone(layer, wa, rect.x, rect.y);
    }
    return layer;
  }

  // ---- Window picker ----
  // Started from the "Pick a window to add..." button in the settings dialog. The user clicks the
  // window they mean and its application is added to the application specific rules list. While
  // picking, a transparent modal overlay covers the screen: it highlights the window under the
  // pointer and names it, a click picks it, and Esc, a right-click or a 30 second timeout cancels.
  pickWindow() {
    if (this._picker)
      return;
    let overlay = new St.Widget({ reactive: true, can_focus: true, x: 0, y: 0,
                                  width: global.screen_width, height: global.screen_height });
    let highlight = new St.Widget({ visible: false,
       style: "border: 2px solid rgba(53,132,228,1); background-color: rgba(53,132,228,0.2); border-radius: 6px;" });
    let highlightLabel = new St.Label({ x: 10, y: 10,
       style: "background-color: rgba(0,0,0,0.8); color: white; padding: 4px 10px; border-radius: 4px; font-weight: bold;" });
    highlight.add_child(highlightLabel);
    overlay.add_child(highlight);
    let hint = new St.Label({ text: _("Click a window to add its application to the application specific rules.  Esc or right-click to cancel."),
       style: "background-color: rgba(0,0,0,0.85); color: white; padding: 10px 18px; border-radius: 8px; font-size: 11pt;" });
    overlay.add_child(hint);
    Main.uiGroup.add_child(overlay);
    Main.uiGroup.set_child_above_sibling(overlay, null);
    let monitor = Main.layoutManager.primaryMonitor;
    let [, hintWidth] = hint.get_preferred_width(-1);
    hint.set_position(monitor.x + Math.floor((monitor.width - hintWidth) / 2), monitor.y + 60);

    if (!Main.pushModal(overlay)) {
      overlay.destroy();
      this._notify(_("Couldn't start the window picker. Close any open menus and try again."));
      return;
    }
    this._picker = { overlay: overlay, highlight: highlight, label: highlightLabel, window: null, timeoutId: 0 };
    overlay.grab_key_focus();
    if (Cinnamon.Cursor && Cinnamon.Cursor.CROSSHAIR !== undefined)
      global.set_cursor(Cinnamon.Cursor.CROSSHAIR);

    overlay.connect("motion-event", (actor, event) => {
      let [x, y] = event.get_coords();
      this._pickerHover(x, y);
      return Clutter.EVENT_STOP;
    });
    overlay.connect("button-press-event", () => Clutter.EVENT_STOP);
    overlay.connect("scroll-event", () => Clutter.EVENT_STOP);
    // Act on the release, so it doesn't reach the window underneath once the grab is gone
    overlay.connect("button-release-event", (actor, event) => {
      if (event.get_button() === 1) {
        let [x, y] = event.get_coords();
        let metaWindow = this._windowAtPoint(x, y);
        if (metaWindow) {   // a click on the desktop or a panel just keeps picking
          this._endPick();
          this._addWindowToAppRules(metaWindow);
        }
      } else {
        this._endPick();
      }
      return Clutter.EVENT_STOP;
    });
    overlay.connect("key-press-event", (actor, event) => {
      if (event.get_key_symbol() === Clutter.KEY_Escape)
        this._endPick();
      return Clutter.EVENT_STOP;
    });
    // Never leave the desktop grabbed if something goes wrong
    this._picker.timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => {
      if (this._picker)
        this._picker.timeoutId = 0;
      this._endPick();
      return GLib.SOURCE_REMOVE;
    });

    let [px, py] = global.get_pointer();
    this._pickerHover(px, py);
  }

  _endPick() {
    let picker = this._picker;
    if (!picker)
      return;
    this._picker = null;
    if (picker.timeoutId)
      GLib.source_remove(picker.timeoutId);
    global.unset_cursor();
    Main.popModal(picker.overlay);
    picker.overlay.destroy();
  }

  // Highlight the window under the pointer and show the name it would be added as
  _pickerHover(x, y) {
    let picker = this._picker;
    if (!picker)
      return;
    let metaWindow = this._windowAtPoint(x, y);
    if (metaWindow === picker.window)
      return;
    picker.window = metaWindow;
    if (!metaWindow) {
      picker.highlight.hide();
      return;
    }
    let rect = metaWindow.get_frame_rect();
    picker.highlight.set_position(rect.x, rect.y);
    picker.highlight.set_size(rect.width, rect.height);
    picker.label.text = this._getWindowRuleName(metaWindow) || _("(unknown application)");
    picker.highlight.show();
  }

  // The topmost visible window on the current workspace whose frame contains (x, y), or null
  _windowAtPoint(x, y) {
    let workspace = global.workspace_manager.get_active_workspace();
    let types = [Meta.WindowType.NORMAL, Meta.WindowType.DIALOG, Meta.WindowType.MODAL_DIALOG, Meta.WindowType.UTILITY];
    let windows = global.display.list_windows(0).filter(w =>
       types.includes(w.get_window_type()) && !w.minimized && w.showing_on_its_workspace() &&
       (w.is_on_all_workspaces() || w.get_workspace() === workspace));
    windows = global.display.sort_windows_by_stacking(windows);   // bottom to top
    for (let i = windows.length - 1; i >= 0; i--) {
      let rect = windows[i].get_frame_rect();
      if (x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height)
        return windows[i];
    }
    return null;
  }

  // The application id of a window (null when Cinnamon only knows it as a bare window)
  _getWindowAppId(metaWindow) {
    let app = this._windowTracker.get_window_app(metaWindow);
    if (!app) {
      app = this._windowTracker.get_app_from_pid(metaWindow.get_pid());
    }
    return (app && !app.is_window_backed()) ? app.get_id() : null;
  }

  // The name a picked window is added to the rules as: its application id, or failing that its WM_CLASS
  // (the same two names getAppRule() matches against)
  _getWindowRuleName(metaWindow) {
    return this._getWindowAppId(metaWindow) || metaWindow.get_wm_class() || null;
  }

  // Add a (disabled) application specific rule for the window's application, so the user can
  // choose its effects and then enable it. Nothing is added if the application already has a rule.
  _addWindowToAppRules(metaWindow) {
    let name = this._getWindowRuleName(metaWindow);
    if (!name) {
      this._notify(_("Unable to determine the application or the WM_CLASS of that window, therefore application specific effects can not be applied to it"));
      return;
    }
    let appID = this._getWindowAppId(metaWindow);
    let wmClass = metaWindow.get_wm_class();
    let appRules = (this._settings.getValue("app-rules") || []).map(rule => Object.assign({}, rule));
    let existing = appRules.find(rule => rule.application && ((appID && rule.application == appID) || (wmClass && rule.application == wmClass)));
    if (existing) {
      this._notify(_("There is already an entry for") + " \"" + existing.application + "\"" +
                   (existing.enabled ? "" : " (" + _("not enabled") + ")") + ".");
      return;
    }
    let entry = {};
    let data = this._settings.settingsData ? this._settings.settingsData["app-rules"] : null;
    for (let column of (data && data.columns) || []) {
      if (column.default !== undefined)
        entry[column.id] = column.default;
    }
    entry.enabled = false;
    entry.application = name;
    appRules.push(entry);
    this._settings.setValue("app-rules", appRules);
    this._notify(_("Added an entry for") + " \"" + name + "\". " + _("Choose its effects, then enable it."));
  }

  _notify(text) {
    let source = new MessageTray.Source(this.meta.name);
    let notification = new MessageTray.Notification(source, this.meta.name, text,
      {icon: new St.Icon({icon_name: "cinnamon-burn-my-window", icon_type: St.IconType.FULLCOLOR, icon_size: source.ICON_SIZE })}
      );
    Main.messageTray.add(source);
    source.notify(notification);
  }

  on_test_button_pressed() {
    let command = GLib.get_user_data_dir() + "/cinnamon/extensions/" + UUID + "/CinnamonBurnMyWindowsTest";
    Util.spawnCommandLineAsync(command);
  }

}

let extension = null;

function enable() {
  extension.enable();
  return Callbacks
}

function disable() {
  extension.disable();
  extension = null;
}

function init(metadata) {
	if(!extension) {
		extension = new BurnMyWindows(metadata);
	}
}

const Callbacks = {
  on_pick_application_window: function() {
     if (extension)
        extension.pickWindow();
  },
  on_test_button_pressed: function() {
     extension.on_test_button_pressed();
  }
}
