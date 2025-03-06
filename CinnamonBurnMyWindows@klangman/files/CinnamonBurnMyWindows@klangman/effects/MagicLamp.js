/*
 * extension.js
 * Copyright (C) 2025 Kevin Langman <klangman@gmail.com>
 *
 * This is a Cinnamon port of the Gnome Compiz-alike-magic-lamp-effect code
 * modified to work as a Burn-My-Windows effect in CinnamonBurnMyWindows:
 * Copyright (C) 2020 Mauro Pepe <https://github.com/hermes83/compiz-alike-magic-lamp-effect>
 *
 * The MagicLamp Effect is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * THe MagicLamp Effect is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Meta = imports.gi.Meta;
const GObject = imports.gi.GObject;
const Main = imports.ui.main;
const GLib = imports.gi.GLib;
const Gettext = imports.gettext;
const Panel = imports.ui.panel;
//const Mainloop = imports.mainloop;

const ShouldAnimateManager = require("ShouldAnimateManager.js");

const MINIMIZE_EFFECT_NAME = "minimize-magic-lamp-effect";
const UNMINIMIZE_EFFECT_NAME = "unminimize-magic-lamp-effect";

const UUID = "CinnamonBurnMyWindows@klangman";

const EffectType = {
   Default: 0,
   Sine: 1,
   Random: 2,
   DefaultSine: 3,
   SineDefault: 4
}

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale");

function _(text) {
  let locText = Gettext.dgettext(UUID, text);
  if (locText == text) {
    locText = window._(text);
  }
  return locText;
}

function getIcon(actor) {
   let [success, icon] = actor.meta_window.get_icon_geometry();
   if (success) {
      return icon;
   }

   let monitor = actor.meta_window.get_monitor();
   let panels = Main.panelManager.getPanelsInMonitor(monitor);
   let loc = -1;
   icon = {x: monitor.x + monitor.width / 2, y: monitor.y + monitor.height, width: 0, height: 0};
   // Find a panel and set the icon location to be the middle of the panel.
   // If more than one panel exists, use the below probability order to select
   // the most likely window-list location based on typical usage.
   // Window list location probability order: Bottom, Top, Left, Right
   for (let i = 0; i < panels.length; i++) {
      if (panels[i].panelPosition == Panel.PanelLoc.top) {
         loc = Panel.PanelLoc.top;
         icon.x = panels[i].monitor.x + panels[i].monitor.width / 2;
         icon.y = panels[i].monitor.y;
      } else if (loc != Panel.PanelLoc.top && loc != Panel.PanelLoc.left && panels[i].panelPosition == Panel.PanelLoc.right) {
         loc = Panel.PanelLoc.right;
         icon.x = panels[i].monitor.x + panels[i].monitor.width;
         icon.y = panels[i].monitor.y + panels[i].monitor.height / 2;
      } else if (loc != Panel.PanelLoc.top && panels[i].panelPosition == Panel.PanelLoc.left) {
         loc = Panel.PanelLoc.left;
         icon.x = panels[i].monitor.x;
         icon.y = panels[i].monitor.y + panels[i].monitor.height / 2;
      } else if (panels[i].panelPosition == Panel.PanelLoc.bottom) {
         loc = Panel.PanelLoc.bottom;
         icon.x = panels[i].monitor.x + panels[i].monitor.width / 2;
         icon.y = panels[i].monitor.y + panels[i].monitor.height;
         break;
      }
   }
   return icon;
}

var Effect = class Effect {

   constructor(){
      this.shaderFactory = new MagicLampFactory();
   }

   static getNick() {
      return 'magiclamp';
   }

   // We don't see any scaling for this effect
   static getActorScale(settings, forOpening, actor) {
      return {x: 1.0, y: 1.0};
   }
}

// Since the MagicLamp is not a GLSLEffect, we have to implement our own Factory.
var MagicLampFactory = class MagicLampFactory {
   constructor() {
      // These arrays contains previously created effects which are not currently in use.
      this._freeMinimizeEffects = [];
      this._freeUnminimizeEffects = [];
   }

   // Returns the appropriate MagicLamp effect object by creating a new instance or by
   // using a cached instance that has been used previously
   getShader(event) {
      let effect;

      if (event === ShouldAnimateManager.Events.MapWindow || event === ShouldAnimateManager.Events.Unminimize) {
         if (this._freeUnminimizeEffects.length == 0) {
            effect = new MagicLampUnminimizeEffect(this);
         } else {
            effect = this._freeUnminimizeEffects.pop();
         }
      } else {
         if (this._freeMinimizeEffects.length == 0) {
            effect = new MagicLampMinimizeEffect(this);
         } else {
            effect = this._freeMinimizeEffects.pop();
         }
      }
      // Allow the effect to decide how to animate based on the event type (currently not used)
      effect.setEvent(event);
      return effect;
   }
}

var AbstractCommonMagicLampEffect = GObject.registerClass( {GTypeName : `Cjs_AbstractCommonMagicLampEffect_${Math.floor(Math.random() * 100000) + 1}`},

class AbstractCommonMagicLampEffect extends Clutter.DeformEffect {

   _init() {
      super._init();

      this.EPSILON = 40;

      this.isMinimizeEffect = false;
      this.newFrameEvent = null;
      this.completedEvent = null;

      this.timerId = null;
      this.msecs = 0;

      this.monitor = {x: 0, y: 0, width: 0, height: 0};
      this.iconMonitor = {x: 0, y: 0, width: 0, height: 0};
      this.window = {x: 0, y: 0, width: 0, height: 0, scale: 1};

      this.progress = 0;
      this.split = 0.3;
      this.k = 0;
      this.j = 0;
      this.expandWidth = 0;
      this.fullWidth = 0;
      this.expandHeight = 0;
      this.fullHeight = 0;
      this.width = 0;
      this.height = 0;
      this.x = 0;
      this.y = 0;
      this.offsetX = 0;
      this.offsetY = 0;
      this.effectX = 0;
      this.effectY = 0;
      this.iconPosition = null;

      this.toTheBorder = true;   // true
      this.maxIconSize = null;    // 48
      this.alignIcon = 'center';  // 'left-top'

      this.initialized = false;
   }

   destroy_actor(actor) {}

   on_tick_elapsed(timer, msecs) {}

   vfunc_set_actor(actor) {
      super.vfunc_set_actor(actor);

      if (!this.actor || this.initialized) {
         return;
      }

      this.initialized = true;
      //if (this.event === ShouldAnimateManager.Events.MapWindow || this.event === ShouldAnimateManager.Events.DestroyWindow) {
      //   let [px,py,mods] = global.get_pointer();
      //   this.icon = {x: px, y: py, width: 1, height: 1};
      //   this.toTheBorder = false;
      //} else {
         this.icon = getIcon(actor);
         //this.toTheBorder = true;
      //}

      this.monitor = Main.layoutManager.monitors[actor.meta_window.get_monitor()];

      [this.window.x, this.window.y] = [this.actor.get_x() - this.monitor.x, this.actor.get_y() - this.monitor.y];
      [this.window.width, this.window.height] = actor.get_size();

      if (!this.icon || (this.icon.x == 0 && this.icon.y == 0 && this.icon.width == 0 && this.icon.height == 0)) {
         this.icon.x = this.monitor.x + this.monitor.width / 2;
         this.icon.y = this.monitor.height + this.monitor.y;
      }

      Main.layoutManager.monitors.forEach((monitor, monitorIndex)  => {
         let scale = 1;
         if (global.display && global.display.get_monitor_scale) {
            scale = global.display.get_monitor_scale(monitorIndex);
         }

         if (this.icon.x >= monitor.x && this.icon.x <= monitor.x + monitor.width * scale && this.icon.y >= monitor.y && this.icon.y <= monitor.y + monitor.height * scale)  {
             this.iconMonitor = monitor;
         }
      });
      if (this.iconMonitor.x == 0 && this.iconMonitor.y == 0 && this.iconMonitor.width == 0 && this.iconMonitor.height == 0) {
         this.iconMonitor = this.monitor;
         // this.icon.x = this.monitor.x + this.monitor.width / 2;
         // this.icon.y = this.monitor.height + this.monitor.y;
      }

      [this.icon.x, this.icon.y, this.icon.width, this.icon.height] = [this.icon.x - this.monitor.x, this.icon.y - this.monitor.y, this.icon.width, this.icon.height];

      if (this.icon.y + this.icon.height >= this.monitor.height - this.EPSILON) {
         this.iconPosition = St.Side.BOTTOM;
         if (this.toTheBorder) {
            this.icon.y = this.iconMonitor.y + this.iconMonitor.height - this.monitor.y
            this.icon.height = 0;
         }
      } else if (this.icon.x <= this.EPSILON) {
         this.iconPosition = St.Side.LEFT;
         if (this.toTheBorder) {
            this.icon.x = this.iconMonitor.x - this.monitor.x;
            this.icon.width = 0;
         }
      } else if (this.icon.x + this.icon.width >= this.monitor.width - this.EPSILON) {
         this.iconPosition = St.Side.RIGHT;
         if (this.toTheBorder) {
            this.icon.x = this.iconMonitor.x + this.iconMonitor.width - this.monitor.x;
            this.icon.width = 0;
         }
      } else {
         this.iconPosition = St.Side.TOP;
         if (this.toTheBorder) {
            this.icon.y = this.iconMonitor.y - this.monitor.y;
            this.icon.height = 0;
         }
      }
   }

   destroy() {
      if (this.timerId) {
         if (this.newFrameEvent) {
            this.timerId.disconnect(this.newFrameEvent);
            this.newFrameEvent = null;
         }
         if (this.completedEvent) {
            this.timerId.disconnect(this.completedEvent);
            this.completedEvent = null;
         }
         this.timerId = null;
      }

      let actor = this.get_actor();
      if (actor) {
         if (this.paintEvent) {
            actor.disconnect(this.paintEvent);
            this.paintEvent = null;
         }

         this.destroy_actor(actor);
      }
   }

   vfunc_deform_vertex(w, h, v) {
      if (this.initialized) {
         let propX = w / this.window.width;
         let propY = h / this.window.height;

         if (this.iconPosition == St.Side.LEFT) {
            this.width = this.window.width - this.icon.width + this.window.x * this.k;

            this.x = (this.width - this.j * this.width) * v.tx;
            this.y = v.ty * this.window.height * (this.x + (this.width - this.x) * (1 - this.k)) / this.width + 
                     v.ty * this.icon.height * (this.width - this.x) / this.width;

            this.offsetX = this.icon.width - this.window.x * this.k;
            this.offsetY = (this.icon.y - this.window.y) * ((this.width - this.x) / this.width) * this.k;

            if (this.EFFECT === EffectType.Sine) {
               this.effectY = Math.sin(this.x / this.width * Math.PI * 4) * this.window.height / 14 * this.k;
            } else {
               this.effectY = Math.sin((0.5 - (this.width - this.x) / this.width) * 2 * Math.PI) * (this.window.y + this.window.height * v.ty - (this.icon.y + this.icon.height * v.ty)) / 7 * this.k;
            }
         } else if (this.iconPosition == St.Side.TOP) {
            this.height = this.window.height - this.icon.height + this.window.y * this.k;

            this.y = (this.height - this.j * this.height) * v.ty;
            this.x = v.tx * this.window.width * (this.y + (this.height - this.y) * (1 - this.k)) / this.height + 
                     v.tx * this.icon.width * (this.height - this.y) / this.height;

            this.offsetX = (this.icon.x - this.window.x) * ((this.height - this.y) / this.height) * this.k;
            this.offsetY = this.icon.height - this.window.y * this.k;

            if (this.EFFECT === EffectType.Sine) {
                this.effectX = Math.sin(this.y / this.height * Math.PI * 4) * this.window.width / 14 * this.k;
            } else {
                this.effectX = Math.sin((0.5 - (this.height - this.y) / this.height) * 2 * Math.PI) * (this.window.x + this.window.width * v.tx - (this.icon.x + this.icon.width * v.tx)) / 7 * this.k;
            }
         } else if (this.iconPosition == St.Side.RIGHT) {
            this.expandWidth = (this.iconMonitor.width - this.icon.width - this.window.x - this.window.width);
            this.fullWidth = (this.iconMonitor.width - this.icon.width - this.window.x) - this.expandWidth * (1 - this.k);
            this.width = this.fullWidth - this.j * this.fullWidth;

            this.x = v.tx * this.width;
            this.y = v.ty * (this.icon.height) +
                     v.ty * (this.window.height - this.icon.height) * (1 - this.j) * (1 - v.tx) +
                     v.ty * (this.window.height - this.icon.height) * (1 - this.k) * (v.tx);

            this.offsetY = (this.icon.y - this.window.y) * (this.x / this.fullWidth) * this.k + (this.icon.y - this.window.y) * this.j;
            this.offsetX = this.iconMonitor.width - this.icon.width - this.window.x - this.width - this.expandWidth * (1 - this.k);

            if (this.EFFECT === EffectType.Sine) {
                this.effectY = Math.sin((this.width - this.x) / this.fullWidth * Math.PI * 4) * this.window.height / 14 * this.k;
            } else {
                this.effectY = Math.sin(((this.width - this.x) / this.fullWidth) * 2 * Math.PI + Math.PI) * (this.window.y + this.window.height * v.ty - (this.icon.y + this.icon.height * v.ty)) / 7 * this.k;
            }
         } else if (this.iconPosition == St.Side.BOTTOM) {
            this.expandHeight = (this.iconMonitor.height - this.icon.height - this.window.y - this.window.height);
            this.fullHeight = (this.iconMonitor.height - this.icon.height - this.window.y) - this.expandHeight * (1 - this.k);
            this.height = this.fullHeight - this.j * this.fullHeight;

            this.y = v.ty * this.height;
            this.x = v.tx * (this.icon.width) +
                     v.tx * (this.window.width - this.icon.width) * (1 - this.j) * (1 - v.ty) +
                     v.tx * (this.window.width - this.icon.width) * (1 - this.k) * (v.ty);

            this.offsetX = (this.icon.x - this.window.x) * (this.y / this.fullHeight) * this.k + (this.icon.x - this.window.x) * this.j;
            this.offsetY = this.iconMonitor.height - this.icon.height - this.window.y - this.height - this.expandHeight * (1 - this.k);

            if (this.EFFECT === EffectType.Sine) {
               this.effectX = Math.sin((this.height - this.y) / this.fullHeight * Math.PI * 4) * this.window.width / 14 * this.k;
            } else {
               this.effectX = Math.sin(((this.height - this.y) / this.fullHeight) * 2 * Math.PI + Math.PI) * (this.window.x + this.window.width * v.tx - (this.icon.x + this.icon.width * v.tx)) / 7 * this.k;
            }
         }

         v.x = (this.x + this.offsetX + this.effectX) * propX;
         v.y = (this.y + this.offsetY + this.effectY) * propY;
      }
   }
}

);

var MagicLampMinimizeEffect = GObject.registerClass( {
      GTypeName: `Cjs_MagicLampMinimizeEffect_${Math.floor(Math.random() * 100000) + 1}`,
      Signals: { 'end-animation': {} }
      },

class MagicLampMinimizeEffect extends AbstractCommonMagicLampEffect {
   _init(factory) {
      super._init();

      this.k = 0;
      this.j = 0;
      this.isMinimizeEffect = true;
      this.factory = factory;
   }

   setEvent(event) {
      this.event = event;
   }

   // This is called once each time the shader is used.
   beginAnimation(settings, forOpening, testMode, duration, actor) {
      this.DURATION = duration;
      this.X_TILES = settings.getValue("magiclamp-x-tiles");
      this.Y_TILES = settings.getValue("magiclamp-y-tiles");
      this.EFFECT = settings.getValue("magiclamp-effect");
      if (this.EFFECT === EffectType.Random) {
         this.EFFECT = Math.floor(Math.random() * 2);
      } else if (this.EFFECT === EffectType.DefaultSine) {
         this.EFFECT = EffectType.Default;
      } else if (this.EFFECT === EffectType.SineDefault) {
            this.EFFECT = EffectType.Sine;
      }
      this.set_n_tiles(this.X_TILES, this.Y_TILES);
      this.timerId = new Clutter.Timeline({ duration: this.DURATION + (this.monitor.width * this.monitor.height) / (this.window.width * this.window.height) });
      this.newFrameEvent = this.timerId.connect('new-frame', this.on_tick_elapsed.bind(this));
      this.completedEvent = this.timerId.connect('completed', this.destroy.bind(this));
      this.timerId.start();
      // Make sure that no fullscreen window is drawn over our animations.
      Meta.disable_unredirect_for_display(global.display);
      global.begin_work();
   }

   // This will stop any running animation and emit the end-animation signal.
   endAnimation() {
      // This will call endAnimation() again, so we can return for now.
      if (this.timerId.is_playing()) {
        this.timerId.stop();
        return;
      }

      // Restore unredirecting behavior for fullscreen windows.
      Meta.enable_unredirect_for_display(global.display);
      global.end_work();

      this.emit('end-animation');
   }

   // This can be called to mark this instance to be re-usable.
   returnToFactory() {
      this.factory._freeMinimizeEffects.push(this);
   }

   destroy_actor(actor) {
      this.initialized = false;
      this.emit('end-animation');
   }

   on_tick_elapsed(timer, msecs) {
      if (Main.overview.visible) {
          this.destroy();
      }

      this.progress = timer.get_progress();
      this.k = this.progress <= this.split ? this.progress * (1 / 1 / this.split) : 1;
      this.j = this.progress > this.split ? (this.progress - this.split) * (1 / 1 / (1 - this.split)) : 0;

      //this.actor.get_parent().queue_redraw();
      this.invalidate();
   }

   vfunc_modify_paint_volume(pv) {
      return false;
   }
}

);

var MagicLampUnminimizeEffect = GObject.registerClass( {
      GTypeName: `Cjs_MagicLampUnminimizeEffect_${Math.floor(Math.random() * 100000) + 1}`,
      Signals: { 'end-animation': {} }
      },

class MagicLampUnminimizeEffect extends AbstractCommonMagicLampEffect {
   _init(factory) {
      super._init();

      this.k = 1;
      this.j = 1;
      this.isMinimizeEffect = false;
      this.factory = factory;
   }

   setEvent(event) {
      this.event = event;
   }

   // This is called once each time the shader is used.
   beginAnimation(settings, forOpening, testMode, duration, actor) {
      this.DURATION = duration;
      this.X_TILES = settings.getValue("magiclamp-x-tiles");
      this.Y_TILES = settings.getValue("magiclamp-y-tiles");
      this.EFFECT = settings.getValue("magiclamp-effect");
      if (this.EFFECT === EffectType.Random) {
         this.EFFECT = Math.floor(Math.random() * 2);
      } else if (this.EFFECT === EffectType.DefaultSine) {
         this.EFFECT = EffectType.Sine;
      } else if (this.EFFECT === EffectType.SineDefault) {
         this.EFFECT = EffectType.Default;
      }
      this.set_n_tiles(this.X_TILES, this.Y_TILES);
      this.timerId = new Clutter.Timeline({ duration: this.DURATION + (this.monitor.width * this.monitor.height) / (this.window.width * this.window.height) });
      this.newFrameEvent = this.timerId.connect('new-frame', this.on_tick_elapsed.bind(this));
      this.completedEvent = this.timerId.connect('completed', this.destroy.bind(this));
      this.timerId.start();
      // Make sure that no fullscreen window is drawn over our animations.
      Meta.disable_unredirect_for_display(global.display);
      global.begin_work();
   }

   // This will stop any running animation and emit the end-animation signal.
   endAnimation() {
      // This will call endAnimation() again, so we can return for now.
      if (this.timerId.is_playing()) {
        this.timerId.stop();
        return;
      }

      // Restore unredirecting behavior for fullscreen windows.
      Meta.enable_unredirect_for_display(global.display);
      global.end_work();

      this.emit('end-animation');
   }

    // This can be called to mark this instance to be re-usable.
    returnToFactory() {
       this.factory._freeUnminimizeEffects.push(this);
    }

   destroy_actor(actor) {
      this.initialized = false;
      this.emit('end-animation');
   }

   on_tick_elapsed(timer, msecs) {
      if (Main.overview.visible) {
         this.destroy();
      }

      this.progress = timer.get_progress();
      this.k = 1 - (this.progress > (1 - this.split) ? (this.progress - (1 - this.split)) * (1 / 1 / (1 - (1 - this.split))) : 0);
      this.j = 1 - (this.progress <= (1 - this.split) ? this.progress * (1 / 1 / (1 - this.split)) : 1);

      //this.actor.get_parent().queue_redraw();
      this.invalidate();
   }

   vfunc_modify_paint_volume(pv) {
      return false;
   }
}

);
