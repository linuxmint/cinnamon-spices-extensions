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

//////////////////////////////////////////////////////////////////////////////////////////
// Morph: the area where the window appears morphs into the window. Both are warped   //
// (by a shared procedural "liquid flow" field, or each along the edges of its own     //
// image for "melt") and cross-dissolved. Shader: resources/shaders/morph.frag.         //
// Uses the createLayers() hook (see AperturePanels.js):                                //
//   surface = wallpaper, desktop, desklets and the windows behind, flattened by the    //
//             offscreen effect and warped as one image (a following shader, uLayer 0)  //
//   window  = a clone of the window itself (extension.js's shader, uLayer 1)           //
//   above   = clones of the windows above the window (no shader)                       //
//////////////////////////////////////////////////////////////////////////////////////////

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

// Tunables (the look is tuned at the top of morph.frag). User settings: morph-style, morph-strength.
const SHADOW_MARGIN = 64;   // px around the window actor covered by the layers, for its shadow
const MORPH_MARGIN  = 160;  // px around the frame covered by the layers: must exceed the shader's
                            // SPILL_PX + FLOW_PX + RADIAL_PX + BLUR_PX so nothing is cut off

var Effect = class Effect {

  constructor() {
    this.shaderFactory = new ShaderFactory(Effect.getNick(), (shader) => {
      shader._uLayer     = shader.get_uniform_location('uLayer');
      shader._uTexRect   = shader.get_uniform_location('uTexRect');
      shader._uFrameRect = shader.get_uniform_location('uFrameRect');
      shader._uSeed      = shader.get_uniform_location('uSeed');
      shader._uStyle     = shader.get_uniform_location('uStyle');
      shader._uStrength  = shader.get_uniform_location('uStrength');
    });
  }

  // -------------------------------------------------------------- API for extension.js

  // See effects/AperturePanels.js for the contract of this hook.
  createLayers(actor, shader, ctx) {
    const windowShader  = shader;
    const surfaceShader = this.shaderFactory.getShader();

    const group = new Clutter.Actor({reactive: false});
    const newLayer = (parent, props = {}) => {
      const layer = new Clutter.Actor(Object.assign({clip_to_allocation: true, reactive: false}, props));
      parent.add_child(layer);
      return layer;
    };
    // The surface is opaque, so the window drawn over it at alpha a is exactly a
    // cross-dissolve, and the warp never shows the real screen through it.
    const surface  = newLayer(group, {background_color: Clutter.Color.from_string('black')[1]});
    const wall     = newLayer(surface);  // wallpaper, desktop icons, desklets
    const behind   = newLayer(surface);  // windows behind
    const win      = newLayer(group);
    const above    = newLayer(group);

    // Window geometry: read every frame while opening (the window may still be placed),
    // once while closing (see Wormhole.js: Muffin unmaximizes a closing window after the
    // animation has started).
    const readWindow = () => {
      const f = actor.get_meta_window().get_frame_rect();
      return {frame: {x: f.x, y: f.y, width: f.width, height: f.height},
              actor: {x: actor.x, y: actor.y, width: actor.width, height: actor.height}};
    };
    const frozen = ctx.forOpening ? null : readWindow();

    const geometry = () => {
      const w     = frozen || readWindow();
      const frame = w.frame;
      const act   = w.actor;
      const SW = global.stage.width, SH = global.stage.height;

      const x1 = Math.max(0,  Math.floor(Math.min(act.x - SHADOW_MARGIN, frame.x - MORPH_MARGIN)));
      const y1 = Math.max(0,  Math.floor(Math.min(act.y - SHADOW_MARGIN, frame.y - MORPH_MARGIN)));
      const x2 = Math.min(SW, Math.ceil(Math.max(act.x + act.width  + SHADOW_MARGIN,
                                                 frame.x + frame.width  + MORPH_MARGIN)));
      const y2 = Math.min(SH, Math.ceil(Math.max(act.y + act.height + SHADOW_MARGIN,
                                                 frame.y + frame.height + MORPH_MARGIN)));

      const g = {ox: x1, oy: y1, OW: Math.max(1, x2 - x1), OH: Math.max(1, y2 - y1),
                 fx: frame.x - x1, fy: frame.y - y1, fw: frame.width, fh: frame.height,
                 actorX: act.x, actorY: act.y};
      g.key = JSON.stringify(g);
      return g;
    };

    const populate = (g) => {
      group.set_position(g.ox, g.oy);
      group.set_size(g.OW, g.OH);
      // Only the leaf layers are emptied (wall and behind are children of surface).
      for (const layer of [wall, behind, win, above]) {
        layer.destroy_all_children();
      }
      for (const layer of [surface, wall, behind, win, above]) {
        layer.set_size(g.OW, g.OH);
      }

      const addClone = (parent, source) => {
        const [sx, sy] = source.get_transformed_position();
        parent.add_child(new Clutter.Clone({source: source, reactive: false,
                                            x: Math.round(sx - g.ox), y: Math.round(sy - g.oy)}));
      };
      const addWindow = (parent, wa) => ctx.cloneWindow(parent, wa, g.ox, g.oy);

      if (global.background_actor) addClone(wall, global.background_actor);

      const area = {x: g.ox, y: g.oy, width: g.OW, height: g.OH};
      for (const wa of ctx.stack.windowsNear(area, false)) {
        const desktop = wa.get_meta_window().get_window_type() === Meta.WindowType.DESKTOP;
        addWindow(desktop ? wall : behind, wa);
      }

      const desklets = (Main.deskletContainer && Main.deskletContainer.actor) || null;
      if (desklets) addClone(wall, desklets);

      win.add_child(new Clutter.Clone({source: actor, reactive: false,
                                       x: Math.round(g.actorX - g.ox), y: Math.round(g.actorY - g.oy)}));

      for (const wa of ctx.stack.windowsNear(area, true)) {
        addWindow(above, wa);
      }

      for (const s of [surfaceShader, windowShader]) {
        s.set_uniform_float(s._uFrameRect, 4, [g.fx, g.fy, g.fw, g.fh]);
        s.set_uniform_float(s._uTexRect,   4, [0, 0, g.OW, g.OH]);  // corrected once painted
      }
    };

    let geo = geometry();
    populate(geo);

    ctx.insertAboveWindows([group]);

    // Same random flow field, dissolve pattern and style on both layers.
    const seed  = [Math.random(), Math.random()];
    const style    = ctx.settings.getValue('morph-style');
    const strength = ctx.settings.getValue('morph-strength');
    surfaceShader.set_uniform_float(surfaceShader._uLayer, 1, [0]);
    windowShader.set_uniform_float(windowShader._uLayer,   1, [1]);
    for (const s of [surfaceShader, windowShader]) {
      s.set_uniform_float(s._uSeed,  2, seed);
      s.set_uniform_float(s._uStyle, 1, [style]);
      s.set_uniform_float(s._uStrength, 1, [strength]);
    }

    surface.add_effect_with_name('burn-my-windows-follower', surfaceShader);
    surfaceShader.beginFollowing(windowShader, ctx.settings, ctx.forOpening, ctx.testMode, ctx.duration, actor);

    // Real position / size of each offscreen texture (3px padding), as in AperturePanels.js.
    const updateTexRect = (s) => {
      // Layer coordinates; the unpadded layer until the texture exists.
      const t = s.getTextureRect(geo.OW, geo.OH, ctx.texPadding === 'centred' ? 'centred' : 'enlarged');
      s.set_uniform_float(s._uTexRect, 4, t || [0, 0, geo.OW, geo.OH]);
    };
    const texRectIds = [surfaceShader, windowShader].map(
      s => [s, s.connect('update-animation', () => updateTexRect(s))]);

    actor._bmwEffectContainer = win;
    actor.opacity = 0;

    let actorGone = false;
    const destroyId = actor.connect('destroy', () => { actorGone = true; });

    return {
      paintTarget: win,

      update: () => {
        const g = geometry();
        let dirty = false;
        if (g.key !== geo.key) {
          geo   = g;
          dirty = true;
        }
        const restacked = ctx.stack.takeDirty();
        if (dirty || restacked) {
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
        surfaceShader.stopFollowing();
        surface.remove_effect(surfaceShader);
        surfaceShader.returnToFactory();
        group.destroy();
      }
    };
  }

  // ---------------------------------------------------------------------------- metadata

  static getMinShellVersion() {
    return [3, 36];
  }

  static getNick() {
    return 'morph';
  }

  static getLabel() {
    return _('Morph');
  }

  // -------------------------------------------------------------------- API for prefs.js

  static bindPreferences(dialog) {
    dialog.bindAdjustment('morph-strength');
    dialog.bindAdjustment('morph-animation-time');
  }

  // ---------------------------------------------------------------- API for extension.js

  static getActorScale(settings, forOpening, actor) {
    return {x: 1.0, y: 1.0};
  }

  static getSFX(settings, forOpening) {
     if (forOpening) {
        return settings.getValue("morph-open-sound");
     } else {
        return settings.getValue("morph-close-sound");
     }
  }
}
