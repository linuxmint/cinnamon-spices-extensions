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

const Apparition = require('./effects/Apparition.js');
const AuraGlow = require('./effects/AuraGlow.js');
const BrokenGlass = require('./effects/BrokenGlass.js');
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
const Matrix = require('./effects/Matrix.js');
const Mushroom = require('./effects/Mushroom.js');
const PaintBrush = require('./effects/PaintBrush.js');
const Pixelate = require('./effects/Pixelate.js');
const PixelWheel = require('./effects/PixelWheel.js');
const PixelWipe = require('./effects/PixelWipe.js');
const Portal = require('./effects/Portal.js');
const RGBWarp = require('./effects/RGBWarp.js');
const SnapOfDisintegration = require('./effects/SnapOfDisintegration.js');
const TeamRocket = require('./effects/TeamRocket.js');
const TRexAttack = require('./effects/TRexAttack.js');
const TVEffect = require('./effects/TVEffect.js');
const TVGlitch = require('./effects/TVGlitch.js');
const Wisps = require('./effects/Wisps.js');

const ShouldAnimateManager = require("ShouldAnimateManager.js");

const Main = imports.ui.main;
const Gio = imports.gi.Gio;
const Meta = imports.gi.Meta;
const Gettext = imports.gettext;
const GLib = imports.gi.GLib;
const Settings = imports.ui.settings;
const MessageTray = imports.ui.messageTray;
const St = imports.gi.St;
const Cinnamon = imports.gi.Cinnamon;
const SignalManager = imports.misc.signalManager;

const Effect = {
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

var extensionThis;

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale");

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

      // Effects in this array must be ordered by effect number as defined by the setting-schema.json.
      // New effects will be added in alphabetical order in the UI list, but the effect number, and
      // therefore the order in this array, might not be alphabetical.
      this._ALL_EFFECTS = [
         new Apparition.Effect(),
         new BrokenGlass.Effect(),
         new Doom.Effect(),
         new EnergizeA.Effect(),
         new EnergizeB.Effect(),
         new Fire.Effect(this._signalManager, this._settings),
         new Glide.Effect(),
         new Glitch.Effect(),
         new Hexagon.Effect(),
         new Incinerate.Effect(),
         new Matrix.Effect(),
         new PaintBrush.Effect(),
         new Pixelate.Effect(),
         new PixelWheel.Effect(),
         new PixelWipe.Effect(),
         new Portal.Effect(),
         new SnapOfDisintegration.Effect(),
         new TRexAttack.Effect(),
         new TVEffect.Effect(),
         new TVGlitch.Effect(),
         new Wisps.Effect(),
         new Focus.Effect(),
         new AuraGlow.Effect(),
         new TeamRocket.Effect(),
         new RGBWarp.Effect(),
         new Mushroom.Effect(this._signalManager, this._settings),
         new MagicLamp.Effect(),
      ];

      // We will use extensionThis to refer to the extension inside the patched methods.
      extensionThis = this;

      // Settings connections to connect to the mimimize/unminimize events when required
      this._settings.bind("minimize-effect", "minimizeEffect", this._enableMinimizeEffects);
      this._settings.bind("unminimize-effect", "unminimizeEffect", this._enableMinimizeEffects);

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

      // Make sure to remove any effects if requested by the window manager.
      this._killEffectsSignal = global.window_manager.connect('kill-window-effects', (wm, actor) => {
         const shader = actor.get_effect('burn-my-windows-effect');
         if (shader) {
            shader.endAnimation();
         }
      });
  }

  // This function will ensure that all the effects are defined in the "random_include" list.
  // After an upgrade, new effects might have been added, in which case we would need to add new
  // List entries to "random_include" for the new effect(s). This function assumes that only
  // new effect changes can occur, no removal or renaming is allowed. It also assumes that the
  // Effect const and the "random-include" setting are both in alphabetical order.
  _upgradeRandomIncludeEffects() {
     let randomInclude =  this._settings.getValue("random-include");
     let effects = Object.entries(Effect);
     if (randomInclude.length != effects.length) {
        let newRandomInclude = [];
        let i = 0;
        for (let ei=0 ; ei < effects.length ; ei++) {
           if (i < randomInclude.length && randomInclude[i].name == effects[ei][1].name) {
              newRandomInclude.push(randomInclude[i]);
              i++;
           } else {
              if (effects[ei][1].idx < 900) // idx of 900 or higher is reserved for non-effect types, i.e. None and Random
                 newRandomInclude.push( {name: effects[ei][1].name, open: true, close: true, minimize: true, unminimize: true} );
           }
        }
        this._settings.setValue("random-include", newRandomInclude);
     }
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
    if (!this._minimizeConnected && (appRuleUses || this.minimizeEffect !== Effect.None.idx || this.unminimizeEffect !== Effect.None.idx)) {
       let error = this.shouldAnimateManager.connect(ShouldAnimateManager.Events.Minimize+ShouldAnimateManager.Events.Unminimize, this._shouldAnimateHandler );
       if (error) {
          // Disable all the minimize/unminimize effects
          this.minimizeEffect = Effect.None.idx;
          this.unminimizeEffect = Effect.None.idx;
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
         //if (chosenEffect.effect instanceof Doom.Effect && (event === ShouldAnimateManager.Events.MapWindow || event === ShouldAnimateManager.Events.Unminimize)) {
            // Hack fix for Doom, not sure why I need to move the window in this way,
            // but it does not effect the resulting Y location of the window after animation
            //actor.set_y(actor.y-32);
         //}

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
    return ShouldAnimateManager.RUN_ORIGINAL_FUNCTION;
  }

  // This function could be called after the extension is uninstalled, disabled in GNOME
  // Tweaks, when you log out or when the screen locks.
  disable() {
    // Stop monitoring focus changes
    this._signalManager.disconnectAllSignals();

    // Free all effect resources.
    this._ALL_EFFECTS = [];

    global.window_manager.disconnect(this._killEffectsSignal);

    // Restore the original window-open, window-close, Minimize and Unminimize animations.
    this.shouldAnimateManager.disconnect();

    this._settings = null;
  }

  // Choose an effect based on the users preferences as defined in the setting for the current window action
  _chooseEffect(actor, event) {
    let effectIdx;
    let metaWindow = actor.meta_window;
    let windowType = metaWindow.get_window_type();
    let dialog = (this._settings.getValue("dialog-special") === true && (windowType === Meta.WindowType.DIALOG || windowType === Meta.WindowType.MODAL_DIALOG));
    let appRule = (!dialog) ? this.getAppRule(metaWindow) : null;

    switch (event) {
      case ShouldAnimateManager.Events.MapWindow:
        if (appRule) {
          effectIdx = appRule.open;
        } else {
          effectIdx = (!dialog) ? this._settings.getValue("open-window-effect") : this._settings.getValue("dialog-open-effect");
        }
        break;
      case ShouldAnimateManager.Events.DestroyWindow:
        if (appRule) {
          effectIdx = appRule.close;
        } else {
          effectIdx = (!dialog) ? this._settings.getValue("close-window-effect") : this._settings.getValue("dialog-close-effect");
        }
        break;
      case ShouldAnimateManager.Events.Minimize:
        if (appRule) {
          effectIdx = appRule.minimize;
        } else {
          effectIdx = this.minimizeEffect;
        }
        break;
      case ShouldAnimateManager.Events.Unminimize:
        if (appRule) {
          effectIdx = appRule.unminimize;
        } else {
          effectIdx = this.unminimizeEffect;
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
            if (random.unminimized)
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
  getAppRule(metaWindow) {
    let app = this._windowTracker.get_window_app(metaWindow);
    if (!app) {
      app = this._windowTracker.get_app_from_pid(metaWindow.get_pid());
    }
    let appID = null;
    if (app && !app.is_window_backed()) {
      appID = app.get_id();
    }
    let wmClass = metaWindow.get_wm_class();
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
    // GNOME Shell has been restarted in the meantime).
    const oldShader = actor.get_effect('burn-my-windows-effect');
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
    const actorScale =
      effect.constructor.getActorScale(this._settings, forOpening, actor);

    // All scaling is relative to the window's center.
    actor.set_pivot_point(0.5, 0.5);
    actor.opacity = 255;
    actor.scale_x = actorScale.x;
    actor.scale_y = actorScale.y;

    // If we are in the overview, we have to enlarge the window's clone as well. We also
    // disable the clone's overlay (e.g. its icon, name, and close button) during the
    // animation.
    if (actor._bmwOverviewClone) {
      actor._bmwOverviewClone.overlayEnabled = false;
      actor._bmwOverviewCloneContainer.set_pivot_point(0.5, 0.5);
      actor._bmwOverviewCloneContainer.scale_x = actorScale.x;
      actor._bmwOverviewCloneContainer.scale_y = actorScale.y;
    }

    // Now add a cool shader to our window actor!
    const shader = effect.shaderFactory.getShader(event);
    actor.add_effect_with_name('burn-my-windows-effect', shader);

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

      // Restore the original scale of the window actor.
      actor.scale_x = 1.0;
      actor.scale_y = 1.0;

      // Remove the shader and mark it being re-usable for future animations.
      actor.remove_effect(shader);
      shader.returnToFactory();

      // Finally, once the animation is done or interrupted, we call the methods which
      // should have been called by the original ease() methods.
      // https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/windowManager.js#L1487
      // https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/windowManager.js#L1558.
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

    // To make things deterministic during testing, we set the effect duration to 8
    // seconds.
    const duration = testMode ?
      8000 :
      profile.getValue(effect.constructor.getNick() + '-animation-time');

    // Finally start the animation!
    shader.beginAnimation(profile, forOpening, testMode, duration, actor);
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
     extension.on_config_button_pressed()
  }
}
