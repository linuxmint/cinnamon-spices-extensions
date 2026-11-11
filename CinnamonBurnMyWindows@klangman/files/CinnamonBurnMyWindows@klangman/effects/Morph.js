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
// image for "melt") and cross-dissolved, or ("pixelate") both turn into the same grid  //
// of blocks that dissolve one by one. Shader: resources/shaders/morph.frag.            //
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

// Tunables (the look is tuned at the top of morph.frag). User settings: morph-style, morph-strength.
const MORPH_MARGIN  = 160;  // px around the frame covered by the layers: must exceed the shader's
                            // SPILL_PX + FLOW_PX + RADIAL_PX + BLUR_PX so nothing is cut off

var Effect = class Effect {

  constructor() {
    this.shaderFactory = new ShaderFactory(Effect.getNick(), (shader) => {
      shader._uFrameRect = shader.get_uniform_location('uFrameRect');
      shader._uSeed      = shader.get_uniform_location('uSeed');
      shader._uStyle     = shader.get_uniform_location('uStyle');
      shader._uStrength  = shader.get_uniform_location('uStrength');
    });
  }

  // -------------------------------------------------------------- API for extension.js

  // Called by extension.js instead of its usual set-up; see LayeredEffect.js.
  createLayers(actor, shader, ctx) {
    // Same random flow field, dissolve pattern and style on both layers.
    const seed     = [Math.random(), Math.random()];
    const style    = ctx.settings.getValue('morph-style');
    const strength = ctx.settings.getValue('morph-strength');

    return LayeredEffect.create(actor, shader, ctx, {
      factory: this.shaderFactory,

      // The surface is opaque, so the window drawn over it at alpha a is exactly a
      // cross-dissolve, and the warp never shows the real screen through it.
      opaqueSurface: true,

      // The morph spills MORPH_MARGIN px beyond the frame.
      geometry: (frame) => ({cover: [{x: frame.x - MORPH_MARGIN, y: frame.y - MORPH_MARGIN,
                                       width:  frame.width  + 2 * MORPH_MARGIN,
                                       height: frame.height + 2 * MORPH_MARGIN}]}),

      init: (s) => {
        s.set_uniform_float(s._uSeed,     2, seed);
        s.set_uniform_float(s._uStyle,    1, [style]);
        s.set_uniform_float(s._uStrength, 1, [strength]);
      },

      onGeometry: (s, g) => {
        s.set_uniform_float(s._uFrameRect, 4, [g.frame.x, g.frame.y, g.frame.width, g.frame.height]);
      }
    });
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
