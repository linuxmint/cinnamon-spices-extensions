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
// Uses the standard layers of LayeredEffect.js:                                        //
//   surface = wallpaper, desktop, desklets and the windows behind, flattened by the    //
//             offscreen effect and warped as one image (a following shader, uLayer 0)  //
//   window  = a clone of the window itself (extension.js's shader, uLayer 1)           //
//   above   = clones of the windows above the window (no shader)                       //
//////////////////////////////////////////////////////////////////////////////////////////

// The modules this file needs are handed in by extension.js through setModules(): the
// file is shared by the Cinnamon 6.2 code (old module loader) and the 6.7.6+ code
// (native importer), so it doesn't import them itself.
let ShaderFactory = null;
let LayeredEffect = null;
function setModules(modules) {
  ({ShaderFactory, LayeredEffect} = modules);
}

const Gettext = imports.gettext;
const GLib = imports.gi.GLib;
const UUID = "CinnamonBurnMyWindows@klangman";

Gettext.bindtextdomain(UUID, GLib.get_user_data_dir() + "/locale");

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
const FUNNEL_EXTRA  = 80;    // funnel semi-axes: half the visible window x funnel size, plus this many px

var Effect = class Effect {

  constructor() {
    this.shaderFactory = new ShaderFactory(Effect.getNick(), (shader) => {
      shader._uCenter    = shader.get_uniform_location('uCenter');
      shader._uAxes      = shader.get_uniform_location('uAxes');
      shader._uFrameHalf = shader.get_uniform_location('uFrameHalf');
      shader._uVoidSize    = shader.get_uniform_location('uVoidSize');
      shader._uTunnelDepth = shader.get_uniform_location('uTunnelDepth');
      shader._uBounce      = shader.get_uniform_location('uBounce');
    });
  }

  // -------------------------------------------------------------- API for extension.js

  // Called by extension.js instead of its usual set-up; see LayeredEffect.js.
  createLayers(actor, shader, ctx) {
    // The user's settings, read once so both layers get the same values.
    const funnelSize  = ctx.settings.getValue('wormhole-funnel-size');
    const voidSize    = ctx.settings.getValue('wormhole-void-size');
    const tunnelDepth = ctx.settings.getValue('wormhole-tunnel-depth');
    const bounce      = ctx.settings.getValue('wormhole-bounce');

    return LayeredEffect.create(actor, shader, ctx, {
      factory: this.shaderFactory,

      // The surface is opaque (black under the wallpaper) so the hole and anything the warp
      // reveals never show the real screen through it.
      opaqueSurface: true,

      // Funnel: centred on the visible window, bigger than it, but symmetric around the
      // centre and never beyond the screen (so the sheet is flat where the layer ends).
      geometry: (frame, act, SW, SH) => {
        const cx = frame.x + frame.width / 2;
        const cy = frame.y + frame.height / 2;
        const ax = Math.max(8, Math.min(frame.width  / 2 * funnelSize + FUNNEL_EXTRA, cx, SW - cx));
        const ay = Math.max(8, Math.min(frame.height / 2 * funnelSize + FUNNEL_EXTRA, cy, SH - cy));
        return {cover: [{x: cx - ax, y: cy - ay, width: 2 * ax, height: 2 * ay}], cx, cy, ax, ay};
      },

      init: (s) => {
        s.set_uniform_float(s._uVoidSize,    1, [voidSize]);
        s.set_uniform_float(s._uTunnelDepth, 1, [tunnelDepth]);
        s.set_uniform_float(s._uBounce,      1, [bounce]);
      },

      onGeometry: (s, g) => {
        s.set_uniform_float(s._uCenter,    2, [g.cx - g.ox, g.cy - g.oy]);
        s.set_uniform_float(s._uAxes,      2, [g.ax, g.ay]);
        s.set_uniform_float(s._uFrameHalf, 2, [g.frame.width / 2, g.frame.height / 2]);
      }
    });
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
