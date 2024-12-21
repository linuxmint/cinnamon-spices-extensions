/*
 * Flipper is based on the Desktop Cube extension by Entelechy
 * Author: Conner Hansen
 * Last Update: May 24, 2015
 *
 * Updated for Mint21+ by Kevin Langman (Aug 16 2024)
 */

const Lang = imports.lang;
const Mainloop = imports.mainloop;
const St = imports.gi.St;
const Meta = imports.gi.Meta;
const Clutter = imports.gi.Clutter;
const Cinnamon = imports.gi.Cinnamon;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Settings = imports.ui.settings;
const Panel = imports.ui.panel;
const SignalManager = imports.misc.signalManager;

const UUID = "Flipper@connerdev";

const TransitionEffect = {
   Cube:       0,
   Deck:       1,
   Flip:       2,
   Pop:        3,
   Rolodex:    4,
   Slide:      5,
   Stack:      6,
   Randomized: 7
}

let enabled;
let settings;
let signalManager;
let bindings = ['switch-to-workspace-left',
                'switch-to-workspace-right',
                'move-to-workspace-left',
                'move-to-workspace-right'];

let original_mw_moveToWorkspace;
let original_main_activateWindow;

let curFlipper;

function Flipper() {
    this._init.apply(this, arguments);
}

Flipper.prototype = {
    _init: function(new_workspace, direction, modifierMask, window) {
        this.from = null;
        this.to = null;
        this.is_animating = false;
        this.destroy_requested = false;
        this.queued_direction = null;
        this.monitor = Main.layoutManager.primaryMonitor;
        if (!settings)
           settings = new FlipperSettings(UUID);

        this.effectName = this.getEffectName();
        if (this.effectName == null ) {
            // Nothing enabled, so just do a normal workspace switch!
            Main.soundManager.play('switch');
            new_workspace.activate(global.get_current_time());
            Main.wm.showWorkspaceOSD();
            return;
        }

        this.last_direction = direction;

        if (direction != Meta.MotionDirection.RIGHT &&
            direction != Meta.MotionDirection.LEFT)
            return;

        if (global.screen.get_active_workspace() === new_workspace.index())
            return;

        this.actor = new St.Group({
            reactive: false,
            x: 0,
            y: 0,
            width: global.screen_width,
            height: global.screen_height,
            visible: true });

        Main.uiGroup.add_child(this.actor);

        this.releaseID = this.actor.connect('key-release-event', Lang.bind(this, this._keyReleaseEvent));
        this.pressID = this.actor.connect('key-press-event', Lang.bind(this, this._keyPressEvent));

        this.initBackground();
        this.dimBackground();

        Main.pushModal(this.actor);

        this._modifierMask = modifierMask;
        // If there are no modifiers, we can destroy right away
        if (!modifierMask) {
           this.destroy_requested = true;
        }
        global.window_group.hide();

        Main.getPanels().forEach(function(panel){
          panel.actor.hide();
        });

        if (window && window.get_window_type() !== Meta.WindowType.DESKTOP)
            this.moveWindow(window, new_workspace);

        this.startAnimate(new_workspace, direction);
        this.actor.show();
    },

    const: {
      STACK_DISTANCE: 400,
      STACK_ANGLE: 25,
      CUBE_HALF_ANGLE: 20,
      CUBE_FULL_ANGLE: 50,
      CUBE_START_ANGLE: 25,
      CUBE_HALF_ZOOM: 0.6,
      CUBE_ZOOM: 0.25,
      DECK_DROP: 5,
      DECK_HEIGHT: 20,
      DECK_ANGLE: 15,
      FLIP_ANGLE: 150,
      ROLODEX_ANGLE: 15,
      ROLODEX_HALF_ANGLE: 30,
      ROLODEX_FULL_ANGLE: 60,
    },

    removeWindowActor: function(workspace_clone, window, index) {
        if (workspace_clone && (workspace_clone.index == index)) {
            let i = workspace_clone.workspaceWindows.indexOf(window);
            if (i == -1) return false;
            let j;
            let done = false;
            for (j = 0; j < workspace_clone.workspaceWindows.length && !done; j++) {
                if (window.get_stable_sequence() == workspace_clone.workspaceWindowActors[j].i)
                    done = true;
            }
            workspace_clone.remove_actor
                (workspace_clone.workspaceWindowActors[j-1]);
            workspace_clone.workspaceWindows.splice(i, 1);
            workspace_clone.workspaceWindowActors.splice(j-1, 1)[0].destroy();
            return true;
        }
        return false;
    },

    addWindowActor: function(workspace_clone, window, index) {
        if (workspace_clone && (workspace_clone.index == index)) {
            let windowClone = this.cloneMetaWindow(window);
            workspace_clone.add_child(windowClone);
            //windowClone.raise_top();
            //workspace_clone.chromeGroup.raise_top();
            workspace_clone.workspaceWindowActors.push(windowClone);
            workspace_clone.workspaceWindows.push(window);
            workspace_clone.workspaceWindows.sort
                (Lang.bind(this, this._sortWindow));
            return true;
        }
        return false;
    },

    sortWindowClones: function (workspace_clone) {
        workspace_clone.workspaceWindowActors.sort(Lang.bind(this,
            function(actor1, actor2) {
                let time = this._sortWindow(actor1.win, actor1.win);
                time > 0 ? actor1.raise(actor2) : actor2.raise(actor1);
                return 0;
            }));
        workspace_clone.chromeGroup.raise_top();
    },

    moveWindowClone: function(window, active_index, new_index) {
        if (this.removeWindowActor(this.from, window, new_index)) {
            this.addWindowActor(this.to, window, active_index);
        } //else
        if (this.removeWindowActor(this.from, window, active_index)) {
            this.addWindowActor(this.to, window, new_index);
        } //else
        if (this.removeWindowActor(this.to, window, active_index)) {
            this.addWindowActor(this.from, window, new_index);
        } //else
        if (this.removeWindowActor(this.to, window, new_index)) {
            this.addWindowActor(this.from, window, active_index);
        }
    },

    moveWindow: function(window, workspace) {
        if (!window || window.is_on_all_workspaces() === true || window.get_window_type() === Meta.WindowType.DESKTOP) {
           return false;
        }

        let active_workspace = global.screen.get_active_workspace();

        let active_index = active_workspace.index();
        let new_index = workspace.index();

        if (window.get_workspace() !== workspace) {
           window.change_workspace(workspace);
        }
        Mainloop.idle_add(Lang.bind(this, function() {
            // Unless this is done a bit later,
            // window is sometimes not activated
            if (window.get_workspace() === global.screen.get_active_workspace()) {
                //window.activate(global.get_current_time());
                Main.activateWindow(window);
            }
        }));

        this.moveWindowClone(window, active_index, new_index);
        return true;
    },

    /*
    get_workspace_clone_scaled: function(workspaceIndex, direction) {
        let clone = this.get_workspace_clone(workspaceIndex);
        // clone.set_scale(1 - 2*this.getPullaway(), 1 - 2*this.getPullaway());
        clone.x = this.monitor.width / 2;
        return clone;
    },*/

    get_workspace_clone: function(workspaceIndex) {
        let clone = new St.Group({clip_to_allocation: true});
        clone.set_size(this.monitor.width, this.monitor.height);

        //if(settings.includeBackground) {
        if(settings.transitionEffect === TransitionEffect.Cube){
          let background = new St.Group();
          background.add_child(Meta.BackgroundActor.new_for_screen(global.screen));
          clone.add_child(background);
        }

        let deskletClone = new Clutter.Clone({source : Main.deskletContainer.actor});
        clone.add_child(deskletClone);

        clone.desktopClones = [];
        global.get_window_actors().forEach(function(w){
            if(w.get_meta_window().get_window_type() == Meta.WindowType.DESKTOP) {
                let compositor = w.get_meta_window().get_compositor_private();
                let rect = w.get_meta_window().get_buffer_rect();
                let windowClone = new Clutter.Clone(
                    {source: compositor,
                     reactive: true,
                     x: rect.x,
                     y: rect.y,
                    });

                clone.add_child(windowClone);
                //windowClone.lower(deskletClone);
                windowClone.get_parent().set_child_below_sibling(windowClone, deskletClone);
                clone.desktopClones.push(windowClone);
            }
        });

        let workspaceWindows = this.getWorkspaceWindows(workspaceIndex);
        clone.workspaceWindowActors = [];
        for (let i = 0; i < workspaceWindows.length; i++) {
            workspaceWindows[i].i = workspaceWindows[i].get_stable_sequence();
            let windowClone = this.cloneMetaWindow(workspaceWindows[i]);
            clone.add_child(windowClone);
            clone.workspaceWindowActors.push(windowClone);
        }
        clone.workspaceWindows = workspaceWindows;
        if (settings.includePanels) {
           let chromeGroup = new St.Group();
           Main.getPanels().concat(Main.uiGroup.get_children()).forEach(
               function (panel) {
                   // Is it a non-autohideable panel, or is it a visible, tracked
                   // chrome object? TODO: Make more human-readable the logic
                   // below in clone.add_child().
                   if ((panel.actor && !panel._hideable)
                      || (panel &&  Main.layoutManager.isTrackingChrome(panel) && panel.visible)) {
                       let chromeClone = new Clutter.Clone({
                           source: panel.actor ? panel.actor : panel,
                           x : panel.actor ? panel.actor.x : panel.x,
                           y : panel.actor ? (panel.panelPosition === Panel.PanelLoc.bottom ?
                           Main.layoutManager.primaryMonitor.y +
                           Main.layoutManager.primaryMonitor.height -
                           panel.actor.height :
                           Main.layoutManager.primaryMonitor.y) : panel.y});
                       chromeGroup.add_child(chromeClone);
                       //chromeClone.raise_top();
                       chromeClone.get_parent().set_child_above_sibling(chromeClone, null);
                   }
               });
           clone.add_child(chromeGroup);
           //chromeGroup.raise_top();
           chromeGroup.get_parent().set_child_above_sibling(chromeGroup, null);
           clone.chromeGroup = chromeGroup;
        }
        clone.index = workspaceIndex;
        return clone;
    },

    cloneMetaWindow: function(metaWindow) {
        let compositor = metaWindow.get_compositor_private();

        let rect = metaWindow.get_buffer_rect();
        let windowClone = new Clutter.Clone(
            {source: compositor,
             reactive: false,
             x: rect.x,
             y: rect.y,
            });
        windowClone.i = metaWindow.i;
        windowClone.win = metaWindow;
        return windowClone;
    },

    getWorkspaceWindows: function(workspaceIndex) {
        let workspaceWindows = [];
        let windows = global.get_window_actors();
        for (let i = 0; i < windows.length; i++) {
            let meta_window = windows[i].get_meta_window();
            if (meta_window.get_workspace().index() == workspaceIndex &&
                !meta_window.minimized &&
                meta_window.get_window_type() !== Meta.WindowType.DESKTOP) {
                workspaceWindows.push(meta_window);
            }
        }

        // workspaceWindows.sort(Lang.bind(this, this._sortWindow));
        return workspaceWindows;
        // return workspaceWindows.reverse();
    },

    _sortWindow : function(window1, window2) {
        let t1 = window1.get_user_time();
        let t2 = window2.get_user_time();
        if (t2 < t1) {
            return 1;
        } else {
            return -1;
        }
    },

    // I hide the desktop icons for now while rotating until a solution to
    // the artifacts may be found.
    /* Not used!
    setDesktopClonesVisible: function(workspace_clone, visible) {
        workspace_clone.desktopClones.forEach(Lang.bind(this, function(clone) {
            if (visible)//show
                Tweener.addTween(clone, {
                    opacity: 255,
                    // transition: settings.unrotateEffect,
                    transition: this.getRotateEffect(),
                    time: this.getAnimationTime() * 0.3333,
                });
            else//hide
                Tweener.addTween(clone, {
                    opacity: 0,
                    transition: this.getRotateEffect(),
                    time: this.getAnimationTime() * 0.3333,
                });
        }));
    },*/

    startAnimate: function(new_workspace, direction) {
      this.is_animating = true;

      let active_workspace = global.screen.get_active_workspace();
      //let new_workspace = active_workspace.get_neighbor(direction);

      let from_workspace;
      let to_workspace;

      if (this.to != null) {
        from_workspace = this.to;
        if (active_workspace.index() === new_workspace.index()) {
          // this.bounce(from_workspace, direction);
          this.from.hide();

          this.unsetIsAnimating();
          return;
        }
      } else {
        from_workspace = this.get_workspace_clone(active_workspace.index());
        this.actor.add_child(from_workspace);
      }

      // Allow Cinnamon to play the switcher sound if it's enabled.
      Main.soundManager.play('switch');

      // This is a workaround for poor animation, we enable it only during the animation
      // sequence so users don't need to set it using export CLUTTER_PAINT...
      Meta.add_clutter_debug_flags( 0, 1 << 6, 0 ); // CLUTTER_DEBUG_CONTINUOUS_REDRAW

      if (direction === this.last_direction) {
        if (this.from != null) {
          to_workspace = this.get_workspace_clone(new_workspace.index(), direction);
          this.actor.remove_actor(this.from);
          this.from.destroy();
        } else {
          to_workspace = this.get_workspace_clone(new_workspace.index());
        }
        this.actor.add_child(to_workspace);
      } else {
        // to_workspace = this.from;
        to_workspace = this.get_workspace_clone(new_workspace.index(), direction);

        if (this.from) {
          this.actor.remove_actor(this.from);
          this.from.destroy();
        }

        this.actor.add_child(to_workspace);
      }


      this.from = from_workspace;
      this.to = to_workspace;


      this.last_direction = direction;

      this.new_workspace = new_workspace;
      new_workspace.activate(global.get_current_time());
      this.prepare(from_workspace, to_workspace, direction);
    },

    getEasing: function(animationStart) {
      let effect = this.getRotateEffect();
      let dir;

      // Clone code much? Abstract this shit.
      if( effect == "EndBounce" ) {
        effect = (animationStart) ? "easeInCubic" : (this.queued_action) ? "easeOutCubic" : "easeOutBounce";
      } else if( effect == "EndBack" ) {
        effect = (animationStart) ? "easeInCubic" : (this.queued_action) ? "easeOutCubic" : "easeOutBack";
      } else if( effect == "EndElastic" ) {
        effect = (animationStart) ? "easeInCubic" : (this.queued_action) ? "easeOutCubic" : "easeOutElastic";
      } else {
        dir = (animationStart) ? "easeIn" : "easeOut";
        effect = dir + effect;
      }

      return effect;
    },

    getHalfScale: function() {
      return this.getPullaway() + (1 - this.getPullaway())/2;
    },

    getScale: function() {
      return this.getPullaway();
    },

    getTime: function() {
      if(this.hurry) {
        return this.getAnimationTime() / 2500;
      }

      return this.getAnimationTime() / 2000;
    },

    getEffectName: function() {
      if(settings.transitionEffect === TransitionEffect.Randomized) {
         let options = [];
         if(settings.settings.getValue("cube-random-include"))    options.push( "Cube" );
         if(settings.settings.getValue("deck-random-include"))    options.push( "Deck" );
         if(settings.settings.getValue("flip-random-include"))    options.push( "Flip" );
         if(settings.settings.getValue("pop-random-include"))     options.push( "Pop"  );
         if(settings.settings.getValue("rolodex-random-include")) options.push( "Rolodex" );
         if(settings.settings.getValue("slide-random-include"))   options.push( "Slide" );
         if(settings.settings.getValue("stack-random-include"))   options.push( "Stack" );
         if(options.length>0) {
            return options[Math.floor(Math.random() * options.length)];
         }
      } else {
         switch (settings.transitionEffect) {
         case TransitionEffect.Cube:
            return "Cube";
         case TransitionEffect.Deck:
            return "Deck";
         case TransitionEffect.Flip:
            return "Flip";
         case TransitionEffect.Pop:
            return "Pop";
         case TransitionEffect.Rolodex:
            return "Rolodex";
         case TransitionEffect.Slide:
            return "Slide";
         case TransitionEffect.Stack:
            return "Stack";
         }
      }
      return null;
    },

    prepare: function(from, to, direction) {
      from.raise_top();
      from.show();
      to.show();

      to.set_scale(1,1);
      from.set_scale(1,1);

      if(this.effectName == "Stack") {
        this.stack_start(from, to, direction);
      } else if(this.effectName == "Pop") {
        this.pop_start(from, to, direction);
      } else if(this.effectName == "Flip") {
        this.flip_start(from, to, direction);
      } else if(this.effectName == "Cube"){
        this.cube_start(from, to, direction);
      } else if(this.effectName == "Slide"){
        this.slide_start(from, to, direction);
      } else if(this.effectName == "Deck"){
        this.deck_start(from, to, direction);
      } else if(this.effectName == "Rolodex"){
        this.rolodex_start(from, to, direction);
      }
    },

    ///////////////////////////////////////////
    // POP
    ///////////////////////////////////////////
    pop_end: function(from, to, direction) {
      from.hide();
      to.raise_top();
      to.show();
      //this.new_workspace.activate(global.get_current_time());

      if (to.workspaceWindowActors.length > 0) {
        let range = this.getTime();
        let startTime = this.getTime();
        let delay = 0;
        let step = range / to.workspaceWindowActors.length;
        let tween = {
          scale_x: 1.0,
          scale_y: 1.0,
          delay: delay,
          transition: this.getEasing(false),
          time: startTime
        };

        if (direction == Meta.MotionDirection.RIGHT) {
          to.workspaceWindowActors.reverse();
        }

        for(let i=0; i<to.workspaceWindowActors.length; ++i) {
          let actor = to.workspaceWindowActors[i];
          actor.set_opacity(0);
          actor.set_pivot_point(0.5, 0.5);
          tween.delay = delay;
          delay += step;


          if (direction == Meta.MotionDirection.LEFT) {
            actor.set_scale(2.0 - this.getPullaway(), 2.0 - this.getPullaway());
          } else {
            actor.set_scale(this.getPullaway(), this.getPullaway());
          }

          // is this the last entry?
          if (i == to.workspaceWindowActors.length-1) {
            tween.onComplete = this.unsetIsAnimating;
            tween.onCompleteScope = this;
          } else {
            delete tween.onComplete;
            delete tween.onCompleteScope;
          }

          Tweener.addTween(actor, tween);
          Tweener.addTween(actor, {time: startTime, delay: tween.delay, opacity: 255, transition: "easeInSine"});
        }

        // Switch it back...
        if (direction == Meta.MotionDirection.RIGHT) {
          to.workspaceWindowActors.reverse();
        }
      } else {
        Tweener.addTween(to, {
          transition: this.getEasing(true),
          onComplete: this.unsetIsAnimating,
          onCompleteScope: this,
          time: this.getTime()
        });
      }
    },

    pop_start: function(from, to, direction) {
      to.hide();

      if (from.workspaceWindowActors.length > 0) {
        let range = this.getTime();
        let startTime = this.getTime();
        let delay = 0;
        let step = range / from.workspaceWindowActors.length;
        let tween = {
          transition: this.getEasing(true),
          time: startTime
        };

        if (direction == Meta.MotionDirection.LEFT) {
          tween.scale_x = this.getScale();
          tween.scale_y =  this.getScale();
          from.workspaceWindowActors.reverse();
        } else {
          tween.scale_x = 2.0 - this.getScale();
          tween.scale_y = 2.0 - this.getScale();
        }

        for(let i=from.workspaceWindowActors.length-1; i >= 0; --i) {
          let actor = from.workspaceWindowActors[i];
          actor.set_pivot_point(0.5, 0.5);
          tween.delay = delay;
          delay += step;

          if (i == 0) {
            tween.onCompleteParams = [from, to, direction];
            tween.onComplete = this.pop_end;
            tween.onCompleteScope = this;
          }

          Tweener.addTween(actor, tween);
          Tweener.addTween(actor, {time: startTime, delay: tween.delay, opacity: 0, transition: "easeInSine"});
        }

        // Switch it back...
        if (direction == Meta.MotionDirection.LEFT) {
          from.workspaceWindowActors.reverse();
        }
      } else {
        Tweener.addTween(to, {
          time: this.getTime(),
          onCompleteParams: [from, to, direction],
          onComplete: this.pop_end,
          onCompleteScope: this
        });
      }
    },

    ///////////////////////////////////////////
    // STACK
    ///////////////////////////////////////////
    stack_end: function(from, to, direction) {
      let tween = {
        scale_x: 1.0,
        scale_y: 1.0,
        transition: this.getEasing(false),
        onComplete: this.unsetIsAnimating,
        onCompleteScope: this
      };

      from.hide();
      to.show();
      to.raise_top();
      //this.new_workspace.activate(global.get_current_time());

      if (to.workspaceWindowActors.length > 0) {

        let range = this.getTime();
        let startTime = this.getTime();
        let delay = 0;
        let step = range / to.workspaceWindowActors.length;

        for(let i=0; i<to.workspaceWindowActors.length; ++i) {
          let actor = to.workspaceWindowActors[i];
          let to_x = actor.x;

          actor.set_opacity(0);
          actor.set_pivot_point(0.5, 0.5);
          actor.set_scale(this.getPullaway(), this.getPullaway());

          if (direction == Meta.MotionDirection.LEFT) {
            actor.move_anchor_point(0, 0);
            // actor.set_position(actor.x - this.const.STACK_DISTANCE, actor.y);
            actor.set_position(actor.x - this.monitor.width/2, actor.y);
            actor.rotation_angle_y = -this.const.STACK_ANGLE;
          } else {
            actor.move_anchor_point(actor.width, 0);
            // actor.set_position(actor.x + this.const.STACK_DISTANCE, actor.y);
            actor.set_position(actor.x + this.monitor.width/2, actor.y);
            actor.rotation_angle_y = this.const.STACK_ANGLE;
            to_x += actor.width;
          }

          tween.x = to_x;
          tween.delay = delay;
          tween.time = startTime;
          tween.rotation_angle_y = 0;

          // is this the last entry?
          if (i == to.workspaceWindowActors.length-1) {
            tween.onComplete = this.unsetIsAnimating;
            tween.onCompleteScope = this;
          } else {
            delete tween.onComplete;
            delete tween.onCompleteScope;
          }

          Tweener.addTween(actor, tween);
          Tweener.addTween(actor, {time: startTime, delay: delay, opacity: 255, transition: "easeInSine"});
          delay += step;
        }
      } else {
        Tweener.addTween(to, tween);
      }
    },

    stack_start: function(from, to, direction) {
      let angle_to;
      let x_pos;

      to.hide();

      if (from.workspaceWindowActors.length > 0) {
        let range = this.getTime();
        let startTime = this.getTime();
        let delay = 0;
        let step = range / from.workspaceWindowActors.length;

        for(let i=from.workspaceWindowActors.length-1; i>=0; --i) {
          let actor = from.workspaceWindowActors[i];

          if (direction == Meta.MotionDirection.LEFT) {
            actor.move_anchor_point(actor.width, 0);
            // x_pos = actor.x + this.const.STACK_DISTANCE;
            x_pos = actor.x + this.monitor.width/2;
            angle_to = this.const.STACK_ANGLE;

            actor.set_pivot_point(0.5, 0.5);
          } else {
            actor.move_anchor_point(0, 0);
            // x_pos = actor.x - this.const.STACK_DISTANCE;
            x_pos = actor.x - this.monitor.width/2;
            angle_to = -this.const.STACK_ANGLE;

            actor.set_pivot_point(0.5, 0.5);
          }

          let tween = {
            x: x_pos,
            scale_x: this.getPullaway(),
            scale_y: this.getPullaway(),
            delay: delay,
            rotation_angle_y: angle_to,
            transition: this.getEasing(true),
            time: startTime
          };

          if (i == 0) {
            tween.onCompleteParams = [from, to, direction];
            tween.onComplete = this.stack_end;
            tween.onCompleteScope = this;
          }
          Tweener.addTween(actor, tween);
          Tweener.addTween(actor, {time: startTime, delay: delay, opacity: 0, transition: "easeInSine"});
          delay += step;
        }
      } else {
        Tweener.addTween(to, {
          time: this.getTime(),
          onCompleteParams: [from, to, direction],
          onComplete: this.stack_end,
          onCompleteScope: this
        });
      }
    },

    ///////////////////////////////////////////
    // FLIP
    ///////////////////////////////////////////
    flip_end: function(from, to, direction) {
      let angle_from;
      let angle_to;
      let x_pos;

      if (direction == Meta.MotionDirection.LEFT) {
          angle_from = this.const.FLIP_ANGLE;
          angle_to = 0;
          x_pos = this.monitor.width / 2;
      } else {
          angle_from = -this.const.FLIP_ANGLE;
          angle_to = 0;
          x_pos = this.monitor.width / 2;
      }

      Tweener.addTween(to, {
          x: x_pos,
          scale_x: 1.0,
          scale_y: 1.0,
          rotation_angle_y: angle_to,
          transition: this.getEasing(false),
          time: this.getTime(),
          onComplete: this.unsetIsAnimating,
          onCompleteScope: this
      });
      Tweener.addTween(to, {time: this.getTime(), opacity: 255, transition: "easeInSine"});

      from.hide();
      to.show();
      //this.new_workspace.activate(global.get_current_time());
    },

    flip_start: function(from, to, direction) {
      let angle_from;
      let angle_to;
      let x_pos;

      to.hide();

      if (direction == Meta.MotionDirection.LEFT) {
        angle_from = this.const.FLIP_ANGLE;
        angle_to = 0;
        x_pos = this.monitor.width / 2;

        from.move_anchor_point_from_gravity(Clutter.Gravity.CENTER);
        to.move_anchor_point_from_gravity(Clutter.Gravity.CENTER);

        from.set_position(x_pos, this.monitor.height/2);
        to.set_position(x_pos, this.monitor.height/2);
      } else {
        angle_from = -this.const.FLIP_ANGLE;
        angle_to = 0;
        x_pos = this.monitor.width / 2;

        from.move_anchor_point_from_gravity(Clutter.Gravity.CENTER);
        to.move_anchor_point_from_gravity(Clutter.Gravity.CENTER);

        from.set_position(x_pos, this.monitor.height/2);
        to.set_position(x_pos, this.monitor.height/2);
      }

      Tweener.addTween(from, {
          x: x_pos,
          scale_x: this.getPullaway(),
          scale_y: this.getPullaway(),
          rotation_angle_y: angle_from/2,
          transition: this.getEasing(true),
          time: this.getTime(),
      });
      Tweener.addTween(from, {time: this.getTime(), opacity: 255 * (1.0 - this.getFade()), transition: "easeInSine"});

      Tweener.addTween(to, {
          x: x_pos,
          scale_x: this.getPullaway(),
          scale_y: this.getPullaway(),
          rotation_angle_y: -angle_from/2,
          transition: this.getEasing(true),
          time: this.getTime(),
          onCompleteParams: [from, to, direction],
          onComplete: this.flip_end,
          onCompleteScope: this,
      });
      Tweener.addTween(to, {time: this.getTime(), opacity: 255 * (1.0 - this.getFade()), transition: "easeInSine"});
    },

    ///////////////////////////////////////////
    // SLIDE
    ///////////////////////////////////////////
    slide_end: function(from, to, direction) {
      let fromTransition;
      to.raise_top();
      //this.new_workspace.activate(global.get_current_time());

      if (direction == Meta.MotionDirection.LEFT) {
        fromTransition = this.monitor.width;
      } else {
        fromTransition = -this.monitor.width;
      }

      Tweener.addTween(from, {
          x: fromTransition,
          scale_x: this.getScale(),
          scale_y: this.getScale(),
          transition: this.getEasing(false),
          time: this.getTime(),
      });
      Tweener.addTween(from, {time: this.getTime(), opacity: 255 * this.getFade(), transition: "easeInSine"});

      Tweener.addTween(to, {
          x: 0,
          scale_x: 1.0,
          scale_y: 1.0,
          transition: this.getEasing(false),
          time: this.getTime(),
          onComplete: this.unsetIsAnimating,
          onCompleteScope: this
      });
      Tweener.addTween(to, {time: this.getTime(), opacity: 255, transition: "easeInSine"});

    },

    slide_start: function(from, to, direction) {
      to.raise_top();

      from.move_anchor_point_from_gravity(Clutter.Gravity.WEST);
      to.move_anchor_point_from_gravity(Clutter.Gravity.WEST);

      let toTransition;
      let fromTransition;

      if (direction == Meta.MotionDirection.LEFT) {
        from.set_position(0, this.monitor.height/2);
        from.rotation_angle_y = 0;

        to.set_position(-this.monitor.width, this.monitor.height/2);
        to.rotation_angle_y = 0;

        toTransition = -this.monitor.width/2;
        fromTransition = this.monitor.width/2;
      } else {
        from.set_position(0, this.monitor.height/2);
        from.rotation_angle_y = 0;

        to.set_position(this.monitor.width, this.monitor.height/2);
        to.rotation_angle_y = 0;

        toTransition = this.monitor.width/2;
        fromTransition = -this.monitor.width/2;
      }

      from.set_scale(1,1);
      to.set_scale(this.getPullaway(), this.getPullaway());

      Tweener.addTween(from, {
          x: fromTransition,
          scale_x: this.getHalfScale(),
          scale_y: this.getHalfScale(),
          transition: this.getEasing(true),
          time: this.getTime(),
      });
      Tweener.addTween(from, {time: this.getTime(), opacity: 255 * this.getFade(), transition: "easeInSine"});

      Tweener.addTween(to, {
          x: toTransition,
          scale_x: this.getHalfScale(),
          scale_y: this.getHalfScale(),
          transition: this.getEasing(true),
          time: this.getTime(),
          onCompleteParams: [from, to, direction],
          onComplete: this.slide_end,
          onCompleteScope: this,
      });
      Tweener.addTween(to, {time: this.getTime(), opacity: 255 * (1.0 - this.getFade()), transition: "easeInSine"});
    },

    ///////////////////////////////////////////
    // DECK
    ///////////////////////////////////////////
    deck_end: function(from, to, direction) {
      //this.new_workspace.activate(global.get_current_time());
      to.show();

      if (direction == Meta.MotionDirection.LEFT) {
        Tweener.addTween(to, {
            x: 0,
            y: this.monitor.height/2,
            scale_x: 1,
            scale_y: 1,
            transition: this.getEasing(false),
            rotation_angle_y: 0,
            time: this.getTime(),
            onComplete: this.unsetIsAnimating,
            onCompleteScope: this
        });
        Tweener.addTween(to, {time: this.getTime(), opacity: 255, transition: "easeInSine"});
      } else {
        Tweener.addTween(to, {
          scale_x: 1.0,
          scale_y: 1.0,
          transition: this.getEasing(false),
          time: this.getTime()
        });
        Tweener.addTween(to, {time: this.getTime(), opacity: 255, transition: "easeInSine"});

        Tweener.addTween(from, {
            x: -this.monitor.width,
            //brightness: 1.0,
            scale_x: this.getScale(),
            scale_y: this.getScale(),
            transition: this.getEasing(false),
            time: this.getTime(),
            onComplete: this.unsetIsAnimating,
            onCompleteScope: this
        });
        Tweener.addTween(from, {time: this.getTime(), opacity: 0, transition: "easeInSine"});
      }

    },

    deck_start: function(from, to, direction) {
      from.move_anchor_point_from_gravity(Clutter.Gravity.WEST);
      to.move_anchor_point_from_gravity(Clutter.Gravity.WEST);

      let toTransition;
      let fromTransition;

      if (direction == Meta.MotionDirection.LEFT) {
        to.raise_top();
        from.set_position(0, this.monitor.height/2 );
        from.rotation_angle_y = 0;
        from.set_pivot_point(0.5, 0);

        to.set_position(-this.monitor.width, this.monitor.height/2 - this.const.DECK_HEIGHT);
        to.rotation_angle_y = -this.const.DECK_ANGLE;

        toTransition = -this.monitor.width/2;
        to.set_scale(this.getScale(), this.getScale());
        to.set_opacity(0);

        Tweener.addTween(from, {
          scale_x: this.getHalfScale(),
          scale_y: this.getHalfScale(),
          transition: this.getEasing(true),
          time: this.getTime()
        });
        Tweener.addTween(from, {time: this.getTime(), opacity: 0, transition: "easeInSine"});

        Tweener.addTween(to, {
            x: toTransition,
            scale_x: this.getHalfScale(),
            scale_y: this.getHalfScale(),
            transition: this.getEasing(true),
            time: this.getTime(),
            onCompleteParams: [from, to, direction],
            onComplete: this.deck_end,
            onCompleteScope: this
        });
        Tweener.addTween(to, {time: this.getTime(), opacity: 255, transition: "easeInSine"});
      } else {
        from.raise_top();
        from.set_position(0, this.monitor.height/2);
        from.rotation_angle_y = 0;

        to.set_position(0, this.monitor.height/2);
        to.rotation_angle_y = 0;

        fromTransition = -this.monitor.width/2;
        to.set_opacity(0);
        to.set_scale(this.getScale(), this.getScale());
        to.set_pivot_point(0.5, 0);

        Tweener.addTween(to, {
          scale_x: this.getHalfScale(),
          scale_y: this.getHalfScale(),
          transition: this.getEasing(true),
          time: this.getTime()
        });
        Tweener.addTween(to, {time: this.getTime(), opacity: 255, transition: "easeInSine"});

        Tweener.addTween(from, {
            x: fromTransition,
            y: this.monitor.height/2 - this.const.DECK_HEIGHT,
            scale_x: this.getHalfScale(),
            scale_y: this.getHalfScale(),
            rotation_angle_y: -this.const.DECK_ANGLE,
            transition: this.getEasing(true),
            time: this.getTime(),
            onCompleteParams: [from, to, direction],
            onComplete: this.deck_end,
            onCompleteScope: this
        });
        Tweener.addTween(from, {time: this.getTime(), opacity: 255 * (1.0 - this.getFade()), transition: "easeInSine"});
      }
    },

    ///////////////////////////////////////////
    // CUBE
    ///////////////////////////////////////////
    cube_end: function(from, to, direction) {
      //this.new_workspace.activate(global.get_current_time());
      to.raise_top();

      if (direction == Meta.MotionDirection.RIGHT) {
        Tweener.addTween(to, {
            scale_x: 1,
            scale_y: 1,
            transition: this.getEasing(false),
            rotation_angle_y: 0,
            time: this.getTime(),
            onComplete: this.unsetIsAnimating,
            onCompleteScope: this
        });
        Tweener.addTween(to, {time: this.getTime(), opacity: 255, transition: "easeInSine"});
        Tweener.addTween(from, {
            // x: -this.monitor.width,
            scale_x: this.const.CUBE_ZOOM * this.getScale(),
            scale_y: this.const.CUBE_ZOOM * this.getScale(),
            transition: this.getEasing(false),
            rotation_angle_y: this.const.CUBE_FULL_ANGLE
        });
        Tweener.addTween(from, {opacity: this.getFade(), transition: "easeInSine"});
      } else {
        Tweener.addTween(to, {
            scale_x: 1,
            scale_y: 1,
            transition: this.getEasing(false),
            rotation_angle_y: 0,
            time: this.getTime(),
            onComplete: this.unsetIsAnimating,
            onCompleteScope: this
        });
        Tweener.addTween(to, {time: this.getTime(), opacity: 255, transition: "easeInSine"});
        Tweener.addTween(from, {
            scale_x: this.const.CUBE_ZOOM * this.getScale(),
            scale_y: this.const.CUBE_ZOOM * this.getScale(),
            transition: this.getEasing(false),
            rotation_angle_y: -this.const.CUBE_FULL_ANGLE
        });
        Tweener.addTween(from, {opacity: this.getFade(), transition: "easeInSine"});
      }

    },

    cube_start: function(from, to, direction) {
      let toTransition;

      from.show();
      to.show();

      if (direction == Meta.MotionDirection.RIGHT) {
        from.move_anchor_point_from_gravity(Clutter.Gravity.WEST);
        to.move_anchor_point_from_gravity(Clutter.Gravity.EAST);

        from.raise_top();
        from.set_position(0, this.monitor.height/2 );
        from.rotation_angle_y = 0;

        to.set_position(this.monitor.width, this.monitor.height/2);
        to.rotation_angle_y = this.const.CUBE_START_ANGLE;
        to.set_scale(this.const.CUBE_ZOOM, this.const.CUBE_ZOOM);

        to.set_opacity(this.getFade());

        toTransition = this.monitor.width/2;

        Tweener.addTween(from, {
            rotation_angle_y: -this.const.CUBE_HALF_ANGLE,
            scale_x: this.const.CUBE_HALF_ZOOM,
            scale_y: this.const.CUBE_HALF_ZOOM,
            transition: this.getEasing(true),
            time: this.getTime()
        });
        Tweener.addTween(from, {time: this.getTime(), opacity: 255 * (1.0 - this.getFade()), transition: "easeInSine"});

        Tweener.addTween(to, {
            rotation_angle_y: this.const.CUBE_HALF_ANGLE,
            scale_x: this.const.CUBE_HALF_ZOOM,
            scale_y: this.const.CUBE_HALF_ZOOM,
            transition: this.getEasing(true),
            time: this.getTime(),
            onCompleteParams: [from, to, direction],
            onComplete: this.cube_end,
            onCompleteScope: this
        });
        Tweener.addTween(to, {time: this.getTime(), opacity: 255 * (1.0 - this.getFade()), transition: "easeInSine"});
      } else {
        from.move_anchor_point_from_gravity(Clutter.Gravity.EAST);
        to.move_anchor_point_from_gravity(Clutter.Gravity.WEST);

        from.raise_top();
        from.set_position(this.monitor.width, this.monitor.height/2 );
        from.rotation_angle_y = 0;

        to.set_position(0, this.monitor.height/2);
        to.rotation_angle_y = -this.const.CUBE_START_ANGLE;
        to.set_scale(this.const.CUBE_ZOOM, this.const.CUBE_ZOOM);
        to.set_opacity(this.getFade());

        toTransition = -this.monitor.width/2;

        Tweener.addTween(from, {
            rotation_angle_y: this.const.CUBE_HALF_ANGLE,
            scale_x: this.const.CUBE_HALF_ZOOM,
            scale_y: this.const.CUBE_HALF_ZOOM,
            transition: this.getEasing(true),
            time: this.getTime(),
        });
        Tweener.addTween(from, {time: this.getTime(), opacity: 255 * (1.0 - this.getFade()), transition: "easeInSine"});

        Tweener.addTween(to, {
            rotation_angle_y: -this.const.CUBE_HALF_ANGLE,
            scale_x: this.const.CUBE_HALF_ZOOM,
            scale_y: this.const.CUBE_HALF_ZOOM,
            transition: this.getEasing(true),
            time: this.getTime(),
            onCompleteParams: [from, to, direction],
            onComplete: this.cube_end,
            onCompleteScope: this
        });
        Tweener.addTween(to, {time: this.getTime(), opacity: 255 * (1.0 - this.getFade()), transition: "easeInSine"});
      }
    },

    ///////////////////////////////////////////
    // ROLODEX
    ///////////////////////////////////////////
    rolodex_end: function(from, to, direction) {
      from.hide();
      to.raise_top();
      to.show();
      //this.new_workspace.activate(global.get_current_time());

      if (to.workspaceWindowActors.length > 0) {
        let range = this.getTime();
        let startTime = this.getTime();
        let delay = 0;
        let step = range / to.workspaceWindowActors.length;
        let tween = {
          scale_x: 1.0,
          scale_y: 1.0,
          rotation_angle_x: 0,
          delay: delay,
          transition: this.getEasing(false),
          time: startTime
        };

        if (direction == Meta.MotionDirection.RIGHT) {
          to.workspaceWindowActors.reverse();
        }

        for(let i=0; i<to.workspaceWindowActors.length; ++i) {
          let actor = to.workspaceWindowActors[i];
          actor.set_opacity(0);
          actor.move_anchor_point(0, 1.5 * this.monitor.height);
          actor.set_pivot_point(0.5, 1);
          tween.delay = delay;
          delay += step;

          if (direction == Meta.MotionDirection.LEFT) {
            actor.set_scale(1.0 * this.getScale(), 1.0 * this.getScale());
            actor.rotation_angle_x = -this.const.ROLODEX_ANGLE;
          } else {
            actor.set_scale(1.0 * this.getScale(), 1.0 * this.getScale());
            actor.rotation_angle_x = this.const.ROLODEX_ANGLE;
          }

          // is this the last entry?
          if (i == to.workspaceWindowActors.length-1) {
            tween.onComplete = this.unsetIsAnimating;
            tween.onCompleteScope = this;
          } else {
            delete tween.onComplete;
            delete tween.onCompleteScope;
          }

          Tweener.addTween(actor, tween);
          Tweener.addTween(actor, {delay: tween.delay, time: startTime, opacity: 255, transition: "easeInSine"});
        }

        // Switch it back...
        if (direction == Meta.MotionDirection.RIGHT) {
          to.workspaceWindowActors.reverse();
        }
      } else {
        Tweener.addTween(to, {
          transition: this.getEasing(true),
          onComplete: this.unsetIsAnimating,
          onCompleteScope: this,
          time: this.getTime()
        });
      }
    },

    rolodex_start: function(from, to, direction) {
      to.hide();

      if (from.workspaceWindowActors.length > 0) {
        let range = this.getTime();
        let startTime = this.getTime();
        let delay = 0;
        let step = range / from.workspaceWindowActors.length;
        let tween = {
          rotation_angle_x: this.const.ROLODEX_ANGLE,
          transition: this.getEasing(true),
          time: startTime
        };

        if (direction == Meta.MotionDirection.LEFT) {
          tween.scale_x = 1.0 * this.getScale(),
          tween.scale_y = 1.0 * this.getScale(),
          tween.rotation_angle_x = this.const.ROLODEX_ANGLE;
          from.workspaceWindowActors.reverse();
        } else {
          tween.scale_x = 1.0 * this.getScale(),
          tween.scale_y = 1.0 * this.getScale(),
          tween.rotation_angle_x = -this.const.ROLODEX_ANGLE;
        }

        for(let i=from.workspaceWindowActors.length-1; i >= 0; --i) {
          let actor = from.workspaceWindowActors[i];
          actor.move_anchor_point(0, 1.5 * this.monitor.height);
          actor.set_pivot_point(0.5, 1);
          tween.delay = delay;
          delay += step;

          if (i == 0) {
            tween.onCompleteParams = [from, to, direction];
            tween.onComplete = this.rolodex_end;
            tween.onCompleteScope = this;
          }

          Tweener.addTween(actor, tween);
          Tweener.addTween(actor, {time: startTime, delay: tween.delay, opacity: 0, transition: "easeInSine"});
        }

        // Switch it back...
        if (direction == Meta.MotionDirection.LEFT) {
          from.workspaceWindowActors.reverse();
        }
      } else {
        Tweener.addTween(to, {
          time: this.getTime(),
          onCompleteParams: [from, to, direction],
          onComplete: this.rolodex_end,
          onCompleteScope: this
        });
      }
    },
    ///////////////////////////////////////////
    // END OF ANIMATIONS!
    ///////////////////////////////////////////

    unsetIsAnimating: function() {
      // this.from.hide();
      this.is_animating = false;

      if( this.queued_action ){
        let action = this.queued_action;
        this.queued_action = null;
        this.processKeypress( action );
      } else if( this.destroy_requested ) {
        //global.log("destroy");
        this.onDestroy();
      }
      //Main.wm.showWorkspaceOSD();
      Meta.remove_clutter_debug_flags( 0, 1 << 6, 0 ); // CLUTTER_DEBUG_CONTINUOUS_REDRAW
    },

    // Change the workspace to parm ws_cur
    _keyActionWorkspace: function(ws_idx) {
        let newWS = global.workspace_manager.get_workspace_by_index(ws_idx);
        if (!newWS) return;
        let [transitions_needed, direction] = getTransitionsAndDirection(newWS);
        this.startAnimate(newWS, direction);
    },

    processKeypress: function(action) {
      let window;
      let new_workspace;
      let direction;

      switch(action) {
        case Meta.KeyBindingAction.MOVE_TO_WORKSPACE_LEFT:
          direction = Meta.MotionDirection.LEFT;
          window = global.display.get_focus_window();
          new_workspace = global.screen.get_active_workspace().get_neighbor(direction);
          this.moveWindow(window, new_workspace);
          this.startAnimate(new_workspace, direction);
          break;

        case Meta.KeyBindingAction.MOVE_TO_WORKSPACE_RIGHT:
          direction = Meta.MotionDirection.RIGHT;
          window = global.display.get_focus_window();
          new_workspace = global.screen.get_active_workspace().get_neighbor(direction);
          this.moveWindow(window, new_workspace);
          this.startAnimate(new_workspace, direction);
          break;

        case Meta.KeyBindingAction.WORKSPACE_LEFT:
          direction = Meta.MotionDirection.LEFT;
          new_workspace = global.screen.get_active_workspace().get_neighbor(direction);
          this.startAnimate(new_workspace, direction);
          break;

        case Meta.KeyBindingAction.WORKSPACE_RIGHT:
          direction = Meta.MotionDirection.RIGHT;
          new_workspace = global.screen.get_active_workspace().get_neighbor(direction);
          this.startAnimate(new_workspace, direction);
          break;

        case Meta.KeyBindingAction.WORKSPACE_1:
           this._keyActionWorkspace(0);
           return true;

        case Meta.KeyBindingAction.WORKSPACE_2:
           this._keyActionWorkspace(1);
           return true;

        case Meta.KeyBindingAction.WORKSPACE_3:
           this._keyActionWorkspace(2);
           return true;

        case Meta.KeyBindingAction.WORKSPACE_4:
           this._keyActionWorkspace(3);
           return true;

        case Meta.KeyBindingAction.WORKSPACE_5:
           this._keyActionWorkspace(4);
           return true;

        case Meta.KeyBindingAction.WORKSPACE_6:
           this._keyActionWorkspace(5);
           return true;

        case Meta.KeyBindingAction.WORKSPACE_7:
           this._keyActionWorkspace(6);
           return true;

        case Meta.KeyBindingAction.WORKSPACE_8:
           this._keyActionWorkspace(7);
           return true;

        case Meta.KeyBindingAction.WORKSPACE_9:
           this._keyActionWorkspace(8);
           return true;

        case Meta.KeyBindingAction.WORKSPACE_10:
           this._keyActionWorkspace(9);
           return true;

        case Meta.KeyBindingAction.WORKSPACE_11:
           this._keyActionWorkspace(10);
           return true;

        case Meta.KeyBindingAction.WORKSPACE_12:
           this._keyActionWorkspace(11);
           return true;

      }

    },

    _keyPressEvent: function(actor, event) {
      // Make sure we don't accidentally destroy the scene
      this.destroy_requested = false;

      let event_state = Cinnamon.get_event_state(event);
      if (this.is_animating) {
        this.hurry = true;
        this.queued_action = global.display.get_keybinding_action(event.get_key_code(), event_state);
      } else {
        this.hurry = false;
        let action = global.display.get_keybinding_action(event.get_key_code(), event_state);

        this.processKeypress(action);
      }

      return true;
    },

    _keyReleaseEvent: function(actor, event) {
        let [x, y, mods] = global.get_pointer();
        let state = mods & this._modifierMask;


        if (state == 0) {
          if (this.is_animating) {
            this.destroy_requested = true;
          } else {
            this.destroy_requested = true;
            this.onDestroy();
          }
        }

        return true;
    },

    initBackground: function() {
       this._backgroundGroup = new St.Group({});
       Main.uiGroup.add_child(this._backgroundGroup);
       this._backgroundGroup.hide();
       this.metaBackgroundActor = Meta.BackgroundActor.new_for_screen(global.screen);
       this._backgroundGroup.add_child(this.metaBackgroundActor);
       Main.uiGroup.set_child_above_sibling(this._backgroundGroup, null);
       Main.uiGroup.set_child_below_sibling(this._backgroundGroup, this.actor);
   },

    dimBackground: function() {
        this._backgroundGroup.show();
        let background = this._backgroundGroup.get_children()[0];
        Tweener.addTween(background, {
            //dim_factor: this.getDimFactor(),
            opacity: Math.round(this.getDimFactor()*255),
            time: this.getTime(),
            transition: 'easeInQuad'
        });
    },

    undimBackground: function(performCheck) {
      //global.log("undimBackground -- undimming");

      if((performCheck && this.destroy_requested) || !performCheck) {
        this._backgroundGroup.show();
        let background = this._backgroundGroup.get_children()[0];
        Tweener.addTween(background, {
            //dim_factor: 1.0,
            opacity: 255,
            time: this.getTime(),
            transition: 'easeInQuad',
            onComplete: this.destroy,
            onCompleteScope: this
        });
      }
    },

    onDestroy: function() {
      this.undimBackground();
      this.destroy_requested = false;
      //global.log("onDestroy done");
    },

    destroy: function() {
      //global.log("destroy called");
      Main.uiGroup.remove_actor(this._backgroundGroup);
      Main.uiGroup.remove_actor(this.actor);

      Main.getPanels().forEach(function(panel){
        panel.actor.show();
      });

      global.window_group.show();
      this.actor.disconnect(this.releaseID);
      this.actor.disconnect(this.pressID);
      this.metaBackgroundActor.destroy();
      this.actor.destroy();
      //global.log("destroy done");
    },

    getAnimationTime: function() {
       return settings.settings.getValue( this.effectName.toLowerCase() + "-animationTime" );
    },

    getPullaway: function() {
       return settings.settings.getValue( this.effectName.toLowerCase() + "-pullaway" );
    },

    getFade: function() {
       return settings.settings.getValue( this.effectName.toLowerCase() + "-fade" );
    },

    getRotateEffect: function() {
       return settings.settings.getValue( this.effectName.toLowerCase() + "-rotateEffect" );
    },

    getDimFactor: function() {
       return settings.settings.getValue( this.effectName.toLowerCase() + "-dim-factor" );
    }
};

function getTransitionsAndDirection(workspace, cur_ws_idx) {
    let direction;
    // Determine the current workspace index
    let curWS = (cur_ws_idx)?cur_ws_idx:global.workspace_manager.get_active_workspace_index();

    // Handle the case where no transitions are needed
    let newWS = workspace.index();
    if (curWS === newWS) {
       return([0,0]);
    }
    // Calculate the number and direction of the transitions needed
    let transitions_needed = Math.abs(curWS-newWS);
    let nWorkspaces = global.workspace_manager.get_n_workspaces();
    if (curWS > newWS) {
       direction = Meta.MotionDirection.LEFT;
    } else {
       direction = Meta.MotionDirection.RIGHT;
    }
    return([transitions_needed, direction]);
}

// Our handler for the left/right hotkeys
function onSwitch(display, window, binding) {
    let direction;
    let bindingName = binding.get_name()
    if (bindingName.endsWith("left")) {
        direction = Meta.MotionDirection.LEFT;
    } else {
       direction = Meta.MotionDirection.RIGHT;
    }
    let new_workspace = global.screen.get_active_workspace().get_neighbor(direction);
    let mask = binding.get_mask();
    let modifierMask = imports.ui.appSwitcher.appSwitcher.primaryModifier(mask);
    if (bindingName.startsWith("move")) {
       new Flipper(new_workspace, direction, modifierMask, window);
    } else {
       new Flipper(new_workspace, direction, modifierMask, null);
    }
}

// Our handler for the "Switch to workspace #" hotkeys.
// This needs to be able to handle cases where the extension has been disabled
// since I have yet to find a way to restore the original handler on disable.
function switchToWorkspace(display, window, binding) {
   let [, , , newWSIdx] = binding.get_name().split('-');
   newWSIdx--;
   let new_workspace = global.workspace_manager.get_workspace_by_index(newWSIdx);
   if (!enabled) {
      // Allow Cinnamon to play the switcher sound if it's enabled.
      Main.soundManager.play('switch');
      new_workspace.activate(global.get_current_time());
      Main.wm.showWorkspaceOSD();
   } else {
      let [transitions_needed, direction] = getTransitionsAndDirection(new_workspace);
      if (transitions_needed) {
         let mask = binding.get_mask();
         let modifierMask = imports.ui.appSwitcher.appSwitcher.primaryModifier(mask);
         new Flipper(new_workspace, direction, modifierMask);
      }
   }
}

// Our version of moveToWorkspace() which will be Monkey Patched over the Cinnamon version
// This is how we handle the workspace switching initiated by the "Workspace Switcher" applet
function moveToWorkspace(workspace, direction_hint) {
    if (Main.expo._shown) {
       original_mw_moveToWorkspace(workspace, direction_hint);
    } else {
        let [transitions_needed, direction] = getTransitionsAndDirection(workspace);
        if (transitions_needed) {
            new Flipper(workspace, direction);
        }
    }
}

// Our version of activateWindow which will be Monkey Patched over the cinnamon version
// Here we will check if target window is on a different workspace and use Flipper if needed
function activateWindow(window, time, workspaceNum) {
   let activeWorkspaceNum = global.workspace_manager.get_active_workspace_index();
   if (workspaceNum === undefined) {
      let windowsWS = window.get_workspace();
      workspaceNum = windowsWS.index();
   }

   if (!Main.expo._shown && activeWorkspaceNum !== workspaceNum) {
      let newWS = global.workspace_manager.get_workspace_by_index(workspaceNum);
      let [transitions_needed, direction] = getTransitionsAndDirection(newWS);
      new Flipper(newWS, direction, null, window);
   } else {
      original_main_activateWindow(window, time, workspaceNum);
   }
}

function FlipperSettings(uuid) {
    this._init(uuid);
}

// Extension Workspace Switching API
// This function can be used by other programs to initiate a workspace change using the Flipper effect
// The direction argument must be Meta.MotionDirection.RIGHT or Meta.MotionDirection.LEFT
// The window argument (optional) is a Meta.Window that will follow the workspace switch
function ExtSwitchWorkspace(direction, window) {
    if (direction !== Meta.MotionDirection.RIGHT && direction !== Meta.MotionDirection.LEFT)
       return;
    if (window & !(window instanceof Meta.Window))
       window = null;
    let new_workspace = global.screen.get_active_workspace().get_neighbor(direction);
    if (curFlipper && curFlipper.is_animating) {
       curFlipper.queued_action = (direction === Meta.MotionDirection.RIGHT) ? Meta.KeyBindingAction.WORKSPACE_RIGHT : Meta.KeyBindingAction.WORKSPACE_LEFT;
    } else {
       curFlipper = new Flipper(new_workspace, direction, null, window);
    }
}

// Extension Workspace Switching API
// This function can be used by other programs to initiate a workspace change using the Flipper effect
// The workspace argument must be a Meta.Workspace instance
function ExtSwitchToWorkspace(workspace) {
    if (workspace instanceof Meta.Workspace) {
       let [transitions_needed, direction] = getTransitionsAndDirection(workspace);
       if (transitions_needed) {
          if (curFlipper && curFlipper.is_animating) {
             curFlipper.queued_action = Meta.KeyBindingAction.WORKSPACE_1 + workspace.index();
          } else {
             curFlipper = new Flipper(workspace, direction);
          }
       }
    }
}

FlipperSettings.prototype = {
    _init: function(uuid) {
        this.settings = new Settings.ExtensionSettings(this, uuid);
        this.settings.bindProperty(Settings.BindingDirection.IN, "transitionEffect", "transitionEffect", null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "includePanels", "includePanels", null);
    },
};

function toggleMoveToWorkspacePatch() {
   if (original_mw_moveToWorkspace) {
      Main.wm.moveToWorkspace = original_mw_moveToWorkspace;
      original_mw_moveToWorkspace = null;
   } else {
      original_mw_moveToWorkspace = Main.wm.moveToWorkspace;
      Main.wm.moveToWorkspace = moveToWorkspace;
   }
}

function toggleActivateWindowPatch() {
   if (original_main_activateWindow) {
      Main.activateWindow = original_main_activateWindow;
      original_main_activateWindow = null;
   } else {
      original_main_activateWindow = Main.activateWindow;
      Main.activateWindow = activateWindow;
   }
}

function init(metadata) {
    settings = new FlipperSettings(metadata.uuid);
    signalManager = new SignalManager.SignalManager(null);
}

// Automatically update the effect setting page to show the new default effect
// The configuration dialog does not adapt automatically to setting a value so this idea does not work :-(
function transitionEffectChanged() {
   if (settings.transitionEffect !== TransitionEffect.Randomized) {
      settings.settings.setValue( "effect-selector", settings.transitionEffect );
   }
}

function enable() {
    for (let i in bindings) {
        Meta.keybindings_set_custom_handler(bindings[i], onSwitch);
    }
    enabled = true;
    for (let i = 0 ; i <= 12 ; i++) {
       Meta.keybindings_set_custom_handler('switch-to-workspace-' + i, switchToWorkspace );
    }
    signalManager.connect(settings.settings, "changed::patchmoveToWorkspace", toggleMoveToWorkspacePatch);
    signalManager.connect(settings.settings, "changed::patchActivateWindow", toggleActivateWindowPatch);
    //signalManager.connect(settings.settings, "changed::transitionEffect", transitionEffectChanged);
    if (settings.settings.getValue("patchmoveToWorkspace")) {
       // Monkey patch moveToWorkspace()
       original_mw_moveToWorkspace = Main.wm.moveToWorkspace;
       Main.wm.moveToWorkspace = moveToWorkspace;
    }
    if (settings.settings.getValue("patchActivateWindow")) {
       // Monkey patch activateWindow()
       original_main_activateWindow = Main.activateWindow;
       Main.activateWindow = activateWindow;
    }
}

function disable() {
    enabled = false;
    // Reset the keybinding functions to what they were originally
    // I believe the original handlers for the switch-to-workspace-# hotkeys
    // are not implemented in javascript?? So I just leave my handler in
    // place to switch workspaces, it will only use the Flipper Effect when
    // 'enabled' is set to true!
    Meta.keybindings_set_custom_handler('switch-to-workspace-left', Lang.bind(Main.wm, Main.wm._showWorkspaceSwitcher));
    Meta.keybindings_set_custom_handler('switch-to-workspace-right', Lang.bind(Main.wm, Main.wm._showWorkspaceSwitcher));
    Meta.keybindings_set_custom_handler('move-to-workspace-left', Lang.bind(Main.wm, Main.wm._moveWindowToWorkspaceLeft));
    Meta.keybindings_set_custom_handler('move-to-workspace-right', Lang.bind(Main.wm, Main.wm._moveWindowToWorkspaceRight));
    if (original_mw_moveToWorkspace) {
       // Undo the monkey patch of moveToWorkspace()
       Main.wm.moveToWorkspace = original_mw_moveToWorkspace;
    }
    if (original_main_activateWindow) {
       // Undo the monkey patch of activateWindow()
       Main.activateWindow = original_main_activateWindow;
    }
    signalManager.disconnectAllSignals();
}
