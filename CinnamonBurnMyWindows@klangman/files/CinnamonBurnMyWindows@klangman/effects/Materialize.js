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

// SPDX-FileCopyrightText: eboye <eboyee@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later

'use strict';

//import * as utils from '../utils.js';

// We import the ShaderFactory only in the Shell process as it is not required in the
// preferences process. The preferences process does not create any shader instances, it
// only uses the static metadata of the effect.
//const ShaderFactory = await utils.importInShellOnly('./ShaderFactory.js');

//const _ = await utils.importGettext();
// The modules this file needs are handed in by extension.js through setModules(): the
// file is shared by the Cinnamon 6.2 code (old module loader) and the 6.7.6+ code
// (native importer), so it doesn't import them itself.
let ShaderFactory = null;
function setModules(modules) {
  ({ShaderFactory} = modules);
}

const Gettext = imports.gettext;
const GLib = imports.gi.GLib;
const Clutter = imports.gi.Clutter;
const UUID = "CinnamonBurnMyWindows@klangman";

Gettext.bindtextdomain(UUID, GLib.get_user_data_dir() + "/locale");

function _(text) {
  let locText = Gettext.dgettext(UUID, text);
  if (locText == text) {
    locText = window._(text);
  }
  return locText;
}

//////////////////////////////////////////////////////////////////////////////////////////
// This effect is inspired by the computer interfaces seen in The Matrix Resurrections. //
// Windows pop up as a flat, tinted panel which grows to full size in a few stuttering  //
// steps before the actual window content materializes.                                 //
//////////////////////////////////////////////////////////////////////////////////////////

// Note: The GNOME version can optionally use the libadwaita system accent color. Cinnamon
// has no equivalent setting, so only the custom color is supported here.

// The effect class can be used to get some metadata (like the effect's name or supported
// GNOME Shell versions), to initialize the respective page of the settings dialog, as
// well as to create the actual shader for the effect.
var Effect = class Effect {

  // The constructor creates a ShaderFactory which will be used by extension.js to create
  // shader instances for this effect. The shaders will be automagically created using the
  // GLSL file in resources/shaders/<nick>.glsl. The callback will be called for each
  // newly created shader instance.
  constructor() {
    this.shaderFactory = new ShaderFactory(Effect.getNick(), (shader) => {
      // Store uniform locations of newly created shaders.
      shader._uColor      = shader.get_uniform_location('uColor');
      shader._uStartScale = shader.get_uniform_location('uStartScale');
      shader._uSteps      = shader.get_uniform_location('uSteps');

      // Write all uniform values at the start of each animation.
      shader.connect('begin-animation', (shader, settings) => {
        const c = Clutter.Color.from_string(settings.getValue('materialize-color'))[1];

        // clang-format off
        shader.set_uniform_float(shader._uColor,      4, [c.red / 255, c.green / 255, c.blue / 255, c.alpha / 255]);
        shader.set_uniform_float(shader._uStartScale, 1, [settings.getValue('materialize-start-scale')]);
        shader.set_uniform_float(shader._uSteps,      1, [settings.getValue('materialize-steps')]);
        // clang-format on
      });
    });
  }

  // ---------------------------------------------------------------------------- metadata

  // The effect is available on all GNOME Shell versions supported by this extension.
  static getMinShellVersion() {
    return [3, 36];
  }

  // This will be called in various places where a unique identifier for this effect is
  // required. It should match the prefix of the settings keys which store whether the
  // effect is enabled currently (e.g. '*-enable-effect'), and its animation time
  // (e.g. '*-animation-time').
  static getNick() {
    return 'materialize';
  }

  // This will be shown in the sidebar of the preferences dialog as well as in the
  // drop-down menus where the user can choose the effect.
  static getLabel() {
    return _('Materialize');
  }

  // -------------------------------------------------------------------- API for prefs.js

  // This is called by the preferences dialog whenever a new effect profile is loaded. It
  // binds all user interface elements to the respective settings keys of the profile.
  static bindPreferences(dialog) {
    dialog.bindAdjustment('materialize-animation-time');
    dialog.bindAdjustment('materialize-start-scale');
    dialog.bindAdjustment('materialize-steps');
    dialog.bindColorButton('materialize-color');
  }

  // ---------------------------------------------------------------- API for extension.js

  // The getActorScale() is called from extension.js to adjust the actor's size during the
  // animation. This is useful if the effect requires drawing something beyond the usual
  // bounds of the actor.
  static getActorScale(settings, forOpening, actor) {
    return {x: 1.0, y: 1.0};
  }

  // The getSFX() is called from extension.js to get the sound effect file for this effect
  static getSFX(settings, forOpening) {
     if (forOpening) {
        return settings.getValue("materialize-open-sound");
     } else {
        return settings.getValue("materialize-close-sound");
     }
  }
}
