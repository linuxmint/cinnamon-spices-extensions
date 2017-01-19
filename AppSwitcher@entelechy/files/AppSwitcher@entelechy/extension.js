/* Cinnamon extension to switch between running apps by <Super>Tab
 * The idea is similar to the default Alt-Tab in Gnome 3 or OS X.
 * Choose a specific window of an app with <Super>` in 3D mode. A superscript
 * appears on an app icon if that app has more than one window open.
 *
 * Copyright 2012 Entelechy, GPLv2
 * With code derived from the default Cinnamon AltTab.
 * Code for the icon superscripts taken from WindowListGroup by jake-phy.
 */

//Imports
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const AltTab = imports.ui.appSwitcher.classicSwitcher;
const Timeline = imports.ui.appSwitcher.timelineSwitcher;
const Coverflow = imports.ui.appSwitcher.coverflowSwitcher;
const Tweener = imports.ui.tweener;
const Cinnamon = imports.gi.Cinnamon;
const PopupMenu = imports.ui.popupMenu;
const Signals = imports.signals;
const Pango = imports.gi.Pango;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gdk = imports.gi.Gdk;
const Gtk = imports.gi.Gtk;
const Gettext = imports.gettext;
const Settings = imports.ui.settings;
const UUID = "AppSwitcher@entelechy";

var switcher_3d_style = "timeline";

//Constants
const APPBOX_ICON_SIZE = 32;
const SWITCHERBOX_SCROLL_TIME = 0.1;//seconds
const SWITCHERBOX_DELAY_TIMEOUT = 150;//milliseconds
const SWITCHERBOX_FADE_TIME = 0.1;//seconds

const DISABLE_HOVER_TIMEOUT = 500;//milliseconds

const BUTTON_BOX_ANIMATION_TIME = 0.5;
const ICON_PADDING_TOP = 0;

/* 
 * ENUMS FOR WINDOW PREVIEW STYLE
 */
const PREVIEW_STYLE_CLASSIC = 0;
const PREVIEW_STYLE_COVERFLOW = 1;
/* -------------------------------------------------------- */

let appSys, switcherBox;
let metaDisplay;

function mod (a, b) {
  return (a + b) % b;
}

function primaryModifier (mask) {
  if (mask == 0)
    return 0;

  let primary = 1;
  while (mask > 1) {
    mask >>= 1;
    primary <<= 1;
  }
  return primary;
}

// Returns [x1,x2] so that the area between x1 and x2 is
// centered in length
function center (length, naturalLength) {
  let maxLength = Math.min (length, naturalLength);
  let x1 = Math.max (0, Math.floor ((length - maxLength) / 2));
  let x2 = Math.min (length, x1 + maxLength);
  return [x1, x2];
}

Gettext.bindtextdomain (UUID, GLib.get_home_dir () + "/.local/share/locale");

function _(str) {
  return Gettext.dgettext (UUID, str);
}

let appSwitcherSettings;
appSwitcherSettings = new Gio.Settings ( {schema_id: "org.cinnamon.muffin.keybindings"} );

function AppSwitcher3D () {
  this._init.apply (this, arguments);
}

AppSwitcher3D.prototype = {
  __proto__: imports.ui.appSwitcher.appSwitcher3D.AppSwitcher3D,

  _keyPressEvent : function (actor, event) {
    imports.ui.appSwitcher.appSwitcher3D.AppSwitcher3D.prototype._keyPressEvent.call (this, actor, event);
    let event_state = Cinnamon.get_event_state (event);     
    let action = global.display.get_keybinding_action (event.get_key_code (), event_state);

    if (event.get_key_symbol () == Clutter.a || event.get_key_symbol () == Clutter.A)
    {
      this._activateSelectedApp ();
      return true;
    }

    switch (action)
    {
      case Meta.KeyBindingAction.CYCLE_GROUP:
      case Meta.KeyBindingAction.CYCLE_WINDOWS:
      case Meta.KeyBindingAction.CYCLE_PANELS:
        if (this._checkSwitchTime ())
        {
        // shift -> backwards
          if(event_state & Clutter.ModifierType.SHIFT_MASK)
            this._previous ();
          else
            this._next ();
        }
      return true;
      case Meta.KeyBindingAction.CYCLE_GROUP_BACKWARD:
      case Meta.KeyBindingAction.CYCLE_WINDOWS_BACKWARD:
      case Meta.KeyBindingAction.CYCLE_PANELS_BACKWARD:
        if (this._checkSwitchTime ())
          this._previous ();
        return true;
    }
    return true;
  }
};

function TimelineSwitcher () {
  this._init.apply (this, arguments);
}

TimelineSwitcher.prototype = {
  __proto__: Timeline.TimelineSwitcher.prototype,

  _init : function (binding, app, _parent, _windows) {
    Timeline.TimelineSwitcher.prototype._init.apply (this, arguments);
    if (app) this._parentApp = app;
    else this._windows = _windows;
    this._parent = _parent;
    this._onWorkspaceSelected ();
  },

  _onWorkspaceSelected: function () {
    if (this._parentApp)
      this._windows = this._parentApp.get_windows ().filter (
        function (win) {
          return !win.is_skip_taskbar ();
        });
    this._createList ();
    this._hidePreviews (0);
    this._select (0);
    let windows = global.get_window_actors ();
    windows[0].show ();
  },

  _keyPressEvent : function (actor, event) {
    AppSwitcher3D.prototype._keyPressEvent.call (this, actor, event);
  },

  _show : function () {
    if (this._parent) this._parent.actor.hide ();
    Timeline.TimelineSwitcher.prototype._show.call (this);
  },

  _hide : function () {
    Timeline.TimelineSwitcher.prototype._hide.call (this);
    if (this._parent) this._parent.actor.show ();
  },

  _activateSelected : function () {
    if (this._parent) this._parent.destroy ();
    Timeline.TimelineSwitcher.prototype._activateSelected.call (this);
  },

  _activateSelectedApp : function () {
    if (this._parent) this._parent.destroy ();
    let app = this._parentApp;
    let win = this._windows[this._currentIndex];
    if (app == null)
    {
      app = Cinnamon.WindowTracker.get_default ().get_window_app (win);
    }
    app.activate_window (win, global.get_current_time ());
    this.destroy ();
  }
};

function CoverflowSwitcher () {
  this._init.apply (this, arguments);
}

CoverflowSwitcher.prototype = {
  __proto__: Coverflow.CoverflowSwitcher.prototype,

  _init : function (binding, app, _parent, _windows) {
    Coverflow.CoverflowSwitcher.prototype._init.apply (this, arguments);
    if (app) this._parentApp = app;
    else this._windows = _windows;
    this._parent = _parent;
    this._onWorkspaceSelected ();
  },

  _onWorkspaceSelected: function () {
    if (this._parentApp)
      this._windows = this._parentApp.get_windows ().filter (
        function (win) {
          return !win.is_skip_taskbar ();
        });
    this._createList ();
    this._hidePreviews (0);
    this._select (0);
    let windows = global.get_window_actors ();
    windows[0].show ();
  },

  _keyPressEvent : function (actor, event) {
    AppSwitcher3D.prototype._keyPressEvent.call (this, actor, event);
  },

  _show : function () {
    if (this._parent) this._parent.actor.hide ();
    Coverflow.CoverflowSwitcher.prototype._show.call (this);
  },

  _hide : function () {
    Coverflow.CoverflowSwitcher.prototype._hide.call (this);
    if (this._parent) this._parent.actor.show ();
  },

  _activateSelected : function () {
    if (this._parent) this._parent.destroy ();
    Coverflow.CoverflowSwitcher.prototype._activateSelected.call (this);
  },

  _activateSelectedApp : function () {
    if (this._parent) this._parent.destroy ();
    let app = this._parentApp;
    let win = this._windows[this._currentIndex];
    if (app == null)
    {
      app = Cinnamon.WindowTracker.get_default ().get_window_app (win);
    }
    app.activate_window (win, global.get_current_time ());
    this.destroy ();
  }
};

//Creates a button with an icon and a label.
//The label text must be set with setText
//The numLabel text is to be set with setWindowNum
//@icon: the icon to be displayed
function IconLabelButton () {
  this._init.apply (this, arguments);
}

IconLabelButton.prototype = {

  _init : function (icon) {
    if (icon == null)
      throw 'IconLabelButton icon argument must be non-null';

    this.actor = new St.Bin ( {
      reactive: true,
      can_focus: true,
      x_fill: true,
      y_fill: false,
      track_hover: true
    });

    this.actor._delegate = this;

    //We do a fancy layout with icons and labels, so we'd like to do our own allocation
    //in a Cinnamon.GenericContainer
    this._container = new Cinnamon.GenericContainer ( {
      name: 'iconLabelButton'
    });
    this._container.connect ('get-preferred-width', Lang.bind (this, this._getPreferredWidth));
    this._container.connect ('get-preferred-height', Lang.bind (this, this._getPreferredHeight));
    this._container.connect ('allocate', Lang.bind (this, this._allocate));
    this.actor.set_child (this._container);

    this._iconBox = new Cinnamon.Slicer ( {
        name: 'appBoxIcon'
    });
    this._iconBox.connect ('style-changed', Lang.bind (this, this._onIconBoxStyleChanged));
    this._iconBox.connect ('notify::allocation', Lang.bind (this, this._updateIconBoxClip));
    this._iconBox.set_child (icon);
    this._container.add_actor (this._iconBox);
    this._label = new St.Label ();
    this._container.add_actor (this._label);
    this._numLabel = new St.Label ( {
      style_class: 'window-list-item-label',
      style: 'text-shadow: black 1px 1px 2px;'
    });
    this._container.add_actor (this._numLabel);
    this._iconBottomClip = 0;
  },

  setText : function (text) {
    this._label.set_text (text);
  },

  //assume for now already formatted as text
  setWindowNum : function (text) {
    this._numLabel.set_text (text);
    this._container.queue_relayout ();
  },

  //------------------------------------------
  //-- Callbacks for display-related things --
  //------------------------------------------
  _onIconBoxStyleChanged : function () {
    let node = this._iconBox.get_theme_node ();
    this._iconBottomClip = node.get_length ('app-icon-bottom-clip');
    this._updateIconBoxClip ();
  },

  _updateIconBoxClip : function () {
    let allocation = this._iconBox.allocation;
    if (this._iconBottomClip > 0)
      this._iconBox.set_clip (0, 0, allocation.x2 - allocation.x1, allocation.y2 - allocation.y1 - this._iconBottomClip);
    else
      this._iconBox.remove_clip ();
  },

  _getPreferredWidth : function (actor, forHeight, alloc) {
    let [iconMinSize, iconNaturalSize] = this._iconBox.get_preferred_width (forHeight);
    let [labelMinSize, labelNaturalSize] = this._label.get_preferred_width (forHeight);
    //The label text starts in the center of the icon, so we should allocate the space
    //needed for the icon plus the space needed for (label - icon/2)
    alloc.min_size = iconMinSize + Math.max (0, labelMinSize - iconMinSize);
    alloc.natural_size = iconNaturalSize + Math.max (0, labelNaturalSize);
  },

  _getPreferredHeight : function (actor, forWidth, alloc) {
    let [iconMinSize, iconNaturalSize] = this._iconBox.get_preferred_height (forWidth);
    let [labelMinSize, labelNaturalSize] = this._label.get_preferred_height (forWidth);
    alloc.min_size = Math.max (iconMinSize, labelMinSize);
    alloc.natural_size = Math.max (iconNaturalSize, labelMinSize);
  },

  _allocate : function (actor, box, flags) {
    let allocWidth = box.x2 - box.x1;
    let allocHeight = box.y2 - box.y1;
    let childBox = new Clutter.ActorBox ();
    let rtl = (St.Widget.get_default_direction () == St.TextDirection.RTL);

    //Set the icon to be left-justified (or right-justified) and centered vertically
    let [iconMinWidth, iconMinHeight, iconNaturalWidth, iconNaturalHeight] = this._iconBox.get_preferred_size ();
    [childBox.y1, childBox.y2] = center (allocHeight, iconNaturalHeight);
    if (rtl)
    {
      [childBox.x1, childBox.x2] = [Math.max (0, allocWidth - iconNaturalWidth), allocWidth];
    }
    else
    {
      [childBox.x1, childBox.x2] = [0, Math.min (iconNaturalWidth, allocWidth)];
    }
    this._iconBox.allocate (childBox, flags);
    //Set the label to start its text in the left of the icon
    let iconWidth = childBox.x2 - childBox.x1;
    [minWidth, minHeight, naturalWidth, naturalHeight] = this._label.get_preferred_size ();
    [childBox.y1, childBox.y2] = center (allocHeight, naturalHeight);
    if (rtl)
    {
      childBox.x2 = allocWidth - iconWidth;
      childBox.x1 = Math.max (0, childBox.x2 - naturalWidth);
    }
    else
    {
      childBox.x1 = iconWidth;
      childBox.x2 = Math.min (childBox.x1 + naturalWidth, allocWidth);
    }
    this._label.allocate (childBox, flags);
    if (rtl)
    {
      childBox.x1 = iconWidth - this._numLabel.get_preferred_width (this._numLabel.height)[0] * (this._numLabel.get_text ().length + 1);
      childBox.x2 = childBox.x1 + this._numLabel.width;
      childBox.y1 = box.y1;
      childBox.y2 = box.y2 - 1;
      this._numLabel.allocate (childBox, flags);
    }
    else
    {
      childBox.x1 = -3;
      childBox.x2 = childBox.x1 + this._numLabel.width;
      childBox.y1 = box.y1 - 2;
      childBox.y2 = box.y2 - 1;
      this._numLabel.allocate (childBox, flags);
    }
  },

  show : function (animate, targetWidth) {
    if (!animate)
    {
      this.actor.show ();
      return;
    }

    let width = this.oldWidth || targetWidth;
    if (!width)
    {
      let [minWidth, naturalWidth] = this.actor.get_preferred_width (-1);
      width = naturalWidth;
    }

    this.actor.width = 3;
    this.actor.show ();
    Tweener.addTween (this.actor, {
      width: width,
      time: BUTTON_BOX_ANIMATION_TIME,
      transition: "easeOutQuad"
    });
  },

  hide : function (animate) {
    if (!animate)
    {
      this.actor.hide ();
      return;
    }

    this.oldWidth = this.actor.width;
    Tweener.addTween (this.actor, {
      width: 3,
      // FIXME: if this is set to 0, a whole bunch of "Clutter-CRITICAL **: clutter_paint_volume_set_width: assertion `width >= 0.0f' failed" messages appear
      time: BUTTON_BOX_ANIMATION_TIME,
      transition: "easeOutQuad",
      onCompleteScope: this,
      onComplete: function () {
        this.actor.hide ();
      }
    });
  },

  showLabel : function (animate, targetWidth) {
    if (!animate)
    {
      this._label.show ();
      return;
    }

    let width = targetWidth;
    if (!width)
    {
      let [minWidth, naturalWidth] = this._label.get_preferred_width (-1);
      width = naturalWidth;
    }

    this._label.show ();
    Tweener.addTween (this._label, {
      width: width,
      time: BUTTON_BOX_ANIMATION_TIME,
      transition: "easeOutQuad"
    });
  },

  hideLabel : function (animate) {
    if (!animate)
    {
      this._label.hide ();
      this._label.width = 1;
      return;
    }

    Tweener.addTween (this._label, {
      width: 1,
      // FIXME: if this is set to 0, a whole bunch of "Clutter-CRITICAL **: clutter_paint_volume_set_width: assertion `width >= 0.0f' failed" messages appear
      time: BUTTON_BOX_ANIMATION_TIME,
      transition: "easeOutQuad",
      onCompleteScope: this,
      onComplete: function () {
        this._label.hide ();
      }
    });
  }
};

function AppBox (app)
{
  this._init (app);
}

AppBox.prototype = {

  _init : function (app) {
    let rtl = (St.Widget.get_default_direction () == St.TextDirection.RTL);
    this.app = app;
    this.numWindows = 0;
    this.actor = new Cinnamon.GenericContainer ();
    this._container = new St.BoxLayout ( {style_class: 'item-box', style: 'padding: .5em;', name: app.get_id (), vertical: false} );
    this.actor.connect ('get-preferred-width', Lang.bind (this, this._getPreferredWidth));
    this.actor.connect ('get-preferred-height', Lang.bind (this, this._getPreferredHeight));
    this.actor.connect ('allocate', Lang.bind (this, this._allocate));

    this.icon = null;
    this._iconBin = new St.Bin ( {x_fill: true, y_fill: true} );

    let title = this.app.get_name ();
    this.label = new St.Label ( {style: 'padding-left: .4em; padding-right: .4em; text-shadow: black 1px 0px 2px;', text: title} );
    let bin = new St.Bin ( {x_align: St.Align.MIDDLE, y_align: St.Align.MIDDLE} );
    bin.add_actor (this.label);

    if (rtl)
    {
      this._container.add (bin);
      this._container.add (this._iconBin, {x_fill: false, y_fill: false} );
    }
    else
    {
      this._container.add (this._iconBin, {x_fill: false, y_fill: false} );
      this._container.add (bin);
    }

    this.actor.add_actor (this._container);
    this._container.show ();
    this.set_size (APPBOX_ICON_SIZE);
  },

  set_size : function (size) {
    this.icon = this.app.create_icon_texture (size);
    this.numWindows = this.app.get_windows ().filter (
                                                function (win) {
                                                        return !win.is_skip_taskbar ();
                                                }).length;
    this.iconLabelButton = new IconLabelButton (this.icon);
    if (this.numWindows > 1)
      this.iconLabelButton.setWindowNum (this.numWindows.toString ());
    this._iconBin.set_size (size, size);
    this._iconBin.child = this.iconLabelButton.actor;
  },

  get_num_windows : function () {
    return this.numWindows;
  },

  _getPreferredWidth : function (actor, forHeight, alloc) {
    let [iconMinSize, iconNaturalSize] = this._iconBin.get_preferred_width (forHeight);
    let [labelMinSize, labelNaturalSize] = this.label.get_preferred_width (forHeight);
    //The label text starts in the center of the icon, so we should allocate the space
    //needed for the icon plus the space needed for (label - icon/2)
    alloc.min_size = iconMinSize + Math.max (0, labelMinSize - iconMinSize);
    let padding = this._container.get_theme_node ().get_horizontal_padding ();
    let label_padding = this.label.get_theme_node ().get_horizontal_padding ();
    alloc.natural_size = iconNaturalSize + Math.max (0, labelNaturalSize) + padding + label_padding;
     
  },

  _getPreferredHeight : function (actor, forWidth, alloc) {
    let [iconMinSize, iconNaturalSize] = this._iconBin.get_preferred_height (forWidth);
    let [labelMinSize, labelNaturalSize] = this.label.get_preferred_height (forWidth);
    alloc.min_size = Math.max (iconMinSize, labelMinSize);
    let padding = this._container.get_theme_node ().get_vertical_padding ();
    let label_padding = this.label.get_theme_node ().get_vertical_padding ();
    alloc.natural_size = Math.max (iconNaturalSize, labelMinSize) + padding + label_padding;
  
  },

  _allocate : function (actor, box, flags) {
    let allocWidth = box.x2 - box.x1;
    let allocHeight = box.y2 - box.y1;
    let childBox = new Clutter.ActorBox ();
    let rtl = (St.Widget.get_default_direction () == St.TextDirection.RTL);

    let icon_side_padding, label_side_padding;
    if (rtl)
    {
      icon_side_padding = this._container.get_theme_node ().get_padding (St.Side.RIGHT);
      label_side_padding = this.label.get_theme_node ().get_padding (St.Side.RIGHT);
    }
    else
    {
      icon_side_padding = this._container.get_theme_node ().get_padding (St.Side.LEFT);
      label_side_padding = this.label.get_theme_node ().get_padding (St.Side.LEFT);
    }
    let label_padding = this.label.get_theme_node ().get_horizontal_padding ();

    //Set the icon to be left-justified (or right-justified) and centered vertically
    let [iconMinWidth, iconMinHeight, iconNaturalWidth, iconNaturalHeight] = this._iconBin.get_preferred_size ();
    [childBox.y1, childBox.y2] = center (allocHeight, iconNaturalHeight);
    if (rtl)
    {
      [childBox.x1, childBox.x2] = [Math.max (0, allocWidth - iconNaturalWidth - icon_side_padding), allocWidth - icon_side_padding];
    }
    else
    {
      [childBox.x1, childBox.x2] = [icon_side_padding, Math.min (iconNaturalWidth, allocWidth) + icon_side_padding];
    }
    this._iconBin.allocate (childBox, flags);
    //Set the label to start its text in the left of the icon
    let iconWidth = childBox.x2 - childBox.x1;
    [minWidth, minHeight, naturalWidth, naturalHeight] = this.label.get_preferred_size ();
    [childBox.y1, childBox.y2] = center (allocHeight, naturalHeight);
    if (rtl)
    {
      childBox.x2 = allocWidth - iconWidth - label_side_padding;
      childBox.x1 = childBox.x2 - naturalWidth;
    }
    else
    {
      childBox.x1 = iconWidth + label_side_padding;
      childBox.x2 = Math.min (childBox.x1 + naturalWidth, allocWidth) + label_padding;
    }
    this.label.allocate (childBox, flags);
  }
};

function SwitcherBox ()
{
  this._init ();
}

SwitcherBox.prototype = {

  _init : function () {
    //Create the main actor where we'll put everything
    this.actor = new Cinnamon.GenericContainer ();
    this.actor.connect ('get-preferred-width', Lang.bind (this, this._getPreferredWidth));
    this.actor.connect ('get-preferred-height', Lang.bind (this, this._getPreferredHeight));
    this.actor.connect ('allocate', Lang.bind (this, this._allocate));
    this._clipBin = new St.Bin ( {style_class: 'cbin'} );
    this._container = new St.BoxLayout ( {name: "switcherBox", style_class: 'switcher-list',
                 reactive: true, track_hover: true,
                 visible: false, vertical: true} );
    this._container.set_style ('border-radius: 8px; padding: 1em;');
    this._clipContainer = new St.BoxLayout ( {vertical: true} );

    //The box we'll load the AppBoxes into.
    this.metaBox = new St.BoxLayout ( {style_class: 'switcher-list-item-container', vertical: true} );

    //Get all the running applications (eg Firefox, gedit, Files, etc).
    let allApps = appSys.get_running ();
    //Cache the running apps for later reference
    this._appsRunning = allApps;
    //Here is the internal array which we use to select AppBoxes
    this._appBoxes = [];

    this._iconSize = APPBOX_ICON_SIZE;

    //Here we create each of the AppBoxes, and load into place
    for (let i = 0; i < allApps.length && allApps.length != 0; i++) {
      let app = new AppBox (allApps[i]);
      app.set_size (this._iconSize);
      this.addAppBox (app);
    }

    //Initialize more internal settings
    this._currentApp = 0;
    this._highlighted = -1;
    this._haveModal = false;
    this._motionTimeoutId = 0;
    this._initialDelayTimeoutId = 0;
    this._disableHover ();
    this._scrollableDown = true;
    this._scrollableUp = false;

    //Set up the title for the switcher
    let title = _('Applications');
    this._titleLabel = new St.Label ( {style: 'padding: .5em .5em; padding-top: 0em; font-size: 15px; font-weight: bold; text-align: left;', text: title} );
    this._titleBin = new St.Bin ( {x_align: St.Align.MIDDLE, y_align:St.Align.MIDDLE} );
    this._titleBin.add_actor (this._titleLabel);

    this._container.show ();
    this._topGradient = new St.BoxLayout ( {style_class: 'thumbnail-scroll-gradient-left', vertical: true} );
    this._topGradient.set_style ('background-gradient-direction: vertical; border-radius: 0px; border-radius-bottomleft: 0px; border-radius-bottomright: 0px;');
    this._bottomGradient = new St.BoxLayout ( {style_class: 'thumbnail-scroll-gradient-right', vertical: true} );
    this._bottomGradient.set_style ('background-gradient-direction: vertical; border-radius: 8px; border-radius-topleft: 0px; border-radius-topright: 0px;');

    this._topArrow = new St.DrawingArea ( {style_class: 'switcher-arrow',
      pseudo_class: 'highlighted'} );
    this._topArrow.connect ('repaint', Lang.bind (this,
      function () { AltTab._drawArrow (this._topArrow, St.Side.TOP); }));
    this._bottomArrow = new St.DrawingArea ( {style_class: 'switcher-arrow',
      pseudo_class: 'highlighted'} );
    this._bottomArrow.connect ('repaint', Lang.bind (this,
      function () { AltTab._drawArrow (this._bottomArrow, St.Side.BOTTOM); }));

    //Now assemble the pieces into the switcher itself,
    //and place actor in the stage (Main.uiGroup)
    this._container.add (this._titleBin);
    this._clipContainer.add (this.metaBox);
    this._clipBin.child = this._clipContainer;
    this._container.add (this._clipBin);
    this._container.add (this._topGradient);
    this._container.add (this._topArrow);
    this._container.add (this._bottomGradient);
    this._container.add (this._bottomArrow);
    this.actor.add_actor (this._container);

    Main.uiGroup.add_actor (this.actor);

    this.connect ('item-activated', Lang.bind (this, this._appActivated));
    this.connect ('item-entered', Lang.bind (this, this._appEntered));

    //Place the switcher in the center of the screen
    let monitor = Main.layoutManager.primaryMonitor;
    this.actor.set_position (Math.floor (monitor.width / 2 - this.actor.width / 2),
			     Math.floor (monitor.height / 2 - this.actor.height / 2));
  },

  _getPreferredWidth : function (actor, forHeight, alloc) {
    let appBoxMinWidths = [];
    let appBoxNatWidths = [];
    for (let i = 0; i < this._appBoxes.length; i++) {
      [appBoxMinWidths[i], appBoxNatWidths[i]] = this._appBoxes[i].get_preferred_width (forHeight);
    }
    let padding = this._container.get_theme_node ().get_horizontal_padding () +
      this.metaBox.get_theme_node ().get_horizontal_padding ();
    function max (appBoxWidths) {
      let maxval = appBoxWidths[0];
      for (let i = 0; i < appBoxWidths.length; i++) {
        maxval = Math.max (maxval, appBoxWidths[i]);
      }
      return maxval;
    }
    alloc.min_size = max (appBoxMinWidths) + padding;
    alloc.natural_size = max (appBoxNatWidths) + padding;
  },

  _getPreferredHeight : function (actor, forWidth, alloc) {
    let monitor = Main.layoutManager.primaryMonitor;
    let padding = this._container.get_theme_node ().get_vertical_padding ();
    let [appBoxMinHeight, appBoxNatHeight] = this._appBoxes[0].get_preferred_height (-1);
    let [titleMinHeight, titleNatHeight] = this._titleLabel.get_preferred_height (forWidth);
    let labelvPadding = this._titleLabel.get_theme_node ().get_vertical_padding ();
    alloc.min_size = Math.min (appBoxMinHeight * this._appBoxes.length + titleMinHeight + padding + labelvPadding, monitor.height*0.8 - titleMinHeight - padding - labelvPadding);
    alloc.natural_size = Math.min (appBoxNatHeight * this._appBoxes.length + titleNatHeight + padding + labelvPadding, monitor.height*0.8 - titleNatHeight - padding - labelvPadding);
    this._minSize = alloc.min_size;
  },

  _allocate : function (actor, box, flags) {
    let allocWidth = box.x2 - box.x1;
    let allocHeight = box.y2 - box.y1;
    let childBox = new Clutter.ActorBox ();
    let primary = Main.layoutManager.primaryMonitor;
    let rtl = (St.Widget.get_default_direction () == St.TextDirection.RTL);
    [childBox.x1, childBox.x2] = [0, allocWidth];
    [childBox.y1, childBox.y2] = [0, allocHeight];
    this.metaBox.allocate (childBox, flags);
    this._container.allocate (childBox, flags);

    let leftPadding = this._container.get_theme_node ().get_padding (St.Side.LEFT);
    let rightPadding = this._container.get_theme_node ().get_padding (St.Side.RIGHT);
    let topPadding = this._container.get_theme_node ().get_padding (St.Side.TOP);
    let bottomPadding = this._container.get_theme_node ().get_padding (St.Side.BOTTOM);
    let hPadding = leftPadding + rightPadding + this._clipContainer.get_theme_node ().get_horizontal_padding ();
    let vPadding = topPadding + bottomPadding;

    let labelvPadding = this._titleLabel.get_theme_node ().get_vertical_padding ();
    [labelMinWidth, labelNatWidth] = this._titleLabel.get_preferred_width (this._titleLabel.height);
    [labelMinHeight, labelNatHeight] = this._titleLabel.get_preferred_height (this._titleLabel.width);
    let labelTotalHeight = labelvPadding + labelNatHeight;

    let border_width_top = this._container.get_theme_node ().get_border_width (St.Side.TOP);
    let border_width_bottom = this._container.get_theme_node ().get_border_width (St.Side.BOTTOM);
    let [baseMinHeight, baseNatHeight] = this.actor.get_preferred_height (-1);
    let [childMinWidth, childNaturalWidth] = this.actor.get_preferred_width (allocHeight);
    let [childMinHeight, childNaturalHeight] = this.actor.get_preferred_height (childNaturalWidth);
    let scrollable = this._appBoxes.length * this._appBoxes[0].get_preferred_height (-1)[1] > childNaturalHeight - vPadding - labelTotalHeight;

    childBox.x1 = leftPadding;
    childBox.x2 = childBox.x1 + childNaturalWidth - rightPadding;
    childBox.y1 = border_width_top;
    childBox.y2 = childBox.y1 + childNaturalHeight + border_width_top + border_width_bottom + vPadding;

    this._clipBin.allocate (box, flags);
    this._clipContainer.allocate (childBox, flags);

    let borderWidthLeft = this._container.get_theme_node ().get_border_width (St.Side.LEFT);
    let borderWidthRight = this._container.get_theme_node ().get_border_width (St.Side.RIGHT);
    let borderWidthBottom = this._container.get_theme_node ().get_border_width (St.Side.BOTTOM);
    this._clipBin.set_clip (-leftPadding, box.y1 + topPadding + labelTotalHeight, this.actor.width + rightPadding, (this.actor.allocation.y2 - this.actor.allocation.y1) - vPadding - labelTotalHeight + border_width_bottom);

    childBox.x1 = borderWidthLeft;
    childBox.y1 = labelTotalHeight + topPadding / 2;
    childBox.x2 = childBox.x1 *0 + this._container.width - borderWidthRight;
    childBox.y2 = childBox.y1 + this._topGradient.get_theme_node ().get_width ();
    this._topGradient.allocate (childBox, flags);
    this._topGradient.opacity = (this._scrollableUp && scrollable) ? 255 : 0;

    childBox.x1 = borderWidthLeft;
    childBox.y1 = (this.actor.allocation.y2 - this.actor.allocation.y1) - this._bottomGradient.get_theme_node ().get_width ();
    childBox.x2 = this._container.width - borderWidthRight;
    childBox.y2 = childBox.y1 + this._bottomGradient.get_theme_node ().get_width () - borderWidthBottom;
    this._bottomGradient.allocate (childBox, flags);
    this._bottomGradient.opacity = (this._scrollableDown && scrollable) ? 255 : 0;

    let arrowHeight = Math.floor (topPadding / 3.0);
    let arrowWidth = arrowHeight * 2;
    childBox.x1 = this._container.width / 2 - arrowHeight;
    childBox.y1 = labelTotalHeight + topPadding;
    childBox.x2 = childBox.x1 + arrowWidth;
    childBox.y2 = childBox.y1 + arrowHeight;
    this._topArrow.allocate (childBox, flags);
    this._topArrow.opacity = this._topGradient.opacity;

    arrowHeight = Math.floor (bottomPadding / 3.0);
    arrowWidth = arrowHeight * 2;
    childBox.x1 = this._container.width / 2 - arrowHeight;
    childBox.y1 = this._container.height - arrowHeight - bottomPadding;
    childBox.x2 = childBox.x1 + arrowWidth;
    childBox.y2 = childBox.y1 + arrowHeight;
    this._bottomArrow.allocate (childBox, flags);
    this._bottomArrow.opacity = this._bottomGradient.opacity;

    
    let y = labelTotalHeight + topPadding;
    let leftPadding = this._appBoxes[0].get_theme_node ().get_padding (St.Side.LEFT);
    let rightPadding = this._appBoxes[0].get_theme_node ().get_padding (St.Side.RIGHT);
    let topPadding = this._appBoxes[0].get_theme_node ().get_padding (St.Side.TOP);
    let bottomPadding = this._appBoxes[0].get_theme_node ().get_padding (St.Side.BOTTOM);
    let children = this.metaBox.get_children ();
    let childWidth = box.x2 - box.x1;
    let [childMinHeight, childHeight] = children[0].get_preferred_height (-1);

    let maxChildNat = 0;
    for (let i = 0; i < children.length; i++)
    {
      if (this._appBoxes.indexOf (children[i]) != -1)
      {
        maxChildNat = Math.max (maxChildNat, children[i].get_preferred_width (childHeight)[1]);
      }
    }
    for (let i = 0; i < children.length; i++)
    {
      if (this._appBoxes.indexOf (children[i]) != -1)
      {
        childBox.x1 = leftPadding;
        childBox.y1 = y;
        childBox.x2 = childBox.x1 + maxChildNat - rightPadding - leftPadding;
        childBox.y2 = y + childHeight;
        children[i].allocate (childBox, flags);

        y += childHeight;

      }
    }

    let labelPadding = this._titleLabel.get_theme_node ().get_horizontal_padding ();
    let boxPadding = this._container.get_theme_node ().get_horizontal_padding ();
    [childBox.x1, childBox.x2] = center (allocWidth, labelNatWidth + labelPadding + boxPadding / 2);
    [childBox.y1, childBox.y2] = [0, labelNatHeight];
    this._titleLabel.allocate (childBox, flags);
  },

  addAppBox : function (app) {
    let rtl = (St.Widget.get_default_direction () == St.TextDirection.RTL);
    let bbox = new St.Button ( {style_class: 'item-box', reactive: true, x_align: (rtl ? St.Align.END : St.Align.START), x_fill: true} );
    bbox.set_style ('border-width: 1px; border-radius: 5px; padding: 0em;');

    bbox.set_child (app.actor);
    this.metaBox.add (bbox);

    let n = this._appBoxes.length;
    bbox.connect ('clicked', Lang.bind (this, function () { this._onItemClicked (n); }));
    bbox.connect ('enter-event', Lang.bind (this, function () { this._onItemEnter (n); }));

    this._appBoxes.push (bbox);
  },

  _nextApp : function () {
    return mod (this._currentApp + 1, this._appBoxes.length);
  },

  _previousApp : function () {
    return mod (this._currentApp - 1, this._appBoxes.length);
  },

  _scrollUp : function () {
    let y = this._appBoxes[this._highlighted].allocation.y1 - this._container.get_theme_node ().get_vertical_padding ()
      - this._titleLabel.get_height () - this._titleLabel.get_theme_node ().get_vertical_padding ();
    this._scrollableDown = true;
    Tweener.addTween (this.metaBox, { anchor_y: y,
      time: SWITCHERBOX_SCROLL_TIME,
      transition: 'easeOutQuad',
      onComplete: Lang.bind (this, function () {
        if (this._highlighted == 0)
        {
          this._scrollableUp = false;
          this.actor.queue_relayout ();
        }
      })
    });
    this.actor.queue_relayout ();
  },

  _scrollDown : function () {
    this._scrollableUp = true;
    let monitor = Main.layoutManager.primaryMonitor;
    let padding = this._container.get_theme_node ().get_padding (St.Side.BOTTOM);
    let y = this._appBoxes[this._highlighted].allocation.y2 - this._container.get_height () + padding;
    Tweener.addTween (this.metaBox, { anchor_y: y,
      time: SWITCHERBOX_SCROLL_TIME,
      transition: 'easeOutQuad',
      onComplete: Lang.bind (this, function () {
        if (this._highlighted == this._appBoxes.length - 1)
        {
          this._scrollableDown = false;
          this.actor.queue_relayout ();
        }
      })
    });
    this.actor.queue_relayout ();
  },

  _enterItem : function (index) {
    let [x, y, mask] = global.get_pointer ();
    let pickedActor = global.stage.get_actor_at_pos (Clutter.PickMode.ALL, x, y);
    if (this._appBoxes[index].contains (pickedActor))
      this._itemEntered (index);
  },

  _onItemClicked : function (index) {
    this._itemActivated (index);
  },

  _onItemEnter : function (index) {
    this._itemEntered (index);
  },

  _itemActivated : function (n) {
    this.emit ('item-activated', n);
  },

  _itemEntered : function (n) {
    this.emit ('item-entered', n);
  },

  _appActivated : function (appSwitcher, n) {
    this._appsRunning[n].activate_window (null, global.get_current_time ());
    this.destroy ();
  },

  _appEntered : function (appSwitcher, n) {
    if (!this._mouseActive)
      return;

    this._select (n);
  },

  _clickedOutside : function (actor, event) {
    this.destroy ();
  },

  _disableHover : function () {
    this._mouseActive = false;

    if (this._motionTimeoutId != 0)
      Mainloop.source_remove (this._motionTimeoutId);

    this._motionTimeoutId = Mainloop.timeout_add (DISABLE_HOVER_TIMEOUT, Lang.bind (this, this._mouseTimedOut));
  },

  _mouseTimedOut : function () {
    this._motionTimeoutId = 0;
    this._mouseActive = true;
  },

  show : function (backward, binding, keysym) {
    if (!Main.pushModal (this.actor))
      return false;

    this._binding = binding;
    this._haveModal = true;
    this._modifierMask = primaryModifier (binding.get_mask ());
    this._currentApp = mod (backward ? -1 : 1, this._appBoxes.length);

    this.actor.connect ('key-press-event',
			Lang.bind (this, this._keyPressEvent));
    this.actor.connect ('key-release-event',
			Lang.bind (this, this._keyReleaseEvent));
    this.actor.connect ('destroy', Lang.bind (this, this._onDestroy));

    this.actor.connect ('scroll-event',
			Lang.bind (this, this._onScroll));
    this.actor.connect ('button-press-event',
			Lang.bind (this, this._clickedOutside));

    //Only show the switcher if there is at least one application open
    if (this._appBoxes.length > 0)
    {
      this._disableHover ();
      this.actor.show ();
      this.actor.get_allocation_box ();
      this._select (this._currentApp);
    }

    //There's a race condition; if the user released Alt before
    //we got the grab, then we won't be notified. (See
    //https://bugzilla.gnome.org/show_bug.cgi?id=596695 for
    //details.) So we check now. (Have to do this after updating
    //selection.)
    let [x, y, mods] = global.get_pointer ();
    if (!(mods & this._modifierMask))
    {
      this._finish ();
      if (this._appsRunning.length > 0)
        this._appsRunning[this._currentApp].activate_window (null, global.get_current_time ());
      return false;
    }

    //We delay showing the popup so that fast Alt+Tab users aren't
    //disturbed by the popup briefly flashing.
    this._initialDelayTimeoutId = Mainloop.timeout_add (SWITCHERBOX_DELAY_TIMEOUT,
                                                       Lang.bind (this, function () {
                                                           this.actor.opacity = 255;
                                                           this._initialDelayTimeoutId = 0;
                                                       }));
    return true;
  },

  _popModal : function () {
    if (this._haveModal)
    {
      Main.popModal (this.actor);
      this._haveModal = false;
    }
  },

  destroy : function () {
    this._popModal ();
    if (this.actor.visible)
    {
      Tweener.addTween (this.actor, {
      opacity: 0, time: SWITCHERBOX_FADE_TIME, transition: 'easeOutQuad', onComplete: Lang.bind (this,
				function () {
				  this.actor.destroy ();
				}
			)});
    }
    else
    {
      this.actor.destroy ();
    }
  },

  _onDestroy : function () {
    this.destroy ();
    if (this._motionTimeoutId != 0)
      Mainloop.source_remove (this._motionTimeoutId);
    if (this._initialDelayTimeoutId != 0)
      Mainloop.source_remove (this._initialDelayTimeoutId);
  },

  _finish : function () {
    this.destroy ();
  },

  highlight : function (index, justOutline) {
    if (this._highlighted != -1)
    {
      if (this._appsRunning.length > 0)
        this._appBoxes[this._highlighted].remove_style_pseudo_class ('selected');
    }

    this._highlighted = index;

    if (this._highlighted != -1)
    {
      if (this._appsRunning.length > 0)
      {
        this._appBoxes[this._highlighted].add_style_pseudo_class ('selected');
      }
    }

    let [absItemX, absItemY] = this._appBoxes[index].get_transformed_position ();
    let [result, posX, posY] = this._container.transform_stage_point (0, absItemY);
    let [containerWidth, containerHeight] = this._container.get_transformed_size ();
    if (posY + this._appBoxes[index].get_height () + this._container.get_theme_node ().get_vertical_padding () > containerHeight)
      this._scrollDown ();
    else if (posY < this._titleLabel.get_height ())
      this._scrollUp ();
  },

  _select : function (app) {
    this._currentApp = app;
    this.highlight (app); 
  },

  _activateAppWithWindow : function (app, win) {
    app.activate_window (win, global.get_current_time ());
  },

  _activateWindow : function (win) {
    Main.activateWindow (win, global.get_current_time ());
  },

  _removeWindow : function (win) {
    win.delete (global.get_current_time ());
  },

  _keyPressEvent : function (actor, event) {
    let keysym = event.get_key_symbol ();
    let event_state = Cinnamon.get_event_state (event);
    let backwards = event_state & Clutter.ModifierType.SHIFT_MASK;
    let action =
      metaDisplay.get_keybinding_action (event.get_key_code (), event_state);

    this._disableHover ();

    if (keysym == Clutter.Escape)
    {
      this.destroy ();
    }
    else if (keysym == Clutter.Up || keysym == Clutter.Left)
    {
      this._currentApp = this._previousApp ();
      this._select (this._currentApp);
    }
    else if (keysym == Clutter.Down || keysym == Clutter.Right)
    {
      this._currentApp = this._nextApp ();
      this._select (this._currentApp);
    }
    else if (action == Meta.KeyBindingAction.CYCLE_WINDOWS)
    {
      this._currentApp = (backwards ? this._previousApp () : this._nextApp ());
      this._select (this._currentApp);
    }
    else if (action == Meta.KeyBindingAction.CYCLE_PANELS)
    {
      let windows = [];
      let actions = {};
      windows = this._appsRunning[this._currentApp].get_windows ().filter (
                                              function (win) {
                                                      return !win.is_skip_taskbar ();
                                              });
      actions['activate_selected'] = this._activateWindow;
      actions['remove_selected'] = this._removeWindow;
      actions['activate_selected_app'] = this._activateAppWithWindow;

      this.switcher3D = (switcher_3d_style == "coverflow" ) ? new CoverflowSwitcher (this._binding, this._appsRunning[this._currentApp], this, null)
        : new TimelineSwitcher (this._binding, this._appsRunning[this._currentApp], this, null);
    }
  },

  _onScroll : function (actor, event) {
    let direction = event.get_scroll_direction ();
    if (direction == Clutter.ScrollDirection.UP)
    {
      this._currentApp = this._previousApp ();
    }
    else if (direction == Clutter.ScrollDirection.DOWN)
    {
      this._currentApp = this._nextApp ();
    }
    this._select (this._currentApp);
  },

  _keyReleaseEvent : function (actor, event) {
    let [x, y, mods] = global.get_pointer ();
    let state = mods & this._modifierMask;

    if (state == 0)
    {
      this._finish ();
      if (this._appsRunning.length > 0)
        this._appsRunning[this._currentApp].activate_window (null, global.get_current_time ());
    }
    return true;
  }

};

Signals.addSignalMethods (SwitcherBox.prototype);

function _onLaunchKeyPress (display, screen, window, binding)
{
  switcherBox = new SwitcherBox ();
  let modifiers = binding.get_modifiers ();
  let backwards = modifiers & Meta.VirtualModifier.SHIFT_MASK;
  if (!switcherBox.show (backwards, binding))
    switcherBox.destroy ();
}

function _onWinKeyPress (display, screen, window, binding)
{
  let app = appSys.get_running ()[0];
  function _activateAppWin (app, win) {
    app.activate_window (win, global.get_current_time ());
  }

  function _activateWin (win) {
    Main.activateWindow (win, global.get_current_time ());
  }

  function _removeWin (win) {
    win.delete (global.get_current_time ());
  }
  actions = {};
  actions['activate_selected'] = _activateWin;
  actions['remove_selected'] = _removeWin;
  actions['activate_selected_app'] = _activateAppWin;
  let switcher3D = (switcher_3d_style == "coverflow" ) ? new CoverflowSwitcher (binding, app, null, null)
    : new TimelineSwitcher (binding, app, null, null);
}

function _onWinKeyAllPress (display, screen, window, binding)
{
  function _activateWin (win) {
    Main.activateWindow (win, global.get_current_time ());
  }

  function _activateAppWin (app, win) {
    if (app == null)
    {
      app = Cinnamon.WindowTracker.get_default ().get_window_app (win);
    }
    app.activate_window (win, global.get_current_time ());
  }

  function _removeWin (win) {
    win.delete (global.get_current_time ());
  }

  let allApps = appSys.get_running ();
  let windows = [];
  let appWindows = [];
  for (i in allApps) {
    let appWindows = allApps[i].get_windows ().filter (
      function (win) {
        return !win.is_skip_taskbar ();
      }
    );
    for (j in appWindows) {
      windows.push (appWindows[j]);
    }
    appWindows = null;
  }
  windows.sort (Lang.bind (this,
    function (win1, win2) {
      let t1 = win1.get_user_time ();
      let t2 = win2.get_user_time ();

      return (t2 > t1) ? 1 : -1;
    }
  ));
  
  actions = {};
  actions['activate_selected'] = _activateWin;
  actions['remove_selected'] = _removeWin;
  actions['activate_selected_app'] = _activateAppWin;

  let switcher3D = (switcher_3d_style == "coverflow" ) ? new CoverflowSwitcher (binding, null, null, windows)
    : new TimelineSwitcher (binding, null, null, windows);
}

var g_settings_obj;
var g_settings = {};

function init() {
  //For now, all we do is initialize our appSys we'll use each time
  //the SwitcherBox is displayed.
  appSys = Cinnamon.AppSystem.get_default ();
}

function enable ()
{
  //Initialize new Settings API.
  if (Settings) {
    let settings = g_settings_obj = new Settings.ExtensionSettings (g_settings, UUID);

    settings.bindProperty (Settings.BindingDirection.IN,
      "style",
      "style",
      function ()
      {
        settings.setValue ("style", this.style);
        switcher_3d_style = this.style;
      },
      null);
    settings.bindProperty (Settings.BindingDirection.BIDIRECTIONAL,
      "switch-apps-keybinding",
      "switch_apps_keybinding",
      function ()
      {
        this.switch_apps_keybinding = this.switch_apps_keybinding.replace (/\<Primary\>/g, '<Control>');
        settings.setValue ("switch-apps-keybinding", this.switch_apps_keybinding);
        appSwitcherSettings.set_strv ("cycle-windows", [this.switch_apps_keybinding]);
      },
      null);
    settings.bindProperty (Settings.BindingDirection.BIDIRECTIONAL,
      "switch-app-windows-keybinding",
      "switch_app_windows_keybinding",
      function ()
      {
        this.switch_app_windows_keybinding = this.switch_app_windows_keybinding.replace (/\<Primary\>/g, '<Control>');
        settings.setValue ("switch-app-windows-keybinding", this.switch_app_windows_keybinding);
        appSwitcherSettings.set_strv ("cycle-group", [this.switch_app_windows_keybinding]);
      },
      null);
    settings.bindProperty (Settings.BindingDirection.BIDIRECTIONAL,
      "switch-windows-keybinding",
      "switch_windows_keybinding",
      function ()
      {
        this.switch_windows_keybinding = this.switch_windows_keybinding.replace (/\<Primary\>/g, '<Control>');
        settings.setValue ("switch-windows-keybinding", this.switch_windows_keybinding);
        appSwitcherSettings.set_strv ("cycle-panels", [this.switch_windows_keybinding]);
      },
      null);
    settings.setValue ("switch-apps-keybinding", appSwitcherSettings.get_strv ("cycle-windows")[0]);
    settings.setValue ("switch-app-windows-keybinding", appSwitcherSettings.get_strv ("cycle-group")[0]);
    settings.setValue ("switch-windows-keybinding", appSwitcherSettings.get_strv ("cycle-panels")[0]);
  }

  metaDisplay = global.screen.get_display ();
  Meta.keybindings_set_custom_handler ('cycle-windows', Lang.bind (this, this._onLaunchKeyPress));
  Meta.keybindings_set_custom_handler ('cycle-group', Lang.bind (this, this._onWinKeyPress));
  Meta.keybindings_set_custom_handler ('cycle-group-backwards', Lang.bind (this, this._onWinKeyPress));
  Meta.keybindings_set_custom_handler ('cycle-panels', Lang.bind (this, this._onWinKeyAllPress));
  Meta.keybindings_set_custom_handler ('cycle-panels-backwards', Lang.bind (this, this._onWinKeyAllPress));
}

function disable ()
{
  metaDisplay = null;
  Meta.keybindings_set_custom_handler ('cycle-windows', Lang.bind (Main.wm, Main.wm._startAppSwitcher));
  Meta.keybindings_set_custom_handler ('cycle-group', Lang.bind (Main.wm, Main.wm._startAppSwitcher));
  Meta.keybindings_set_custom_handler ('cycle-panels', Lang.bind (Main.wm, Main.wm._startA11ySwitcher));
  Meta.keybindings_set_custom_handler ('cycle-windows-backward', Lang.bind (Main.wm, Main.wm._startAppSwitcher));
  Meta.keybindings_set_custom_handler ('cycle-group-backward', Lang.bind (Main.wm, Main.wm._startAppSwitcher));
}
