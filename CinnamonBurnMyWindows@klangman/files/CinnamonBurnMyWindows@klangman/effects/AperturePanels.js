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

// SPDX-License-Identifier: GPL-3.0-or-later

'use strict';

// We import some modules only in the Shell process as they are not available in the
// preferences process. They are used only in the creator function of the ShaderFactory
// which is only called within GNOME Shell's process.
const {ShaderFactory} = require('./ShaderFactory.js');
const Clutter = imports.gi.Clutter;
const Meta    = imports.gi.Meta;
const Main    = imports.ui.main;

const Gettext = imports.gettext;
const GLib = imports.gi.GLib;
const UUID = "CinnamonBurnMyWindows@klangman";

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale");

function _(text) {
  let locText = Gettext.dgettext(UUID, text);
  if (locText == text) {
    locText = window._(text);
  }
  return locText;
}

// Tunables (candidates for user settings). More live at the top of
// resources/shaders/aperture-panels.frag. The panel size is a setting (aperture-panels-panel-size).
const SHADOW_MARGIN = 64;  // px around the window covered by the layers, for its shadow

// Values of the aperture-panels-wave-shape and aperture-panels-flip-axis settings (see
// settings-schema.json; wave shapes 0-4 are described in aperture-panels.frag).
const WAVE_SHAPE_RANDOM  = 5;
const FLIP_AXIS_VERTICAL = 0;
const FLIP_AXIS_RANDOM   = 2;
const BACKDROP_BLACK_VOID = 1;  // aperture-panels-backdrop: 0 = Wallpaper, 1 = Black void

//////////////////////////////////////////////////////////////////////////////////////////
// The window is split into a grid of panels (like the moving wall panels in the Portal //
// games) which flip over one after another, revealing the window on their back when it //
// opens and what was behind it when it closes.                                         //
//                                                                                      //
// A shader only sees the texture of the actor it is attached to, so unlike the other   //
// effects this one does not draw on the window itself. createLayers() (called by       //
// extension.js) stacks four actors over the window, drawn after all windows:           //
//   wall  = the desktop: wallpaper, icons, desklets (no shader); black instead         //
//   front = the windows behind (a following shader, uLayer = 0), and the desktop       //
//           with the "Black void" backdrop                                             //
//   back  = a clone of the window itself (extension.js's shader, uLayer = 1)           //
//   above = clones of the windows above the window (no shader)                         //
// The real window is hidden meanwhile. See resources/shaders/aperture-panels.frag.     //
//////////////////////////////////////////////////////////////////////////////////////////

// The effect class can be used to get some metadata (like the effect's name or supported
// GNOME Shell versions), to initialize the respective page of the settings dialog, as
// well as to create the actual shader for the effect.
var Effect = class Effect {

  // The constructor creates a ShaderFactory which will be used by extension.js to create
  // shader instances for this effect. The shaders will be automagically created using the
  // GLSL file in resources/shaders/<nick>.frag. The callback will be called for each
  // newly created shader instance.
  constructor() {
    this.shaderFactory = new ShaderFactory(Effect.getNick(), (shader) => {
      // Store uniform locations of newly created shaders.
      shader._uLayer     = shader.get_uniform_location('uLayer');
      shader._uTexRect   = shader.get_uniform_location('uTexRect');
      shader._uLayerSize = shader.get_uniform_location('uLayerSize');
      shader._uFrame     = shader.get_uniform_location('uFrame');
      shader._uCell      = shader.get_uniform_location('uCell');

      shader._uWaveShape    = shader.get_uniform_location('uWaveShape');
      shader._uVerticalAxis = shader.get_uniform_location('uVerticalAxis');
      shader._uBorderStyle  = shader.get_uniform_location('uBorderStyle');
      shader._uBorderColor  = shader.get_uniform_location('uBorderColor');
    });
  }

  // -------------------------------------------------------------- API for extension.js

  // Called by extension.js (instead of its usual canvas / scaling set-up) with the window
  // actor and the shader it will animate. Builds the layers and returns
  //   paintTarget: the actor extension.js attaches `shader` to
  //   update():    called once a frame (from the animation's timeline) to follow the window
  //   destroy():   called once the animation has ended or was interrupted
  // `ctx` holds settings, forOpening, testMode, duration (ms), texPadding (how Clutter
  // splits the 3px offscreen-texture padding: 'enlarged' or 'centred', see extension.js),
  // and helpers from extension.js: insertAboveWindows(actors) puts actors where effect
  // actors go on the stage, cloneWindow(layer, windowActor, ox, oy) adds a clone of another
  // window to a layer whose top-left is at ox, oy on the stage, and stack (see
  // _createStackTracker()) says which windows are below / above this one and when that
  // changed.
  createLayers(actor, shader, ctx) {
    const backShader  = shader;
    const frontShader = this.shaderFactory.getShader();

    // Target panel size in pixels; adjusted so the grid fits the window exactly.
    const panelSize = Math.max(1, ctx.settings.getValue('aperture-panels-panel-size'));

    // Backdrop: what shows behind the panels as they turn. "Wallpaper": the desktop stays on
    // the wall and only the windows behind are painted on the panels. "Black void": the
    // desktop (wallpaper, desktop icons, desklets) is painted on the panels too, so it flips
    // with them and the wall is black.
    const blackVoid = ctx.settings.getValue('aperture-panels-backdrop') === BACKDROP_BLACK_VOID;

    const group = new Clutter.Actor({reactive: false});
    const newLayer = (props = {}) => {
      const layer = new Clutter.Actor(Object.assign({clip_to_allocation: true, reactive: false}, props));
      group.add_child(layer);
      return layer;
    };
    const wall  = newLayer({background_color: Clutter.Color.from_string('black')[1]});
    const front = newLayer();
    const back  = newLayer();
    const above = newLayer();  // clones of the windows above, so they stay in front (no shader)

    // Window geometry. While opening it's read every frame (the window may still be placed
    // or resized). While closing / minimizing it's taken once, now: when a maximized window
    // closes, Muffin's meta_window_unmanage() first starts this animation and then calls
    // unmaximize_window_before_freeing(), which moves the frame to its saved unmaximized
    // rectangle (the actor keeps showing the maximized window), so later reads are wrong.
    const readWindow = () => {
      const f = actor.get_meta_window().get_frame_rect();
      return {frame: {x: f.x, y: f.y, width: f.width, height: f.height},
              actor: {x: actor.x, y: actor.y, width: actor.width, height: actor.height}};
    };
    const frozen = ctx.forOpening ? null : readWindow();

    // Where the layers go and how the window is split. The layers cover the window, its
    // shadow and a margin, trimmed to the screen: Clutter never renders anything
    // off-screen into an effect's texture anyway.
    const geometry = () => {
      const w     = frozen || readWindow();
      const frame = w.frame;
      const act   = w.actor;
      // (Not the paint volume: it's unreliable at map time and would make the geometry
      // change from one frame to the next. SHADOW_MARGIN covers Muffin's shadows.)
      const rects = [frame, act];
      const x1 = Math.max(0, Math.floor(Math.min(...rects.map(r => r.x))) - SHADOW_MARGIN);
      const y1 = Math.max(0, Math.floor(Math.min(...rects.map(r => r.y))) - SHADOW_MARGIN);
      const x2 = Math.min(global.stage.width,  Math.ceil(Math.max(...rects.map(r => r.x + r.width)))  + SHADOW_MARGIN);
      const y2 = Math.min(global.stage.height, Math.ceil(Math.max(...rects.map(r => r.y + r.height))) + SHADOW_MARGIN);

      // Grid over the visible window only, with a panel size that divides it exactly.
      const cols = Math.max(1, Math.round(frame.width  / panelSize));
      const rows = Math.max(1, Math.round(frame.height / panelSize));

      const g = {ox: x1, oy: y1, OW: Math.max(1, x2 - x1), OH: Math.max(1, y2 - y1),
                 frame: {x: frame.x, y: frame.y, width: frame.width, height: frame.height},
                 cellW: frame.width / cols, cellH: frame.height / rows,
                 actorX: act.x, actorY: act.y};
      g.key = JSON.stringify(g);
      return g;
    };

    // (Re)fill the layers with clones for geometry `g`.
    const populate = (g) => {
      group.set_position(g.ox, g.oy);
      group.set_size(g.OW, g.OH);
      for (const layer of [wall, front, back, above]) {
        layer.destroy_all_children();
        layer.set_size(g.OW, g.OH);
      }

      const addClone = (parent, source) => {
        const [sx, sy] = source.get_transformed_position();
        parent.add_child(new Clutter.Clone({source: source, reactive: false,
                                            x: Math.round(sx - g.ox), y: Math.round(sy - g.oy)}));
      };
      // Other windows go through extension.js, which places them by x / y, follows their
      // opacity and shows their own ongoing animations (see _addWindowClone()).
      const addWindow = (parent, wa) => ctx.cloneWindow(parent, wa, g.ox, g.oy);

      // Where the desktop goes: the wall, or the panels' front (see blackVoid). Bottom to top:
      // wallpaper, desktop windows (icons), desklets; then the normal windows behind.
      const desk = blackVoid ? front : wall;

      if (global.background_actor) addClone(desk, global.background_actor);

      // Which windows are below / above is decided by extension.js's stack tracker (it knows
      // about windows raised while this one closes or minimizes).
      const area   = {x: g.ox, y: g.oy, width: g.OW, height: g.OH};
      const behind = ctx.stack.windowsNear(area, false);
      const isDesktop = (wa) => wa.get_meta_window().get_window_type() === Meta.WindowType.DESKTOP;

      for (const wa of behind.filter(isDesktop)) {
        addWindow(desk, wa);
      }

      // Desklets sit on the desktop, above the desktop icons.
      const desklets = (Main.deskletContainer && Main.deskletContainer.actor) || null;
      if (desklets) addClone(desk, desklets);

      for (const wa of behind.filter(wa => !isDesktop(wa))) {
        addWindow(front, wa);
      }

      // The window itself, at its real position so its shadow fits too. Placed by x / y: at
      // map time the transformed position can still report the old allocation (seen as a
      // jump at the end, small for GTK3 windows, large for client-side decorated GTK4 ones).
      back.add_child(new Clutter.Clone({source: actor, reactive: false,
                                        x: Math.round(g.actorX - g.ox), y: Math.round(g.actorY - g.oy)}));

      for (const wa of ctx.stack.windowsNear(area, true)) {
        addWindow(above, wa);
      }

      for (const s of [frontShader, backShader]) {
        s.set_uniform_float(s._uLayerSize, 2, [g.OW, g.OH]);
        s.set_uniform_float(s._uFrame,     4, [g.frame.x - g.ox, g.frame.y - g.oy, g.frame.width, g.frame.height]);
        s.set_uniform_float(s._uCell,      2, [g.cellW, g.cellH]);
        s.set_uniform_float(s._uTexRect,   4, [0, 0, g.OW, g.OH]);  // corrected once painted
      }
    };

    let geo = geometry();
    populate(geo);

    // Same place as extension.js's unscaled canvas: after all windows, below panels and
    // menus (see _insertAboveWindows() in extension.js).
    ctx.insertAboveWindows([group]);

    frontShader.set_uniform_float(frontShader._uLayer, 1, [0]);
    backShader.set_uniform_float(backShader._uLayer,   1, [1]);

    // The user's settings. Set here rather than in a 'begin-animation' handler: both shaders
    // must get the same values, including the same pick for the "Random" options.
    const settings  = ctx.settings;
    let   waveShape = settings.getValue('aperture-panels-wave-shape');
    if (waveShape === WAVE_SHAPE_RANDOM) {
      waveShape = Math.floor(Math.random() * WAVE_SHAPE_RANDOM);
    }
    let flipAxis = settings.getValue('aperture-panels-flip-axis');
    if (flipAxis === FLIP_AXIS_RANDOM) {
      flipAxis = Math.floor(Math.random() * FLIP_AXIS_RANDOM);
    }
    const bc = Clutter.Color.from_string(settings.getValue('aperture-panels-border-color'))[1];
    for (const s of [frontShader, backShader]) {
      s.set_uniform_float(s._uWaveShape,    1, [waveShape]);
      s.set_uniform_float(s._uVerticalAxis, 1, [flipAxis === FLIP_AXIS_VERTICAL ? 1 : 0]);
      s.set_uniform_float(s._uBorderStyle,  1, [settings.getValue('aperture-panels-border-style')]);
      s.set_uniform_float(s._uBorderColor,  4, [bc.red / 255, bc.green / 255, bc.blue / 255, bc.alpha / 255]);
    }
    front.add_effect_with_name('burn-my-windows-follower', frontShader);
    frontShader.beginFollowing(backShader, ctx.settings, ctx.forOpening, ctx.testMode, ctx.duration, actor);

    // The offscreen texture is slightly larger than the layer (3px of padding). Read its
    // real size every frame (see Shader.getTextureRect()) so the shader's pixel mapping is exact.
    const updateTexRect = (s) => {
      // Layer coordinates; the unpadded layer until the texture exists.
      const t = s.getTextureRect(geo.OW, geo.OH, ctx.texPadding === 'centred' ? 'centred' : 'enlarged');
      s.set_uniform_float(s._uTexRect, 4, t || [0, 0, geo.OW, geo.OH]);
    };
    const texRectIds = [frontShader, backShader].map(
      s => [s, s.connect('update-animation', () => updateTexRect(s))]);

    // Hide the real window; the clone still renders it. The effect container is set first
    // (and cleared first at the end), see the unscaled canvas in extension.js.
    actor._bmwEffectContainer = back;
    actor.opacity = 0;

    // Set when the window has moved; the stack tracker (ctx.stack) says when the stacking
    // order changed (an unminimized window is often only raised after this point, or the
    // user raises another window). The clones are re-sorted in update() below.
    let dirty = false;

    let actorGone = false;
    const destroyId = actor.connect('destroy', () => { actorGone = true; });

    return {
      paintTarget: back,

      // Called by extension.js once a frame, before layout and painting (after it has moved
      // the window actor to follow the window). During an open, the window may still be
      // placed or resized after this point. Never do this from notify::allocation:
      // destroying clones while their source window is being mapped crashes Clutter.
      update: () => {
        const g = geometry();
        if (g.key !== geo.key) {
          geo   = g;
          dirty = true;
        }
        const restacked = ctx.stack.takeDirty();
        if (dirty || restacked) {
          dirty = false;
          populate(geo);
        }
      },

      destroy: () => {
        for (const [s, id] of texRectIds) s.disconnect(id);
        if (!actorGone) {
          actor.disconnect(destroyId);
          actor._bmwEffectContainer = null;
          actor.opacity = 255;
        }
        frontShader.stopFollowing();
        front.remove_effect(frontShader);
        frontShader.returnToFactory();
        group.destroy();  // also destroys the layers and clones
      }
    };
  }

  // ---------------------------------------------------------------------------- metadata

  // The effect is available on all GNOME Shell versions supported by this extension.
  static getMinShellVersion() {
    return [3, 36];
  }

  // This will be called in various places where a unique identifier for this effect is
  // required. It should match the prefix of the settings keys which store whether the
  // effect is enabled currently (e.g. '*-close-effect'), and its animation time
  // (e.g. '*-animation-time').
  static getNick() {
    return 'aperture-panels';
  }

  // This will be shown in the sidebar of the preferences dialog as well as in the
  // drop-down menus where the user can choose the effect.
  static getLabel() {
    return _('Aperture Panels');
  }

  // -------------------------------------------------------------------- API for prefs.js

  // This is called by the preferences dialog whenever a new effect profile is loaded. It
  // binds all user interface elements to the respective settings keys of the profile.
  static bindPreferences(dialog) {
    dialog.bindAdjustment('aperture-panels-animation-time');
    dialog.bindAdjustment('aperture-panels-panel-size');
    dialog.bindColorButton('aperture-panels-border-color');
  }

  // ---------------------------------------------------------------- API for extension.js

  // The window is never scaled: the layers from createLayers() cover everything needed.
  static getActorScale(settings, forOpening, actor) {
    return {x: 1.0, y: 1.0};
  }

  // The getSFX() is called from extension.js to get the sound effect file for this effect
  static getSFX(settings, forOpening) {
     if (forOpening) {
        return settings.getValue("aperture-panels-open-sound");
     } else {
        return settings.getValue("aperture-panels-close-sound");
     }
  }
}
