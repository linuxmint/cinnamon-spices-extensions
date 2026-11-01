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
// Wormhole: the desktop is sucked into the screen around the window's centre, down     //
// a tube into a dark void. Then the tube's floor rises, flattening the desktop again   //
// and pushing the window (painted on the same warped surface) out of the void to its   //
// real size. Closing plays it backwards. Shader: resources/shaders/wormhole.frag.      //
// Uses the createLayers() hook (see effects/AperturePanels.js), with three layers:     //
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

// Tunables. More (depth, timeline, shading) live at the top of
// resources/shaders/wormhole.frag. The user settings are wormhole-void-size,
// wormhole-tunnel-depth, wormhole-bounce (passed to the shader) and wormhole-funnel-size
// (below).
const SHADOW_MARGIN = 64;    // px around the window covered by the layers, for its shadow
const FUNNEL_EXTRA  = 80;    // funnel semi-axes: half the visible window x funnel size, plus this many px

var Effect = class Effect {

  constructor() {
    this.shaderFactory = new ShaderFactory(Effect.getNick(), (shader) => {
      shader._uLayer     = shader.get_uniform_location('uLayer');
      shader._uTexRect   = shader.get_uniform_location('uTexRect');
      shader._uLayerSize = shader.get_uniform_location('uLayerSize');
      shader._uCenter    = shader.get_uniform_location('uCenter');
      shader._uAxes      = shader.get_uniform_location('uAxes');
      shader._uFrameHalf = shader.get_uniform_location('uFrameHalf');
      shader._uVoidSize    = shader.get_uniform_location('uVoidSize');
      shader._uTunnelDepth = shader.get_uniform_location('uTunnelDepth');
      shader._uBounce      = shader.get_uniform_location('uBounce');
    });
  }

  // -------------------------------------------------------------- API for extension.js

  // See effects/AperturePanels.js for the contract of this hook.
  createLayers(actor, shader, ctx) {
    const windowShader  = shader;
    const surfaceShader = this.shaderFactory.getShader();

    // The user's settings, read once so both layers get the same values.
    const funnelSize  = ctx.settings.getValue('wormhole-funnel-size');
    const voidSize    = ctx.settings.getValue('wormhole-void-size');
    const tunnelDepth = ctx.settings.getValue('wormhole-tunnel-depth');
    const bounce      = ctx.settings.getValue('wormhole-bounce');

    const group = new Clutter.Actor({reactive: false});
    const newLayer = (parent, props = {}) => {
      const layer = new Clutter.Actor(Object.assign({clip_to_allocation: true, reactive: false}, props));
      parent.add_child(layer);
      return layer;
    };
    // The surface is opaque (black under the wallpaper) so the hole and anything the warp
    // reveals never show the real screen through it.
    const surface  = newLayer(group, {background_color: Clutter.Color.from_string('black')[1]});
    const wall     = newLayer(surface);  // wallpaper, desktop icons, desklets
    const behind   = newLayer(surface);  // windows behind
    const win      = newLayer(group);
    const above    = newLayer(group);

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

    const geometry = () => {
      const w     = frozen || readWindow();
      const frame = w.frame;
      const act   = w.actor;
      const SW = global.stage.width, SH = global.stage.height;

      // Funnel: centred on the visible window, bigger than it, but symmetric around the
      // centre and never beyond the screen (so the sheet is flat where the layer ends).
      const cx = frame.x + frame.width / 2;
      const cy = frame.y + frame.height / 2;
      const ax = Math.max(8, Math.min(frame.width  / 2 * funnelSize + FUNNEL_EXTRA, cx, SW - cx));
      const ay = Math.max(8, Math.min(frame.height / 2 * funnelSize + FUNNEL_EXTRA, cy, SH - cy));

      // Layers: the funnel plus the window actor (shadow included) plus a margin.
      const x1 = Math.max(0,  Math.floor(Math.min(cx - ax, act.x - SHADOW_MARGIN, frame.x - SHADOW_MARGIN)));
      const y1 = Math.max(0,  Math.floor(Math.min(cy - ay, act.y - SHADOW_MARGIN, frame.y - SHADOW_MARGIN)));
      const x2 = Math.min(SW, Math.ceil(Math.max(cx + ax, act.x + act.width  + SHADOW_MARGIN,
                                                 frame.x + frame.width  + SHADOW_MARGIN)));
      const y2 = Math.min(SH, Math.ceil(Math.max(cy + ay, act.y + act.height + SHADOW_MARGIN,
                                                 frame.y + frame.height + SHADOW_MARGIN)));

      const g = {ox: x1, oy: y1, OW: Math.max(1, x2 - x1), OH: Math.max(1, y2 - y1),
                 cx: cx - x1, cy: cy - y1, ax: ax, ay: ay,
                 hw: frame.width / 2, hh: frame.height / 2,
                 actorX: act.x, actorY: act.y};
      g.key = JSON.stringify(g);
      return g;
    };

    const populate = (g) => {
      group.set_position(g.ox, g.oy);
      group.set_size(g.OW, g.OH);
      // Only the leaf layers are emptied: wall and behind are themselves children of
      // surface, so emptying surface would destroy them.
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

      // The window itself, placed by x / y (see AperturePanels.js for why).
      win.add_child(new Clutter.Clone({source: actor, reactive: false,
                                       x: Math.round(g.actorX - g.ox), y: Math.round(g.actorY - g.oy)}));

      for (const wa of ctx.stack.windowsNear(area, true)) {
        addWindow(above, wa);
      }

      for (const s of [surfaceShader, windowShader]) {
        s.set_uniform_float(s._uLayerSize, 2, [g.OW, g.OH]);
        s.set_uniform_float(s._uCenter,    2, [g.cx, g.cy]);
        s.set_uniform_float(s._uAxes,      2, [g.ax, g.ay]);
        s.set_uniform_float(s._uFrameHalf, 2, [g.hw, g.hh]);
        s.set_uniform_float(s._uTexRect,   4, [0, 0, g.OW, g.OH]);  // corrected once painted
      }
    };

    let geo = geometry();
    populate(geo);

    ctx.insertAboveWindows([group]);

    surfaceShader.set_uniform_float(surfaceShader._uLayer, 1, [0]);
    windowShader.set_uniform_float(windowShader._uLayer,   1, [1]);
    for (const s of [surfaceShader, windowShader]) {
      s.set_uniform_float(s._uVoidSize,    1, [voidSize]);
      s.set_uniform_float(s._uTunnelDepth, 1, [tunnelDepth]);
      s.set_uniform_float(s._uBounce,      1, [bounce]);
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
    return 'wormhole';
  }

  static getLabel() {
    return _('Wormhole');
  }

  // -------------------------------------------------------------------- API for prefs.js

  static bindPreferences(dialog) {
    dialog.bindAdjustment('wormhole-void-size');
    dialog.bindAdjustment('wormhole-tunnel-depth');
    dialog.bindAdjustment('wormhole-funnel-size');
    dialog.bindAdjustment('wormhole-bounce');
    dialog.bindAdjustment('wormhole-animation-time');
  }

  // ---------------------------------------------------------------- API for extension.js

  static getActorScale(settings, forOpening, actor) {
    return {x: 1.0, y: 1.0};
  }

  static getSFX(settings, forOpening) {
     if (forOpening) {
        return settings.getValue("wormhole-open-sound");
     } else {
        return settings.getValue("wormhole-close-sound");
     }
  }
}
