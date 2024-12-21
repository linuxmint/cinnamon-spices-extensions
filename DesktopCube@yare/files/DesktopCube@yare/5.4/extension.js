const Lang = imports.lang;
const Mainloop = imports.mainloop;
const GObject = imports.gi.GObject;
const St = imports.gi.St;
const Meta = imports.gi.Meta;
const Clutter = imports.gi.Clutter;
const Cinnamon = imports.gi.Cinnamon;
const Main = imports.ui.main;
const Panel = imports.ui.panel;
const Tweener = imports.ui.tweener;
const Settings = imports.ui.settings;
const Util = imports.misc.util; // Needed for spawnCommandLine()
const SignalManager = imports.misc.signalManager;

const UUID = "DesktopCube@yare";

let enabled;
let settings;
let signalManager;
let bindings = [
    ['switch-to-workspace-left', '_showWorkspaceSwitcher'],
    ['switch-to-workspace-right', '_showWorkspaceSwitcher'],
    ['move-to-workspace-left', '_moveWindowToWorkspaceLeft'],
    ['move-to-workspace-right', '_moveWindowToWorkspaceRight']
];

let original_mw_moveToWorkspace;
let original_main_activateWindow;

let curDesktopCube;

const isFinalized = function(obj) {
    return obj && GObject.Object.prototype.toString.call(obj).indexOf('FINALIZED') > -1;
}

const setPanelsOpacity = function(opacity) {
    let panels = Main.getPanels();
    for (let i = 0; i < panels.length; i++) {
        if (!panels[i]) continue;
        panels[i].actor.opacity = opacity;
    }
};

const Callbacks = {
    on_btn_cs_workspaces_pressed: function() {
        Util.spawnCommandLine('bash -c \'cinnamon-settings workspaces\'');
    }, // End of on_btn_cs_workspaces_pressed

    on_btn_cs_keyboard_pressed: function() {
        Util.spawnCommandLine('bash -c \'cinnamon-settings keyboard -t 1\'');
    }, // End of on_btn_cs_keyboard_pressed

    on_btn_cs_easing_pressed: function() {
        Util.spawnCommandLine('bash -c \'/usr/bin/xdg-open https://easings.net/\'');
    } // End of on_btn_cs_keyboard_pressed
}

function Cube() {
    this._init.apply(this, arguments);
}

Cube.prototype = {
    _init: function(display, window, binding, faces, direction) {
        let binding_type = null;
        this.from = null;
        this.to = null;
        this.isAnimating = false;
        this.destroy_requested = false;
        this.transitions = [];             // An array of Meta.MotionDirection values for each face transiation that is queued up
        this.firstRotate = true;
        settings = new CubeSettings(UUID);
        this.pullaway = (100-settings.pullawayPercent)/100/2;

        if (faces === undefined)
           faces =1;

        // If we have not been given a direction, then we need to determine it by looking at the hotkey binding
        if (direction === undefined) {
           let [newBinding_type, , , newDirection] = binding.get_name().split('-');
           direction = Meta.MotionDirection[newDirection.toUpperCase()];
           binding_type = newBinding_type;
        }
        for( let i = 0 ; i < faces ; i++ ) {
           this.transitions.push(direction);
        }
        this.direction = direction;
        this.last_direction = direction;

        if (direction !== Meta.MotionDirection.RIGHT && direction !== Meta.MotionDirection.LEFT)
            return;

        let active_workspace = global.workspace_manager.get_active_workspace();
        let new_workspace = active_workspace.get_neighbor(direction);

        if (active_workspace.index() === new_workspace.index()) return;

        this.actor = new St.Group({
            reactive: true,
            x: 0,
            y: 0,
            width: global.screen_width,
            height: global.screen_height,
            visible: true
        });

        Main.uiGroup.add_child(this.actor);

        this.actor.connect('key-release-event', Lang.bind(this, this._keyReleaseEvent));
        this.actor.connect('key-press-event', Lang.bind(this, this._keyPressEvent));

        this.initBackground();
        this.dimBackground();

        Main.pushModal(this.actor);

        if (binding) {
           let mask = binding.get_mask();
           this._modifierMask = imports.ui.appSwitcher.appSwitcher.primaryModifier(mask);
        }
        global.window_group.hide();

        setPanelsOpacity(0);

        if (binding_type === 'move' && window.get_window_type() !== Meta.WindowType.DESKTOP) {
            this.moveWindow(window, direction);
        }
        if (binding_type === null && window) {
           // We are switching workspaces to activate a window on a workspace other than the current one
           // We need to keep track of the target window so that it can be activated when the animation is done
           this.activateWindow = window;
        }
        this.current_face_index = global.workspace_manager.get_active_workspace_index();
        this.startAnimate();
        this.actor.show();
    },

    removeWindowActor: function(workspace_clone, window, index) {
        if (workspace_clone && (workspace_clone.index === index)) {
            let i = workspace_clone.workspaceWindows.indexOf(window);
            if (i === -1) return false;
            let j;
            let done = false;
            for (j = 0; j < workspace_clone.workspaceWindows.length && !done; j++) {
                if (window.get_stable_sequence() === workspace_clone.workspaceWindowActors[j].i) {
                    done = true;
                }
            }
            workspace_clone.remove_child(workspace_clone.workspaceWindowActors[j - 1]);
            workspace_clone.workspaceWindows.splice(i, 1);
            workspace_clone.workspaceWindowActors.splice(j - 1, 1)[0].destroy();
            return true;
        }
        return false;
    },

    addWindowActor: function(workspace_clone, window, index) {
        if (workspace_clone && (workspace_clone.index === index)) {
            let windowClone = this.cloneMetaWindow(window);
            workspace_clone.add_child(windowClone);
            workspace_clone.workspaceWindowActors.push(windowClone);
            workspace_clone.workspaceWindows.push(window);
            workspace_clone.workspaceWindows.sort(Lang.bind(this, this._sortWindow));
            return true;
        }
        return false;
    },

    sortWindowClones: function (workspace_clone) {
        workspace_clone.workspaceWindowActors.sort((actor1, actor2) => {
            if (this._sortWindow(actor1.win, actor1.win) > 0) {
                actor1.get_parent().set_child_above_sibling(actor1, actor2)
            } else {
                actor2.get_parent().set_child_above_sibling(actor2, actor1)
            }
            return 0;
        });
        if (workspace_clone.chromeGroup) {
           workspace_clone.chromeGroup.get_parent().set_child_above_sibling(workspace_clone.chromeGroup, null);
        }
    },

    moveWindowClone: function(window, active_index, new_index) {
        if (this.removeWindowActor(this.from, window, new_index)) {
            this.addWindowActor(this.to, window, active_index);
        }
        if (this.removeWindowActor(this.from, window, active_index)) {
            this.addWindowActor(this.to, window, new_index);
        }
        if (this.removeWindowActor(this.to, window, active_index)) {
            this.addWindowActor(this.from, window, new_index);
        }
        if (this.removeWindowActor(this.to, window, new_index)) {
            this.addWindowActor(this.from, window, active_index);
        }
    },

    moveWindow: function(window, direction) {
        if (!window || window.is_on_all_workspaces() === true || window.get_window_type() === Meta.WindowType.DESKTOP) {
            return false;
        }

        let active_workspace = global.workspace_manager.get_active_workspace();
        let new_workspace = active_workspace.get_neighbor(direction);

        let active_index = active_workspace.index();
        let new_index = new_workspace.index();

        window.change_workspace(new_workspace);
        Mainloop.idle_add(() => {
            // Unless this is done a bit later,
            // window is sometimes not activated
            if (window.get_workspace() === global.workspace_manager.get_active_workspace()) {
                //window.activate(global.get_current_time());
                Main.activateWindow(window);
            }
        });

        this.moveWindowClone(window, active_index, new_index);
        return true;
    },

    getWorkspaceCloneScaled: function(workspaceIndex, direction) {
        let clone = this.getWorkspaceClone(workspaceIndex);
        clone.set_scale(1 - 2 * (this.pullaway), 1 - 2 * (this.pullaway));
        clone.x = global.stage.width / 2;
        return clone;
    },

    getWorkspaceClone: function(workspaceIndex) {
        let clone = new St.Group({clip_to_allocation: true});
        clone.set_size(global.stage.width, global.stage.height);

        let background = new St.Group();
        background.add_child(Meta.BackgroundActor.new_for_screen(global.screen));
        clone.add_child(background);

        let deskletClone = new Clutter.Clone({source : Main.deskletContainer.actor});
        clone.add_child(deskletClone);

        clone.desktopClones = [];

        let windowActors = global.get_window_actors();
        for (let i = 0; i < windowActors.length; i++) {
            let w = windowActors[i];
            let metaWindow = w.get_meta_window();
            if (metaWindow.get_window_type() === Meta.WindowType.DESKTOP) {
                let compositor = metaWindow.get_compositor_private();
                let rect = metaWindow.get_buffer_rect();
                let windowClone = new Clutter.Clone({
                    source: compositor,
                    reactive: true,
                    x: rect.x,
                    y: rect.y,
                });

                clone.add_child(windowClone);
                windowClone.get_parent().set_child_below_sibling(windowClone, deskletClone);
                clone.desktopClones.push(windowClone);
            }
        }

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
           let panels = Main.getPanels().concat(Main.uiGroup.get_children());
           for (let i = 0; i < panels.length; i++) {
               if (!panels[i]) continue;
               let panel = panels[i];
               // Is it a non-autohideable panel, or is it a visible, tracked
               // chrome object?
               if ((panel.actor && !panel._hideable)
                   || (panel && Main.layoutManager.isTrackingChrome(panel) && panel.visible)) {
                   let chromeClone = new Clutter.Clone({
                       source: panel.actor ? panel.actor : panel,
                       x : panel.actor ? panel.actor.x : panel.x,
                       y: panel.actor ? panel.panelPosition === Panel.PanelLoc.bottom ?
                           Main.layoutManager.primaryMonitor.y
                               + Main.layoutManager.primaryMonitor.height
                               - panel.actor.height
                           : Main.layoutManager.primaryMonitor.y
                           : panel.y
                   });
                   chromeGroup.add_child(chromeClone);
                   chromeClone.get_parent().set_child_above_sibling(chromeClone, null);
               }
           }

           clone.add_child(chromeGroup);
           chromeGroup.get_parent().set_child_above_sibling(chromeGroup, null);
           clone.chromeGroup = chromeGroup;
        }
        clone.index = workspaceIndex;
        return clone;
    },

    cloneMetaWindow: function(metaWindow) {
        let compositor = metaWindow.get_compositor_private();
        let rect = metaWindow.get_buffer_rect();
        let windowClone = new Clutter.Clone({
            source: compositor,
            reactive: true,
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
            if (meta_window.get_workspace().index() === workspaceIndex
                && !meta_window.minimized
                && meta_window.get_window_type() !== Meta.WindowType.DESKTOP) {
                workspaceWindows.push(meta_window);
            }
        }

        workspaceWindows.sort(Lang.bind(this, this._sortWindow));
        return workspaceWindows;
    },

    _sortWindow : function(window1, window2) {
        let t1 = window1.get_user_time();
        let t2 = window2.get_user_time();
        if (t2 < t1) return 1;
        else return -1;
    },

    // I hide the desktop icons for now while rotating until a solution to
    // the artifacts may be found.
    /*setDesktopClonesVisible: function(workspace_clone, visible) {
        let desktopClones = workspace_clone.desktopClones;
        for (let i = 0; i < desktopClones.length; i++) {
            let clone = desktopClones[i];
            if (visible) {
                Tweener.addTween(clone, {
                    opacity: 255,
                    transition: settings.getUnrotateEffect(),
                    time: settings.animationTime * 0.3333,
                });
            } else {
                Tweener.addTween(clone, {
                    opacity: 0,
                    transition: settings.getRotateEffect(),
                    time: settings.animationTime * 0.3333,
                });
            }
        }
    },*/

    startAnimate: function(window) {
        let active_workspace;
        let new_workspace;

        // Get the current cube face and the face we are transitioning to
        let nWorkspaces = global.workspace_manager.get_n_workspaces();
        let direction = this.transitions.shift();
        active_workspace = global.workspace_manager.get_workspace_by_index( this.current_face_index );
        new_workspace = active_workspace.get_neighbor(direction);
        this.current_face_index = new_workspace.index();

        let from_workspace;
        let to_workspace;
        this.needScale = true;

        if (this.to != null) {
            from_workspace = this.to;
            this.needScale = false;
            if (active_workspace.index() === new_workspace.index()) {
                //this.bounce(from_workspace, direction);
                this.isAnimating = true;
                this.from.hide();

                this.unsetIsAnimating();
                return;
            }
        } else {
            from_workspace = this.getWorkspaceClone(active_workspace.index());
            this.actor.add_child(from_workspace);
        }

        // Allow Cinnamon to play the switcher sound if it's enabled.
        Main.soundManager.play('switch');

        // This is a workaround for poor animation, we enable it only during the animation
        // sequence so users don't need to set it using export CLUTTER_PAINT...
        Meta.add_clutter_debug_flags( 0, 1 << 6, 0 ); // CLUTTER_DEBUG_CONTINUOUS_REDRAW

        if (direction === this.last_direction) {
            if (this.from != null) {
                to_workspace = this.getWorkspaceCloneScaled(new_workspace.index(), direction);
                this.actor.remove_child(this.from);
                this.from.destroy();
            } else {
                to_workspace = this.getWorkspaceClone(new_workspace.index());
            }
            this.actor.add_child(to_workspace);
        } else {
            to_workspace = this.from;
        }

        this.from = from_workspace;
        this.to = to_workspace;
        this.last_direction = direction;

        if (this.transitions.length === 0) {
           new_workspace.activate(global.get_current_time());
        }
        this.sortWindowClones(this.from);
        this.sortWindowClones(this.to);
        this.prepare(from_workspace, to_workspace, direction, this.needScale);
    },

    prepare: function(from, to, direction, needScale) {
        from.show();
        to.show();

        if (direction === Meta.MotionDirection.LEFT) {
            let x_pos = 0;
            if (!needScale) x_pos = global.stage.width * (this.pullaway);
            from.move_anchor_point_from_gravity(Clutter.Gravity.WEST);
            from.set_position(x_pos, global.stage.height / 2);

            to.move_anchor_point_from_gravity(Clutter.Gravity.EAST);
            to.set_position(global.stage.width * (this.pullaway), global.stage.height / 2);
            to.rotation_angle_y = -90;
        } else {
            let x_pos = global.stage.width;
            if (!needScale) x_pos = x_pos * (1 - (this.pullaway));
            from.move_anchor_point_from_gravity(Clutter.Gravity.EAST);
            from.set_position(x_pos, global.stage.height / 2);

            to.move_anchor_point_from_gravity(Clutter.Gravity.WEST);
            to.set_position(global.stage.width * (1 - (this.pullaway)), global.stage.height / 2);
            to.rotation_angle_y = 90;
        }

        to.set_scale(1 - 2 * (this.pullaway), 1 - 2 * (this.pullaway));
        from.get_parent().set_child_above_sibling(from, null);
        if (needScale)
           this.scale(from, to, direction);
        else
           this.rotate_mid(from, to, direction);
    },

    scale: function(from, to, direction) {
        this.isAnimating = true;

        let x_pos;
        if (direction === Meta.MotionDirection.LEFT) {
            x_pos = global.stage.width * (this.pullaway);
        } else {
            x_pos = global.stage.width * (1 - (this.pullaway));
        }

        //if (settings.pullaway > 0.2) {
        //    this.setDesktopClonesVisible(from, false);
        //    this.setDesktopClonesVisible(to, false);
        //}
        Tweener.addTween(from, {
            scale_x: 1 - 2 * (this.pullaway),
            scale_y: 1 - 2 * (this.pullaway),
            x: x_pos,
            transition: settings.getScaleEffect(),
            time: settings.animationTimeSec * 0.25,
            //onCompleteParams: [from, to, direction],
            //onComplete: this.rotate_mid,
            onCompleteScope: this,
        });
        this.rotate_mid(from, to, direction);
    },

    rotate_mid: function(from, to, direction) {
        this.isAnimating = true;
        //this.setDesktopClonesVisible(from, false);
        //this.setDesktopClonesVisible(to, false);
      from.show();
      to.show();

        let angle_from;
        let angle_to;
        if (direction === Meta.MotionDirection.LEFT) {
            angle_from = 45;
            angle_to = -45;
        } else {
            angle_from = -45;
            angle_to = 45;
        }

        Tweener.addTween(from, {
            x: global.stage.width / 2,
            rotation_angle_y: angle_from,
            transition: (!this.firstRotate || (this.needScale && settings.pullawayPercent!=100))?settings.getRotateEffect():settings.getRotateEffectStart(),
            time: settings.animationTimeSec * 0.25,
        });

        Tweener.addTween(to, {
            x: global.stage.width / 2,
            rotation_angle_y: angle_to,
            transition: (!this.firstRotate || (this.needScale && settings.pullawayPercent!=100))?settings.getRotateEffect():settings.getRotateEffectStart(),
            time: settings.animationTimeSec * 0.25,
            onCompleteParams: [from, to, direction],
            onComplete: this.rotate_end,
            onCompleteScope: this,
        });
    },

    rotate_end: function(from, to, direction) {
        to.get_parent().set_child_above_sibling(to, null);
      from.show();
      to.show();

        let x_pos;
        let angle_from;
        if (direction === Meta.MotionDirection.LEFT) {
            x_pos = global.stage.width * (1 - (this.pullaway));
            angle_from = 90;
        } else {
            x_pos = global.stage.width * (this.pullaway);
            angle_from = -90;
        }

        Tweener.addTween(from, {
            x: x_pos,
            rotation_angle_y: angle_from,
            transition: (this.transitions.length===0 && this._modifierMask)?settings.getUnrotateEffectEnd():settings.getUnrotateEffect(),
            time: settings.animationTimeSec * 0.25,
        });

        Tweener.addTween(to, {
            x: x_pos,
            rotation_angle_y: 0,
            transition: (this.transitions.length===0 && this._modifierMask)?settings.getUnrotateEffectEnd():settings.getUnrotateEffect(),
            time: settings.animationTimeSec * 0.25,
            onComplete: this.unsetIsAnimating,
            onCompleteScope: this,
        });
    },

    unscale: function(from, to, direction) {
        from.hide();

        let x_pos;
        if (direction === Meta.MotionDirection.LEFT) {
            to.move_anchor_point_from_gravity(Clutter.Gravity.EAST);
            to.set_position(global.stage.width * (1 - (this.pullaway)), global.stage.height / 2);
            x_pos = global.stage.width;
        } else {
            to.move_anchor_point_from_gravity(Clutter.Gravity.WEST);
            to.set_position(global.stage.width * (this.pullaway), global.stage.height / 2);
            x_pos = 0;
        }

        //if (settings.pullaway > 0.2) {
        //    this.setDesktopClonesVisible(from, true);
        //    this.setDesktopClonesVisible(to, true);
        //}
        Tweener.addTween(to, {
            scale_x: 1.0,
            scale_y: 1.0,
            x: x_pos,
            transition: settings.getUnscaleEffect(),
            time: settings.animationTimeSec * 0.25,
            onComplete: this.destroy,
            onCompleteScope: this,
        });
    },

    /*bounce: function(workspace, direction) {
        this.isAnimating = true;
        this.from.hide();

        workspace.move_anchor_point_from_gravity(Clutter.Gravity.CENTER);
        workspace.x = global.stage.width / 2;

        let angle;
        if (direction == Meta.MotionDirection.LEFT)
            angle = 3;
        else
            angle = -3;

        Tweener.addTween(workspace, {
            rotation_angle_y: angle,
            transition: 'easeInQuad',
            time: settings.animationTime * 0.75,
            onComplete: this.bounceBack,
            onCompleteScope: this,
            onCompleteParams: [workspace, direction],
        });
    },

    bounceBack: function(workspace, direction) {
        Tweener.addTween(workspace, {
            rotation_angle_y: 0,
            transition: 'easeOutQuad',
            time: settings.animationTime * 0.75,
            onComplete: this.unsetIsAnimating,
            onCompleteScope: this,
        });
    },*/

    unsetIsAnimating: function() {
        //if (settings.pullaway <= 0.2) {
        //    this.setDesktopClonesVisible(this.from, true);
        //    this.setDesktopClonesVisible(this.to, true);
        //}
        this.isAnimating = false;
        if (this.transitions.length == 0) {
           if (this.destroy_requested) this.onDestroy();
           Meta.remove_clutter_debug_flags( 0, 1 << 6, 0 ); // CLUTTER_DEBUG_CONTINUOUS_REDRAW
           Main.wm.showWorkspaceOSD();
           if (this._modifierMask === undefined) {
               if (this.isAnimating) {
                   this.destroy_requested = true;
               } else {
                   this.onDestroy();
               }
           }
        } else {
           this.firstRotate = false;
           this.startAnimate(null);
           return;
        }
        this.original_ws_index = global.workspace_manager.get_active_workspace_index();
    },

    _keyPressEvent: function(actor, event) {
        let workspace;
        let windows;
        let window;
        let event_state = Cinnamon.get_event_state(event);
        let action = global.display.get_keybinding_action(event.get_key_code(), event_state);
        let new_workspace;
        switch (action) {
        case Meta.KeyBindingAction.MOVE_TO_WORKSPACE_LEFT:
             this.direction = Meta.MotionDirection.LEFT;
             this.transitions.push(Meta.MotionDirection.LEFT);
             workspace = global.workspace_manager.get_active_workspace().index();
             windows = this.getWorkspaceWindows(workspace);
             window = windows[windows.length - 1];
             this.moveWindow(window, this.direction);
             this.startAnimate(window);
             return true;

        case Meta.KeyBindingAction.MOVE_TO_WORKSPACE_RIGHT:
             this.direction = Meta.MotionDirection.RIGHT;
             this.transitions.push(Meta.MotionDirection.RIGHT);
             workspace = global.workspace_manager.get_active_workspace().index();
             windows = this.getWorkspaceWindows(workspace);
             window = windows[windows.length - 1];
             this.moveWindow(window, this.direction);
             this.startAnimate(window);
             return true;

        case Meta.KeyBindingAction.WORKSPACE_LEFT:
            if (this.isAnimating) {
               this.transitions.push(Meta.MotionDirection.LEFT);
            } else {
               this.transitions.push(Meta.MotionDirection.LEFT);
               this.startAnimate();
            }
            return true;

        case Meta.KeyBindingAction.WORKSPACE_RIGHT:
            if (this.isAnimating) {
               this.transitions.push(Meta.MotionDirection.RIGHT);
            } else {
               this.transitions.push(Meta.MotionDirection.RIGHT);
               this.startAnimate();
            }
            return true;

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

        return true;
    },

    // Change the workspace to parm ws_cur
    _keyActionWorkspace: function(ws_idx) {
        let newWS = global.workspace_manager.get_workspace_by_index(ws_idx);
        if (!newWS) return;
        if (this.isAnimating) {
            let [transitions_needed, direction] = getTransitionsAndDirection(newWS, this.current_face_index, this.transitions);
                for (let i=0 ; i<transitions_needed ; i++) {
                    this.transitions.push(direction);
                }
        } else {
            let [transitions_needed, direction] = getTransitionsAndDirection(newWS);
            if (transitions_needed) {
                for (let i=0 ; i<transitions_needed ; i++) {
                    this.transitions.push(direction);
                }
                this.startAnimate();
            }
        }
    },

    _keyReleaseEvent: function() {
        let [x, y, mods] = global.get_pointer();
        let state = mods & this._modifierMask;

        if (state === 0) {
            if (this.isAnimating) {
                this.destroy_requested = true;
                this._modifierMask = undefined;
            } else {
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
        background.set_opacity(10);
    },

    /*undimBackground: function() {
        let background = this._backgroundGroup.get_children()[0];
        Tweener.addTween(background, {
            dim_factor: 1.0,
            time: settings.animationTime,
            transition: 'easeOutQuad',
        });
    },*/

    onDestroy: function() {
        if (isFinalized(this.from) || isFinalized(this.to)) return;
        //if (this._modifierMask)
           this.unscale(this.from, this.to, this.direction);
    },

    destroy: function() {
        this._backgroundGroup.remove_child(this.metaBackgroundActor);
        Main.uiGroup.remove_child(this._backgroundGroup);
        Main.uiGroup.remove_child(this.actor);

        setPanelsOpacity(255);
        global.window_group.show();

        if (!isFinalized(this.actor)) this.actor.destroy();
        if (!isFinalized(this.metaBackgroundActor)) this.metaBackgroundActor.destroy();
        if (!isFinalized(this._backgroundGroup)) this._backgroundGroup.destroy();
        if (this.activateWindow) {
           Main.activateWindow(this.activateWindow);
        }
    }
};

function getTransitionsAndDirection(workspace, cur_ws_idx, pending_transitions) {
    let direction;
    // Determine the current workspace index, taking into account any past/pending cube transitions
    let curWS = (cur_ws_idx)?cur_ws_idx:global.workspace_manager.get_active_workspace_index();
    if (pending_transitions && pending_transitions.length > 0) {
       let nWorkspaces = global.workspace_manager.get_n_workspaces();
       for (let i=0 ; i < pending_transitions.length ; i++) {
          if (pending_transitions[i] === Meta.MotionDirection.LEFT)
             curWS--;
          else
             curWS++;
       }
       if (curWS > 0){
          curWS = nWorkspaces + curWS;
       } else if (curWS >= nWorkspaces) {
          curWS = curWS - nWorkspaces;
       }
    }
    // Handle the case were no transitions are needed
    let newWS = workspace.index();
    if (curWS === newWS) {
       return([0,0]);
    }
    // Calculate the number and direction of the transitions needed
    let transitions_needed = Math.abs(curWS-newWS);
    let nWorkspaces = global.workspace_manager.get_n_workspaces();
    if (curWS > newWS) {
       if (transitions_needed > nWorkspaces/2) {
          direction = Meta.MotionDirection.RIGHT;
          transitions_needed = nWorkspaces - transitions_needed;
       } else  {
          direction = Meta.MotionDirection.LEFT;
       }
    } else {
       if (transitions_needed > nWorkspaces/2) {
          direction = Meta.MotionDirection.LEFT;
          transitions_needed = nWorkspaces - transitions_needed;
       } else  {
          direction = Meta.MotionDirection.RIGHT;
       }
    }
    return([transitions_needed, direction]);
}

// Our handler for the left/right hotkeys
function onSwitch(display, window, binding) {
    new Cube(display, window, binding);
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
      if (transitions_needed)
         new Cube(null, null, binding, transitions_needed, direction);
   }
}

// Our version of moveToWorkspace() which will be Monkey Patched over the Cinnamon version
// This is how we handle the workspace switching initiated by the "Workspace Switcher" applet
function moveToWorkspace(workspace, direction_hint) {
    if (Main.expo._shown) {
       original_mw_moveToWorkspace(workspace, direction_hint);
    } else {
        let [transitions_needed, direction] = getTransitionsAndDirection(workspace);
        if (transitions_needed)
            new Cube(null, null, null, transitions_needed, direction);
    }
}

// Our version of activateWindow which will be Monkey Patched over the cinnamon version
// Here we will check if target window is on a different workspace and use the Cube if needed
function activateWindow(window, time, workspaceNum) {
   let activeWorkspaceNum = global.workspace_manager.get_active_workspace_index();
   if (workspaceNum === undefined) {
      let windowsWS = window.get_workspace();
      workspaceNum = windowsWS.index();
   }

   if (!Main.expo._shown && activeWorkspaceNum !== workspaceNum) {
      let newWS = global.workspace_manager.get_workspace_by_index(workspaceNum);
      let [transitions_needed, direction] = getTransitionsAndDirection(newWS);
      new Cube(null, window, null, transitions_needed, direction);
   } else {
      original_main_activateWindow(window, time, workspaceNum);
   }
}
// Extension Workspace Switching API
// This function can be used by other programs to initiate a workspace change using the Cube effect
// The direction argument must be Meta.MotionDirection.RIGHT or Meta.MotionDirection.LEFT
// The window argument (optional) is a Meta.Window that will follow the workspace switch
function ExtSwitchWorkspace(direction, window) {
    if (direction !== Meta.MotionDirection.RIGHT && direction !== Meta.MotionDirection.LEFT)
       return;
    if (window & !(window instanceof Meta.Window))
       window = null;
    let new_workspace = global.screen.get_active_workspace().get_neighbor(direction);
    if (curDesktopCube && curDesktopCube.is_animating) {
       curDesktopCube.transitions.push(direction);
    } else {
       curDesktopCube = new Cube(null, null, null, 1, direction);
       if (window)
          curDesktopCube.moveWindow(window, direction);
    }
}

// Extension Workspace Switching API
// This function can be used by other programs to initiate a workspace change using the Cube effect
// The workspace argument must be a Meta.Workspace instance
function ExtSwitchToWorkspace(workspace) {
    if (workspace instanceof Meta.Workspace) {
       let [transitions_needed, direction] = getTransitionsAndDirection(workspace);
       if (transitions_needed) {
          if (curDesktopCube && curDesktopCube.is_animating) {
             for (let i=0 ; i<transitions_needed ; i++) {
                curDesktopCube.transitions.push(direction);
             }
          } else {
             curDesktopCube = new Cube(null, null, null, transitions_needed, direction);
          }
       }
    }
}

function CubeSettings(uuid) {
    this._init(uuid);
}

CubeSettings.prototype = {
    _init: function(uuid) {
        this.settings = new Settings.ExtensionSettings(this, uuid);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'animationTimeSec', 'animationTimeSec', null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'pullawayPercent', 'pullawayPercent', null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'newScaleEffect', 'newScaleEffect', null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'newRotateEffect', 'newRotateEffect', null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'includePanels', 'includePanels', null);
    },

    getScaleEffect: function() {
       return "easeNone"; //"easeIn" + settings.newScaleEffect;
    },

    getUnscaleEffect: function() {
       return "easeOut" + settings.newScaleEffect;
    },

    getRotateEffectStart: function() {
       return "easeIn" + settings.newRotateEffect;
    },

    getRotateEffect: function() {
       return "easeInExpo"; //"easeIn" + settings.newRotateEffect;
    },

    getUnrotateEffect: function() {
       return "easeOutExpo"; //"easeOut" + settings.newRotateEffect;
    },

    getUnrotateEffectEnd: function() {
       return "easeOut" + settings.newRotateEffect;
    }
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
    settings = new CubeSettings(metadata.uuid);
    signalManager = new SignalManager.SignalManager(null);
}

function enable() {
    // Override the keybindings functions
    for (let i = 0; i < bindings.length; i++) {
        Meta.keybindings_set_custom_handler(bindings[i][0], onSwitch);
    }
    enabled = true;
    for (let i = 0 ; i <= 12 ; i++) {
       Meta.keybindings_set_custom_handler('switch-to-workspace-' + i, switchToWorkspace );
    }
    signalManager.connect(settings.settings, "changed::patchmoveToWorkspace", toggleMoveToWorkspacePatch);
    signalManager.connect(settings.settings, "changed::patchActivateWindow", toggleActivateWindowPatch);
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
    return Callbacks
}

function disable() {
    enabled = false;
    // Reset the keybinding functions to what they were originally
    // I believe the original handlers for the switch-to-workspace-# hotkeys
    // are not implemented in javascript?? So I just leave my handler in
    // place to switch workspaces, it will only use the Cube Effect when
    // 'enabled' is set to true!
    for (let i = 0; i < bindings.length; i++) {
        Meta.keybindings_set_custom_handler(
            bindings[i][0],
            Lang.bind(
                Main.wm,
                Main.wm[bindings[i][1]]
            )
        );
    }
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
