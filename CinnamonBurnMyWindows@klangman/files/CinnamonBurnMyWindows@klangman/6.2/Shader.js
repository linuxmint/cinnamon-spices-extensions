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

const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Clutter = imports.gi.Clutter;
const Meta = imports.gi.Meta;
const Cogl = imports.gi.Cogl;
const Cinnamon = imports.gi.Cinnamon;
const Settings = imports.ui.settings;
const GLib = imports.gi.GLib;

const UUID = "CinnamonBurnMyWindows@klangman";

//////////////////////////////////////////////////////////////////////////////////////////
// This is the base class for all shaders of Burn-My-Windows. It automagically loads    //
// the shader's source code from the resource file resources/shaders/<nick>.glsl and    //
// ensures that some standard uniforms are always updated.                              //
// Using Shell.GLSLEffect as a base class has some benefits and some drawbacks. The     //
// main benefit when compared to Clutter.ShaderEffect is that setting uniforms of types //
// vec2, vec3 or vec4 is supported via the API (with Clutter.ShaderEffect the GJS       //
// binding does not work properly). However, there are two drawbacks: On the one hand,  //
// the shader source code is cached statically - this means if we want to have a        //
// different shader, we have to derive a new class. Therefore, each effect has to       //
// derive its own class from the class below. This is encapsulated in the               //
// ShaderFactory, however it is some really awkward code. The other drawback is the     //
// hard-coded use of straight alpha (as opposed to premultiplied). This makes the       //
// shaders a bit more complicated than required.                                        //
//                                                                                      //
// The Shader fires three signals:                                                      //
//   * begin-animation:    This is called each time a new animation is started. It can  //
//                         be used to set uniform values which do not change during the //
//                         animation.                                                   //
//   * update-animation:   This is called at each frame during the animation. It can be //
//                         used to set uniforms which change during the animation.      //
//   * end-animation:      This is called when the animation is stopped. This can be    //
//                         used to clean up any resources.
//////////////////////////////////////////////////////////////////////////////////////////
var Shader = GObject.registerClass(
  {
    // Use a random name so that the extension can be removed then added again during the same Cinnamon session
    GTypeName: `Cjs_BMW_Shader_${Math.floor(Math.random() * 100000) + 1}`,
    Signals: {
      'begin-animation': {
        param_types: [
          Settings, GObject.TYPE_BOOLEAN, GObject.TYPE_BOOLEAN,
          Clutter.Actor.$gtype
        ]
      },
      'update-animation': {param_types: [GObject.TYPE_DOUBLE]},
      'end-animation': {}
    }
  },
class Shader extends Cinnamon.GLSLEffect {  // --------------------------------------------
    // The constructor automagically loads the shader's source code (in
    // vfunc_build_pipeline()) from the resource file resources/shaders/<nick>.glsl
    // resolving any #includes in this file.
    _init(nick) {
      this._nick = nick;

      // This will call vfunc_build_pipeline().
      super._init();

      // These will be updated during the animation.
      this._progress = 0;
      this._time     = 0;

      // Shaders animating in lock-step with this one (see beginFollowing()).
      this._followers = [];
      this._leader    = null;

      // Store standard uniform locations.
      this._uForOpening   = this.get_uniform_location('uForOpening');
      this._uIsFullscreen = this.get_uniform_location('uIsFullscreen');
      this._uProgress     = this.get_uniform_location('uProgress');
      this._uDuration     = this.get_uniform_location('uDuration');
      this._uSize         = this.get_uniform_location('uSize');
      this._uPadding      = this.get_uniform_location('uPadding');
      this._uInputRect    = this.get_uniform_location('uInputRect');
      this._uCanvasRect   = this.get_uniform_location('uCanvasRect');

      // Create a timeline to drive the animation.
      this._timeline = new Clutter.Timeline();

      // Call updateAnimation() once a frame.
      this._timeline.connect('new-frame', (t) => {
        if (this._testMode) {
          this.updateAnimation(0.5);
        } else {
          this.updateAnimation(t.get_progress());
        }
      });

      // Clean up if the animation finished or was interrupted.
      this._timeline.connect('stopped', (t, finished) => {
        this.endAnimation();
      });
    }

    // This is called once each time the shader is used.
    beginAnimation(settings, forOpening, testMode, duration, actor) {
      if (this._timeline.is_playing()) {
        this._timeline.stop();
      }

      // On GNOME 3.36 this method was not yet available.
      if (this._timeline.set_actor) {
        this._timeline.set_actor(actor);
      }

      this._timeline.set_duration(duration);
      this._timeline.start();

      // Make sure that no fullscreen window is drawn over our animations.
      Meta.disable_unredirect_for_display(global.display);
      global.begin_work();

      // Reset progress value.
      this._progress = 0;
      this._testMode = testMode;

      this._setStandardUniforms(forOpening, duration, actor);

      this.emit('begin-animation', settings, forOpening, testMode, actor);
    }

    // For effects that draw on more than one actor (e.g. Aperture Panels): makes this shader
    // animate in lock-step with `leader`, whose animation is started as usual with
    // beginAnimation(). This shader gets the same standard uniforms and its own
    // 'begin-animation' signal, but no timeline of its own: every progress update of the
    // leader is passed on to it. Call stopFollowing() when the leader's animation ends.
    beginFollowing(leader, settings, forOpening, testMode, duration, actor) {
      this.stopFollowing();
      this._leader   = leader;
      leader._followers.push(this);

      this._progress = testMode ? 0.5 : 0;
      this._testMode = testMode;

      this._setStandardUniforms(forOpening, duration, actor);

      this.emit('begin-animation', settings, forOpening, testMode, actor);
    }

    stopFollowing() {
      if (this._leader) {
        const i = this._leader._followers.indexOf(this);
        if (i >= 0) this._leader._followers.splice(i, 1);
        this._leader = null;
      }
    }

    // The uniforms every shader gets at the start of an animation.
    _setStandardUniforms(forOpening, duration, actor) {
      // This is not necessarily symmetric, but I haven't figured out a way to
      // get the actual values...
      const padding = (actor.width - actor.meta_window.get_frame_rect().width) / 2;
      const isFullscreen =
        actor.meta_window.get_maximized() === Meta.MaximizeFlags.BOTH ||
        actor.meta_window.fullscreen;

      this.set_uniform_float(this._uPadding, 1, [padding]);
      this.set_uniform_float(this._uForOpening, 1, [forOpening]);
      this.set_uniform_float(this._uIsFullscreen, 1, [isFullscreen]);
      this.set_uniform_float(this._uDuration, 1, [duration * 0.001]);
      this.set_uniform_float(this._uSize, 2, [actor.width, actor.height]);

      // The window fills the whole texture unless extension.js puts the effect on an
      // unscaled canvas; then it updates this every frame (see _setupEffect).
      this.set_uniform_float(this._uInputRect, 4, [0, 0, 1, 1]);
      this.set_uniform_float(this._uCanvasRect, 4, [0, 0, 1, 1]);
    }

    // This is called at each frame during the animation.
    updateAnimation(progress) {
      // Store the current progress value. The corresponding signal is emitted each frame
      // in vfunc_paint_target. We do not emit it here, as the pipeline which may be used
      // by handlers must not have been created yet.
      this._progress = progress;

      this.queue_repaint();

      for (const follower of this._followers) {
        follower.updateAnimation(progress);
      }
    }

    // This will stop any running animation and emit the end-animation signal.
    endAnimation() {
      // This will call endAnimation() again, so we can return for now.
      if (this._timeline.is_playing()) {
        this._timeline.stop();
        return;
      }

      // Restore unredirecting behavior for fullscreen windows.
      Meta.enable_unredirect_for_display(global.display);
      global.end_work();

      this.emit('end-animation');
    }

    // This is called by the constructor. This means, it's only called when the
    // effect is used for the first time.
    vfunc_build_pipeline() {

      // Shell.GLSLEffect requires the declarations and the main source code as separate
      // strings. As it's more convenient to store the in one GLSL file, we use a regex
      // here to split the source code in two parts.
      const code = this._loadShaderResource(`/shaders/${this._nick}.frag`);

      // Match anything between the curly brackets of "void main() {...}".
      const regex = RegExp('void main *\\(\\) *\\{([\\S\\s]+)\\}');
      const match = regex.exec(code);

      const declarations = code.substr(0, match.index);
      const main         = match[1];

      this.add_glsl_snippet(Cinnamon.SnippetHook.FRAGMENT, declarations, main, true);
    }

    // We use this vfunc to trigger the update as it allows calling this.get_pipeline() in
    // the handler. This could still be null if called from the updateAnimation() above.
    vfunc_paint_target(...params) {
      this.emit('update-animation', this._progress);

      // Starting with GNOME 44.2, the alpha channel is not written to by default. We need
      // to undo this. It is a pity that we have to do this here, as it is not really
      // required to be done each frame. But it's the only place where we can do it.
      // https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/2650
      //this.get_pipeline().set_blend(
      //  'RGBA = ADD (SRC_COLOR * (SRC_COLOR[A]), DST_COLOR * (1-SRC_COLOR[A]))');

      this.set_uniform_float(this._uProgress, 1, [this._progress]);
      super.vfunc_paint_target(...params);
    }

    // Where this effect's offscreen texture lies relative to the top-left corner of the
    // actor it is attached to, as [x, y, width, height] in that actor's coordinates, or null
    // before the first paint. `width` and `height` are the actor's size; its paint volume
    // must be its allocation (clip_to_allocation, as for extension.js's unscaled canvas and
    // the layered effects' layers).
    //
    // Only the size of get_target_rect() is used. Its position is wherever the actor was
    // painted first this frame, which can be a clone of it inside another offscreen effect
    // (e.g. a BlurCinnamon blurred window background, painted before our actors as it lives
    // in global.window_group); it is then relative to that effect's framebuffer, not the
    // stage. The origin follows from the actor's own size instead, the way Clutter pads the
    // box (_clutter_actor_box_enlarge_for_effects).
    //
    // texPadding: 'enlarged' (stock Muffin: x2' = ceil(x2 + 0.75), x1' = x2' - width, so
    // most of the 3px is on the left / top), 'centred' (Muffin patched to pad evenly), or
    // anything else for no padding offset.
    getTextureRect(width, height, texPadding) {
      let w, h;
      try {
        const [ok, r] = this.get_target_rect();
        if (!ok) return null;
        w = r.get_width();
        h = r.get_height();
      } catch (e) {
        return null;
      }
      if (texPadding === 'centred') {
        return [-(w - width) / 2, -(h - height) / 2, w, h];
      }
      if (texPadding === 'enlarged') {
        return [Math.ceil(width + 0.75) - w, Math.ceil(height + 0.75) - h, w, h];
      }
      return [0, 0, w, h];
    }

    // --------------------------------------------------------------------- private stuff

    // This loads a GLSL file from the extension's resources to a JavaScript string. The
    // code from "common.glsl" is prepended automatically.
    _loadShaderResource(path) {
      let file;
      file = Gio.File.new_for_path( GLib.get_home_dir() + '/.local/share/cinnamon/extensions/'
                                                  + UUID + '/resources/shaders/common.glsl' );
      let [data, etag] =  file.load_bytes(null);
      let common = new TextDecoder().decode(data.get_data());
      file = Gio.File.new_for_path( GLib.get_home_dir() + '/.local/share/cinnamon/extensions/'
                                                               + UUID + '/resources' + path );
      [data, etag] = file.load_bytes(null);
      let code = new TextDecoder().decode(data.get_data());

      // Add a trailing newline. Else the GLSL compiler complains...
      return common + '\n' + code + '\n';
    }
});
