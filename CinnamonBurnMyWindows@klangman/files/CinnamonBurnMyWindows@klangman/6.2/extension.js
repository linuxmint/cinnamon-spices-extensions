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
const Morph = require('./effects/Morph.js');
//const Matrix = require('./effects/Matrix.js');
const Mushroom = require('./effects/Mushroom.js');
//const PaintBrush = require('./effects/PaintBrush.js');
const Pixelate = require('./effects/Pixelate.js');
const PixelWheel = require('./effects/PixelWheel.js');
const PixelWipe = require('./effects/PixelWipe.js');
const Portal = require('./effects/Portal.js');
const RGBWarp = require('./effects/RGBWarp.js');
//const SnapOfDisintegration = require('./effects/SnapOfDisintegration.js');
const TeamRocket = require('./effects/TeamRocket.js');
//const TRexAttack = require('./effects/TRexAttack.js');
const TVEffect = require('./effects/TVEffect.js');
const TVGlitch = require('./effects/TVGlitch.js');
const Wisps = require('./effects/Wisps.js');
const Wormhole = require('./effects/Wormhole.js');

const ShouldAnimateManager = require("ShouldAnimateManager.js");

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
  Morph:       {idx: 29, name: "Morph"},
  Mushroom:    {idx: 25, name: "Mushroom"},
  //Matrix:      {idx: 10, name: "Matrix"},
  //PaintBrush:  {idx: 11, name: "Paint Brush"},
  Pixelate:    {idx: 12, name: "Pixelate"},
  PixelWheel:  {idx: 13, name: "Pixel Wheel"},
  PixelWipe:   {idx: 14, name: "Pixel Wipe"},
  Portal:      {idx: 15, name: "Portal"},
  RGBWarp:     {idx: 24, name: "RGB Warp"},
  //SnapOfDisintegration: {idx: 16, name: "Snap Of Disintegration"},
  TeamRocket:  {idx: 23, name: "Team Rocket"},
  //TRexAttack:  {idx: 17, name: "TRex Attack"},
  TVEffect:    {idx: 18, name: "TV Effect"},
  TVGlitch:    {idx: 19, name: "TV Glitch"},
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

const UUID = "CinnamonBurnMyWindows@klangman";

// Effects that need extra canvas (getActorScale() other than (1,1)) get it from an unscaled
// canvas holding a 1:1 clone of the window, instead of scaling the window itself. Scaling the
// window caused a visible jump at the end of the animation on Cinnamon
const USE_UNSCALED_CANVAS  = true;        // false = old behaviour: scale the window actor
const CANVAS_BEHIND_MARGIN = 64;          // px around the window covered by the behind layer
const CANVAS_TEX_PADDING   = 'enlarged';  // how Clutter splits the 3px offscreen-texture padding:
                                          // 'enlarged' = stock Muffin (mostly left/top),
                                          // 'centred'  = Muffin patched to pad evenly

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
      ];

      // We will use extensionThis to refer to the extension inside the patched methods.
      extensionThis = this;

      // Bind variables to setting effect values
      this._settings.bind("minimize-effect", "minimizeEffect", this._enableMinimizeEffects);
      this._settings.bind("unminimize-effect", "unminimizeEffect", this._enableMinimizeEffects);
      this._settings.bind("power-minimize-effect", "powerMinimizeEffect", this._enableMinimizeEffects);
      this._settings.bind("power-unminimize-effect", "powerUnminimizeEffect", this._enableMinimizeEffects);
      this._settings.bind("open-window-effect", "openEffect");
      this._settings.bind("dialog-open-effect", "dialogOpenEffect");
      this._settings.bind("power-open-effect", "powerOpenEffect");
      this._settings.bind("power-dialog-open-effect", "powerDialogOpenEffect");
      this._settings.bind("close-window-effect", "closeEffect");
      this._settings.bind("dialog-close-effect", "dialogCloseEffect");
      this._settings.bind("power-close-effect", "powerCloseEffect");
      this._settings.bind("power-dialog-close-effect", "powerDialogCloseEffect");
      this._settings.bind("enable-sound", "enableSound", this._enableSounds);

      // Keep track of the previously focused Application
      this._signalManager.connect(global.display, "notify::focus-window", this._onFocusChanged, this);

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
              newRandomInclude.push(element);
           } else {
              newRandomInclude.push( {name: effects[i][1].name, open: true, close: true, minimize: true, unminimize: true} );
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
           let sfx = chosenEffect.effect.constructor.getSFX(extensionThis._settings, (event & ShouldAnimateManager.Events.MapWindow) || (event & ShouldAnimateManager.Events.Unminimize) );
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

    switch (event) {
      case ShouldAnimateManager.Events.MapWindow:
        if (appRule) {
          effectIdx = appRule.open;
        } else {
          if (power) {
            effectIdx = (!dialog) ? this.powerOpenEffect : this.powerDialogOpenEffect;
          } else {
            effectIdx = (!dialog) ? this.openEffect : this.dialogOpenEffect;
          }
        }
        break;
      case ShouldAnimateManager.Events.DestroyWindow:
        if (appRule) {
          effectIdx = appRule.close;
        } else {
          if (power) {
            effectIdx = (!dialog) ? this.powerCloseEffect : this.powerDialogCloseEffect;
          } else {
            effectIdx = (!dialog) ? this.closeEffect : this.dialogCloseEffect;
          }
        }
        break;
      case ShouldAnimateManager.Events.Minimize:
        if (appRule) {
          effectIdx = appRule.minimize;
        } else {
          effectIdx = (power) ? this.powerMinimizeEffect : this.minimizeEffect;
        }
        break;
      case ShouldAnimateManager.Events.Unminimize:
        if (appRule) {
          effectIdx = appRule.unminimize;
        } else {
          effectIdx = (power) ? this.powerUnminimizeEffect : this.unminimizeEffect;
        }
        break;
    }
    if (effectIdx === Effect.None.idx) {
      // No effect should be applied
      return(null);
    } else if (effectIdx != Effect.Randomized.idx) {
      // Return the effect that the setting reflects
      return {effect: this._ALL_EFFECTS[effectIdx], profile: this._settings};
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
        return {effect: this._ALL_EFFECTS[effectOptions[(Math.floor(Math.random() * effectOptions.length))]], profile: this._settings};
      } else {
        return null;
      }
    }
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
    const actorScale = effect.constructor.getActorScale(this._settings, forOpening, actor);

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

    // Which windows are above / below this one while the clone layers of the canvas and of
    // layered effects are built (see _createStackTracker()).
    const stack = (useCanvas || layered) ? this._createStackTracker(actor, !forOpening) : null;

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
      // See _insertAboveWindows() for where they go.
      const cover = coverRect(geo);
      behindLayer = this._createBehindLayer(actor, cover, stack);
      aboveLayer  = this._createAboveLayer(actor, cover, stack);
      this._insertAboveWindows([behindLayer, canvas, aboveLayer]);

      // Hide the real window; the clone still renders it. _bmwEffectContainer is set before
      // the opacity drops and cleared before it comes back, so other code watching the
      // window's opacity (e.g. clones in other extensions, _addWindowClone()) can tell a window
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

    // Layered effects: the effect hides the window, stacks its own actors over it and
    // tells us which one gets the shader. It follows the window in layers.update() (called
    // once a frame, see onFrame below) and cleans up in layers.destroy().
    let layers = null;
    if (layered) {
      layers = effect.createLayers(actor, shader, {
        settings: profile, forOpening, testMode, duration, texPadding: CANVAS_TEX_PADDING, stack,
        insertAboveWindows: (actors) => this._insertAboveWindows(actors),
        cloneWindow: (layer, wa, ox, oy) => this._addWindowClone(layer, wa, ox, oy)
      });
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
    // 2. The canvas / layers follow the window (and the stacking order).
    const followBuffer = !!forOpening;
    const metaWindow   = actor.get_meta_window();
    const onFrame = () => {
      if (stack) stack.frame();
      if (followBuffer) {
        const b = metaWindow.get_buffer_rect();
        if (actor.x !== b.x || actor.y !== b.y) {
          actor.set_position(b.x, b.y);
        }
        if (actor.width !== b.width || actor.height !== b.height) {
          actor.set_size(b.width, b.height);
        }
      }
      if (syncCanvas) syncCanvas();
      if (layers && layers.update) layers.update();
    };
    if (shader._timeline) {
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

  // Puts `actors` (bottom to top) where effects that don't draw on the window itself put
  // their actors: in the window group's parent (Main.uiGroup), right above the window group.
  // Not inside the window group: while Muffin paints it, it limits each window to its
  // unobscured / freshly damaged region, and clones painted in that same pass inherit the
  // limit (holes and flashing). Above it, they are painted after all windows but still below
  // panels, Cinnamon's menus and application popup menus (global.top_window_group), as a
  // window would be. They also go above any other effect's actors that are still there, so
  // the newest animation, which has cloned those into its own layers, is drawn on top.
  _insertAboveWindows(actors) {
    const wg = global.window_group;
    let parent  = wg ? wg.get_parent() : null;
    let sibling = wg;
    if (!parent) {
      parent  = Main.uiGroup;
      sibling = null;
    }
    while (sibling && sibling.get_next_sibling() && sibling.get_next_sibling()._bmwEffectLayer) {
      sibling = sibling.get_next_sibling();
    }
    for (const a of actors) {
      a._bmwEffectLayer = true;
      if (sibling) {
        parent.insert_child_above(a, sibling);
      } else {
        parent.add_child(a);
      }
      sibling = a;
    }
  }

  // An empty, clipped actor covering `rect` (stage coordinates).
  _createCloneLayer(rect) {
    return new Clutter.Actor({x: rect.x, y: rect.y, width: rect.width, height: rect.height,
                              clip_to_allocation: true, reactive: false});
  }

  // Adds a clone of any actor to `layer`, whose top-left is at ox, oy on the stage.
  _addClone(layer, source, ox, oy) {
    const [sx, sy] = source.get_transformed_position();
    layer.add_child(new Clutter.Clone({source: source, reactive: false,
                                       x: Math.round(sx - ox), y: Math.round(sy - oy)}));
  }

  // Adds a clone of window actor `wa` to `layer`, whose top-left is at ox, oy on the stage.
  // - Placed by wa.x / y: at map time the transformed position can still report the old
  //   allocation.
  // - A clone ignores its source's opacity, so the clone follows the window's opacity
  //   (0 while the window is hidden by an effect of its own, Cinnamon's opacity settings).
  // - If the window is being animated by an effect that draws elsewhere (canvas, layers),
  //   its effect actor is cloned on top, so that animation shows through ours. Once it ends
  //   that clone goes blank and the window clone (opacity back to 255) takes over.
  _addWindowClone(layer, wa, ox, oy) {
    const clone = new Clutter.Clone({source: wa, reactive: false,
                                     x: Math.round(wa.x - ox), y: Math.round(wa.y - oy)});
    wa.bind_property('opacity', clone, 'opacity', GObject.BindingFlags.SYNC_CREATE);
    layer.add_child(clone);
    if (wa._bmwEffectContainer) {
      this._addClone(layer, wa._bmwEffectContainer, ox, oy);
    }
  }

  // Keeps track of which windows are above and below `actor` while its clone layers are
  // built, and says when that changed (takeDirty(), checked once a frame).
  // - Normally that's simply the order of the window actors.
  // - But while a window disappears (close / minimize, `disappearing`), Muffin keeps its
  //   actor where it was until the animation ends, even above windows raised meanwhile
  //   (meta_compositor_sync_stack() keeps hidden / unmanaging windows with an effect in
  //   progress in their old place). So a window raised during the animation is treated as
  //   above it, together with everything stacked above that window. Two ways to notice:
  //   * its 'raised' signal (clicking an unfocused window, Alt-Tab, ...);
  //   * a mouse button pressed over it. Clicking the window that already has the focus
  //     doesn't raise it: on X11 Muffin only grabs the buttons of unfocused windows, so it
  //     never sees that click. The pointer state is polled once a frame instead.
  //   Anything before the animation's first frame (stack.frame()) doesn't count: that's
  //   Muffin passing the focus on because this window is going away, and putting that
  //   window on top would hide most of the animation. Focus changes alone don't count
  //   either (focus-follows-mouse doesn't raise), nor does the desktop.
  // windowsNear(rect, above): the visible windows below (above = false) or above
  // (above = true) `actor` that intersect `rect`. Windows just outside `rect` count too, as
  // their shadow may reach into it (the layers are opaque, so the real one is hidden there).
  _createStackTracker(actor, disappearing) {
    const self     = actor.get_meta_window();
    const raised   = new Set();   // MetaWindows raised during the animation
    const ids      = new Map();   // window actor -> small number, for the stacking signature
    const handlers = [];          // [object, handler id]
    let   watching = false;
    let   lastSig  = null;

    const BUTTONS = Clutter.ModifierType.BUTTON1_MASK | Clutter.ModifierType.BUTTON2_MASK |
                    Clutter.ModifierType.BUTTON3_MASK;
    const buttonsDown = () => {
      const [x, y, mods] = global.get_pointer();
      return [x, y, (mods & BUTTONS) !== 0];
    };
    // A button already held when the animation starts (e.g. the click that closed the
    // window) is not a new click.
    let buttonWasDown = buttonsDown()[2];

    // The window a click at x, y went to, or null (a panel, a menu, the desktop, ...).
    const clickedWindow = (x, y) => {
      // Chrome (panels, menus) is above the windows and reactive; don't look further.
      const picked = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
      if (picked && picked !== global.stage && !global.window_group.contains(picked)) {
        return null;
      }
      const actors = global.get_window_actors().filter(a => a !== actor);
      for (let i = actors.length - 1; i >= 0; i--) {
        const wa = actors[i];
        if (!wa.visible) continue;
        const mw = wa.get_meta_window();
        if (!mw || mw.minimized) continue;
        const f = mw.get_frame_rect();
        if (x >= f.x && x < f.x + f.width && y >= f.y && y < f.y + f.height) {
          return mw.get_window_type() === Meta.WindowType.DESKTOP ? null : mw;
        }
      }
      return null;
    };

    if (disappearing) {
      for (const wa of global.get_window_actors()) {
        const mw = wa.get_meta_window();
        if (!mw || mw === self) continue;
        try {
          handlers.push([mw, mw.connect('raised', () => {
            if (watching && mw.get_window_type() !== Meta.WindowType.DESKTOP) raised.add(mw);
          })]);
        } catch (e) {
          // No 'raised' signal in this Muffin: windows raised meanwhile stay below.
        }
      }
    }

    const orderOf = () => {
      const actors = global.get_window_actors();
      const idx    = actors.indexOf(actor);
      const others = actors.filter(a => a !== actor);
      const onTop  = new Set(idx >= 0 ? actors.slice(idx + 1) : []);
      const first  = others.findIndex(a => {
        try {
          return raised.has(a.get_meta_window());
        } catch (e) {
          return false;
        }
      });
      if (first >= 0) others.slice(first).forEach(a => onTop.add(a));
      return {others, onTop};
    };

    // Which windows are above / below, as a string, to notice changes.
    const signature = () => {
      const {others, onTop} = orderOf();
      const id = (a) => {
        if (!ids.has(a)) ids.set(a, ids.size + 1);
        return ids.get(a);
      };
      return others.map(a => (onTop.has(a) ? '+' : '-') + id(a)).join(',');
    };
    // The layers are built right after this with the same order.
    lastSig = signature();

    return {
      frame: () => {
        watching = true;
        if (!disappearing) return;
        const [x, y, down] = buttonsDown();
        if (down && !buttonWasDown) {
          const mw = clickedWindow(x, y);
          if (mw && mw !== self) raised.add(mw);
        }
        buttonWasDown = down;
      },

      // True when the windows above / below changed since the last call (or since the
      // tracker was created). Checked every frame rather than on 'restacked', which Muffin
      // emits over and over while a hidden window is being animated.
      takeDirty: () => {
        const sig     = signature();
        const changed = sig !== lastSig;
        lastSig = sig;
        return changed;
      },

      windowsNear: (rect, above) => {
        const {others, onTop} = orderOf();
        const M = CANVAS_BEHIND_MARGIN;
        return others.filter(wa => onTop.has(wa) === above && wa.visible &&
          wa.x - M < rect.x + rect.width  && wa.x + wa.width  + M > rect.x &&
          wa.y - M < rect.y + rect.height && wa.y + wa.height + M > rect.y);
      },

      destroy: () => {
        for (const [obj, id] of handlers) {
          try {
            obj.disconnect(id);
          } catch (e) {
            // The window is gone already.
          }
        }
        handlers.length = 0;
        ids.clear();
        raised.clear();
      }
    };
  }

  // Clones of everything behind `actor` (wallpaper, desktop icons, desklets, lower windows)
  // covering `rect`. Opaque.
  _createBehindLayer(actor, rect, stack) {
    const layer = this._createCloneLayer(rect);

    if (global.background_actor) this._addClone(layer, global.background_actor, rect.x, rect.y);

    const desklets = (Main.deskletContainer && Main.deskletContainer.actor) || null;
    let deskletsAdded = false;
    for (const wa of stack.windowsNear(rect, false)) {
      // Desklets sit above the desktop window(s) and below normal windows.
      if (!deskletsAdded && desklets && wa.get_meta_window().get_window_type() !== Meta.WindowType.DESKTOP) {
        this._addClone(layer, desklets, rect.x, rect.y);
        deskletsAdded = true;
      }
      this._addWindowClone(layer, wa, rect.x, rect.y);
    }
    if (!deskletsAdded && desklets) this._addClone(layer, desklets, rect.x, rect.y);

    return layer;
  }

  // Clones of the windows above `actor` covering `rect`, so they stay in front of the
  // animation.
  _createAboveLayer(actor, rect, stack) {
    const layer = this._createCloneLayer(rect);
    for (const wa of stack.windowsNear(rect, true)) {
      this._addWindowClone(layer, wa, rect.x, rect.y);
    }
    return layer;
  }

  _onFocusChanged() {
     this.prev_focused_window = this.last_focused_window;
     this.last_focused_window = global.display.get_focus_window();
  }

  // When the button is pressed we will determine what the last focused was and add
  // and entry in the app specific list for that windows app
  on_config_button_pressed() {
    if (this.prev_focused_window) {
      let app = this._windowTracker.get_window_app(this.prev_focused_window);
      if (!app) {
        app = this._windowTracker.get_app_from_pid(this.prev_focused_window.get_pid());
      }
      if (app && !app.is_window_backed()) {
         let appRules = this._settings.getValue("app-rules");
         appRules.push( {enabled:false, open:0, close:0, application:app.get_id()} );
         this._settings.setValue("app-rules", appRules);
      } else if (this.prev_focused_window.get_wm_class()) {
         let appRules = this._settings.getValue("app-rules");
         appRules.push( {enabled:false, open:0, close:0, application:this.prev_focused_window.get_wm_class()} );
         this._settings.setValue("app-rules", appRules);
      } else {
        let source = new MessageTray.Source(this.meta.name);
        let notification = new MessageTray.Notification(source, _("Error") + ": " + this.meta.name,
          _("Unable to determine the application or the WM_CLASS of the previously focused window, therefore application specific effects can not be applied to that window"),
          {icon: new St.Icon({icon_name: "cinnamon-burn-my-window", icon_type: St.IconType.FULLCOLOR, icon_size: source.ICON_SIZE })}
          );
        Main.messageTray.add(source);
        source.notify(notification);
      }
    }
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
  on_config_button_pressed: function() {
     extension.on_config_button_pressed();
  },
  on_test_button_pressed: function() {
     extension.on_test_button_pressed();
  }
}
