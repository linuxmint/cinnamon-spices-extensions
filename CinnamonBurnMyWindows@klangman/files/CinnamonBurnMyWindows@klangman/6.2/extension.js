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

const Apparition = require('./effects/Apparition');
const BrokenGlass = require('./effects/BrokenGlass');
const Doom = require('./effects/Doom.js');
const EnergizeA = require('./effects/EnergizeA.js');
const EnergizeB = require('./effects/EnergizeB.js');
const Fire = require('./effects/Fire.js');
const Focus = require('./effects/Focus.js');
const Glide = require('./effects/Glide.js');
const Glitch = require('./effects/Glitch.js');
const Hexagon = require('./effects/Hexagon.js');
const Incinerate = require('./effects/Incinerate.js');
const Matrix = require('./effects/Matrix.js');
const PaintBrush = require('./effects/PaintBrush.js');
const Pixelate = require('./effects/Pixelate.js');
const PixelWheel = require('./effects/PixelWheel.js');
const PixelWipe = require('./effects/PixelWipe.js');
const Portal = require('./effects/Portal.js');
const SnapOfDisintegration = require('./effects/SnapOfDisintegration.js');
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
  Apparition: 0,
  BrokenGlass: 1,
  Doom: 2,
  EnergizeA: 3,
  EnergizeB: 4,
  Fire: 5,
  Focus: 21,
  Glide: 6,
  Glitch: 7,
  Hexagon: 8,
  Incinerate: 9,
  Matrix: 10,
  PaintBrush: 11,
  Pixelate: 12,
  PixelWheel: 13,
  PixelWipe: 14,
  Portal: 15,
  SnapOfDisintegration: 16,
  TRexAttack: 17,
  TVEffect: 18,
  TVGlitch: 19,
  Wisps: 20,
  Randomized: 999,
  None: 1000
}

const UUID = "CinnamonBurnMyWindows@klangman";

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
   }
   // ------------------------------------------------------------------------ public stuff

   // This function could be called after the extension is enabled, which could be done
   // from GNOME Tweaks, when you log in or when the screen is unlocked.
   enable() {
      // Effects in this array must be ordered by effect number as defined by the setting-schema.json.
      // New effects will be added in alphabetical order in the UI list, but the effect number, and
      // therefore the order in this array, might not be alphabetical.
      this._ALL_EFFECTS = [
         new Apparition.Effect(),
         new BrokenGlass.Effect(),
         new Doom.Effect(),
         new EnergizeA.Effect(),
         new EnergizeB.Effect(),
         new Fire.Effect(),
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
      ];

      // Store a reference to the settings object.
      this._settings = new Settings.ExtensionSettings(this, this.meta.uuid);

      // Keep track of the previously focused Application
      this._signalManager = new SignalManager.SignalManager(null);
      this._signalManager.connect(global.display, "notify::focus-window", this._onFocusChanged, this);

      // WindowTracker so we can map windows to application
      this._windowTracker = Cinnamon.WindowTracker.get_default();

      // We will use extensionThis to refer to the extension inside the patched methods.
      const extensionThis = this;

      // Intercept _shouldAnimate() for Window Map/Destroy events
      this.shouldAnimateManager = new ShouldAnimateManager.ShouldAnimateManager( UUID );
      let error = this.shouldAnimateManager.connect(ShouldAnimateManager.Events.MapWindow+ShouldAnimateManager.Events.DestroyWindow,
         function(actor, types, event) {
            // If there is an applicable effect profile, we intercept the ease() method to
            // setup our own effect.
            const chosenEffect = extensionThis._chooseEffect(actor, (event == ShouldAnimateManager.Events.MapWindow));

            if (chosenEffect) {
               // Store the original ease() method of the actor.
               const orig = actor.ease;

               // Temporarily force the new window & closing window effect to be enabled in cinnamon
               let orig_desktop_effects_map_type = Main.wm.desktop_effects_map_type;
               let orig_desktop_effects_close_type = Main.wm.desktop_effects_close_type;
               Main.wm.desktop_effects_map_type = "traditional";
               Main.wm.desktop_effects_close_type = "traditional";

               // Now intercept the next call to actor.ease().
               actor.ease = function(...params) {
                  // There is a really weird issue in GNOME Shell 44: A few non-GTK windows are
                  // resized directly after they are mapped on X11. This happens for instance
                  // for keepassxc after it was closed in the maximized state. As the
                  // _mapWindow() method is called asynchronously, the window is not yet visible
                  // when the resize happens. Hence, our ease-override is called for the resize
                  // animation instead of the window-open or window-close animation. This is not
                  // what we want. So we check again whether the ease() call is for the
                  // window-open or window-close animation. If not, we just call the original
                  // ease() method. See also:
                  // https://github.com/Schneegans/Burn-My-Windows/issues/335
                  const stack      = (new Error()).stack;
                  const forClosing = stack.includes('_destroyWindow@');
                  const forOpening = stack.includes('_mapWindow@');

                  if (forClosing || forOpening) {
                    // Quickly restore the original behavior. Nobody noticed, I guess :D
                    actor.ease = orig;

                    // And then create the effect!
                    extensionThis._setupEffect(actor, forOpening, chosenEffect.effect,
                                               chosenEffect.profile);
                  } else {
                    orig.apply(this, params);
                  }
                  // Restore the original cinnamon new window & closing window effect settings
                  Main.wm.desktop_effects_map_type = orig_desktop_effects_map_type;
                  Main.wm.desktop_effects_close_type = orig_desktop_effects_close_type
             };

             return true;
            }

            return ShouldAnimateManager.RUN_ORIGINAL_FUNCTION;
         } );

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

    // Make sure to remove any effects if requested by the window manager.
    this._killEffectsSignal =
      global.window_manager.connect('kill-window-effects', (wm, actor) => {
        const shader = actor.get_effect('burn-my-windows-effect');
        if (shader) {
          shader.endAnimation();
        }
      });
  }

  // This function could be called after the extension is uninstalled, disabled in GNOME
  // Tweaks, when you log out or when the screen locks.
  disable() {
    // Stop monitoring focus changes
    this._signalManager.disconnectAllSignals();

    // Free all effect resources.
    this._ALL_EFFECTS = [];

    global.window_manager.disconnect(this._killEffectsSignal);

    // Restore the original window-open and window-close animations.
    this.shouldAnimateManager.disconnect();

    this._settings = null;
  }

  // Choose an effect based on the users preferences as defined in the setting for the current window action
  _chooseEffect(actor, forOpening) {
    let effectIdx;
    let appRule = this.getAppRule(actor.meta_window);
    if (forOpening) {
      if (appRule)
        effectIdx = appRule.open;
      else
        effectIdx = this._settings.getValue("open-window-effect");
    } else {
      if (appRule)
        effectIdx = appRule.close;
      else
        effectIdx = this._settings.getValue("close-window-effect");
    }
    if (effectIdx === Effect.None) {
       return(null);
    } else if (effectIdx != Effect.Randomized) {
       // Return the effect that the setting reflects
       return {effect: this._ALL_EFFECTS[effectIdx], profile: this._settings};
    } else {
      // Create an array of the enabled random options
      let effectOptions = [];
      let append = (forOpening)?"-open":"-close";
      if (this._settings.getValue("apparition-random-include" + append))
         effectOptions.push(Effect.Apparition);
      //if (this._settings.getValue("broken-glass-random-include" + append))
      //   effectOptions.push(Effect.BrokenGlass);
      if (this._settings.getValue("doom-random-include" + append))
         effectOptions.push(Effect.Doom);
      if (this._settings.getValue("energize-a-random-include" + append))
         effectOptions.push(Effect.EnergizeA);
      if (this._settings.getValue("energize-b-random-include" + append))
         effectOptions.push(Effect.EnergizeB);
      //if (this._settings.getValue("file-random-include" + append))
      //   effectOptions.push(Effect.Fire);
      if (this._settings.getValue("focus-random-include" + append))
         effectOptions.push(Effect.Focus);
      if (this._settings.getValue("glide-random-include" + append))
         effectOptions.push(Effect.Glide);
      if (this._settings.getValue("glitch-random-include" + append))
         effectOptions.push(Effect.Glitch);
      if (this._settings.getValue("hexagon-random-include" + append))
         effectOptions.push(Effect.Hexagon);
      if (this._settings.getValue("incinerate-random-include" + append))
         effectOptions.push(Effect.Incinerate);
      //if (this._settings.getValue("matrix-random-include" + append))
      //   effectOptions.push(Effect.Matrix);
      //if (this._settings.getValue("paint-brush-random-include" + append))
      //   effectOptions.push(Effect.PaintBrush);
      if (this._settings.getValue("pixelate-random-include" + append))
         effectOptions.push(Effect.Pixelate);
      if (this._settings.getValue("pixel-wheel-random-include" + append))
         effectOptions.push(Effect.PixelWheel);
      if (this._settings.getValue("pixel-wipe-random-include" + append))
         effectOptions.push(Effect.PixelWipe);
      if (this._settings.getValue("portal-random-include" + append))
         effectOptions.push(Effect.Portal);
      //if (this._settings.getValue("snap-of-disintegration-random-include" + append))
      //   effectOptions.push(Effect.SnapOfDisintegration);
      //if (this._settings.getValue("trex-attack-random-include" + append))
      //   effectOptions.push(Effect.TRexAttack);
      if (this._settings.getValue("tv-effect-random-include" + append))
         effectOptions.push(Effect.TVEffect);
      if (this._settings.getValue("tv-glitch-random-include" + append))
         effectOptions.push(Effect.TVGlitch);
      if (this._settings.getValue("wisps-random-include" + append))
         effectOptions.push(Effect.Wisps);
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
    if (app && !app.is_window_backed()) {
      let appID = app.get_id();
      let appRules = this._settings.getValue("app-rules");
      for( let i=0 ; i < appRules.length ; i++ ) {
        if (appRules[i].enabled && appRules[i].application == appID) {
          return(appRules[i]);
        }
      }
    }
    return(null);
  }

  // This method adds the given effect using the settings from the given profile to the
  // given actor.
  _setupEffect(actor, forOpening, effect, profile) {

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
    const shader = effect.shaderFactory.getShader();
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
      if (forOpening) {
        Main.wm._mapWindowDone(global.window_manager, actor);
      } else {
        Main.wm._destroyWindowDone(global.window_manager, actor);
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
      } else {
        let source = new MessageTray.Source(this.meta.name);
        let notification = new MessageTray.Notification(source, _("Error") + ": " + this.meta.name,
          _("The previously focused window is not backed by an application and therefore application specific effects can not be applied to that window"),
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
