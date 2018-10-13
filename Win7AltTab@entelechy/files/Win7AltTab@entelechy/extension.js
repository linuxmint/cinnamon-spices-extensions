const GObject = imports.gi.GObject;
const Cinnamon = imports.gi.Cinnamon;
const Clutter = imports.gi.Clutter;
const Meta = imports.gi.Meta;
const Pango = imports.gi.Pango;
const St = imports.gi.St;
const Params = imports.misc.params;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Signals = imports.signals;
const THUMBNAIL_SCALE = 0.09;

const POPUP_DELAY_TIMEOUT = 150; // milliseconds
const POPUP_FADE_OUT_TIME = 0.1; // seconds

const DISABLE_HOVER_TIMEOUT = 500; // milliseconds
const CHECK_DESTROYED_TIMEOUT = 100; // milliseconds
const PREVIEW_DELAY_TIMEOUT = 150; // milliseconds
var PREVIEW_SWITCHER_FADEOUT_TIME = 0.5; // seconds

function mod(a, b) {
  return (a + b) % b;
}

function primaryModifier(mask) {
  if (mask === 0) return 0;

  let primary = 1;
  while (mask > 1) {
    mask >>= 1;
    primary <<= 1;
  }
  return primary;
}

function isWindows(binding) {
  return binding === 'switch-windows' || binding === 'switch-windows-backward' || binding === 'switch-applications' || binding === 'switch-applications-backward';
}

function isGroup(binding) {
  return binding === 'switch-group' || binding === 'switch-group-backward';
}

function isPanels(binding) {
  return binding === 'switch-panels' || binding === 'switch-panels-backward';
}

function createWindowClone(metaWindow, size, withTransients, withPositions) {
  let clones = [];
  let textures = [];

  if (!metaWindow) {
    return clones;
  }

  let metaWindowActor = metaWindow.get_compositor_private();
  if (!metaWindowActor) {
    return clones;
  }
  let texture = metaWindowActor.get_texture();
  let [width, height] = metaWindowActor.get_size();
  let [maxWidth, maxHeight] = [width, height];
  let [x, y] = metaWindowActor.get_position();
  let [minX, minY] = [x, y];
  let [maxX, maxY] = [minX + width, minY + height];
  textures.push({t: texture, x: x, y: y, w: width, h: height});
  if (withTransients) {
    metaWindow.foreach_transient(function(win) {
      let metaWindowActor = win.get_compositor_private();
      texture = metaWindowActor.get_texture();
      [width, height] = metaWindowActor.get_size();
      [x, y] = metaWindowActor.get_position();
      maxWidth = Math.max(maxWidth, width);
      maxHeight = Math.max(maxHeight, height);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + width);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y + height);
      textures.push({t: texture, x: x, y: y, w: width, h: height});
    });
  }
  let scale = 1;
  if (size) {
    if (withPositions) {
      scale = Math.min(size / Math.max(maxX - minX, maxY - minY), 1);
    } else {
      scale = Math.min(size / Math.max(maxWidth, maxHeight), 1);
    }
  }
  for (let i in textures) {
    let data = textures[i];
    let [texture, width, height, x, y] = [data.t, data.w, data.h, data.x, data.y];
    if (withPositions) {
      x -= minX;
      y -= minY;
    }
    let params = {};
    params.source = texture;
    if (scale !== 1) {
      params.width = Math.round(width * scale);
      params.height = Math.round(height * scale);
      x = Math.round(x * scale);
      y = Math.round(y * scale);
    }
    let clone = {actor: new Clutter.Clone(params), x: x, y: y};
    clones.push(clone);
  }
  return clones;
}

function getTabList(all, group, window, workspaceOpt, screenOpt) {
  let screen = screenOpt || global.screen;
  let display = screen.get_display();
  let workspace = workspaceOpt || screen.get_active_workspace();
  let tracker = Cinnamon.WindowTracker.get_default();

  let windows = []; // the array to return
  let winlist = []; // the candidate windows

  if (!all) {
    winlist = display.get_tab_list(Meta.TabList.NORMAL_ALL, screen, workspace);
    if (group) {
      let app;
      if (window && Main.isInteresting(window)) {
        app = tracker.get_window_app(window);
      } else {
        app = winlist.length > 0 ? tracker.get_window_app(winlist[0]) : null;
      }
      winlist = app ? app.get_windows() : window && Main.isInteresting(window) ? [window] : winlist[0] ? [winlist[0]] : [];
    }
  } else {
    let n = screen.get_n_workspaces();
    for (let i = 0; i < n; i++) {
      winlist = winlist.concat(display.get_tab_list(Meta.TabList.NORMAL_ALL, screen, screen.get_workspace_by_index(i)));
    }
  }

  let registry = {}; // to avoid duplicates
  for (let i = 0; i < winlist.length; ++i) {
    let win = winlist[i];
    if (Main.isInteresting(win)) {
      let seqno = win.get_stable_sequence();
      if (!registry[seqno]) {
        windows.push(win);
        registry[seqno] = true; // there may be duplicates in the list (rare)
      }
    }
  }
  // from cinnamon_app_compare_windows()
  windows.sort(function(w1, w2) {
    let ws_1 = w1.get_workspace() === global.screen.get_active_workspace();
    let ws_2 = w2.get_workspace() === global.screen.get_active_workspace();

    if (ws_1 && !ws_2) return -1;
    else if (!ws_1 && ws_2) return 1;

    let vis_1 = w1.showing_on_its_workspace();
    let vis_2 = w2.showing_on_its_workspace();

    if (vis_1 && !vis_2) return -1;
    else if (!vis_1 && vis_2) return 1;

    return w2.get_user_time() - w1.get_user_time();
  });
  return windows;
}

const convertRange = function(value, r1, r2) {
  return (value - r1[0]) * (r2[1] - r2[0]) / (r1[1] - r1[0]) + r2[0];
};

const setOpacity = (peekTime, window_actor, targetOpacity) => {
  const opacity = convertRange(targetOpacity, [0, 100], [0, 255]);
  Tweener.addTween(window_actor, {
    time: peekTime * 0.001,
    transition: 'easeOutQuad',
    opacity: opacity > 255 ? 255 : opacity
  });
};

const isFinalized = function(obj) {
  return obj && GObject.Object.prototype.toString.call(obj).indexOf('FINALIZED') > -1;
}

function ThumbnailGrid(params) {
  this._init(params);
}

ThumbnailGrid.prototype = {
  _init: function(params) {
    params = Params.parse(params, {
      rowLimit: null,
      colLimit: null,
      spacing: 10
    });
    this.rowLimit = params.rowLimit;
    this.colLimit = params.colLimit;
    this.spacing = params.spacing;

    this.actor = new St.BoxLayout({vertical: true});
    this.tWidth = 1;
    this.tHeight = 1;
    this.grid = new Cinnamon.GenericContainer();
    this.titleLabel = new St.Label({style: 'font-weight: bold'});
    this.titleBin = new St.Bin();
    this.titleBin.set_child(this.titleLabel);
    this.actor.add(this.titleBin);
    this.actor.add(this.grid, {expand: true, y_align: St.Align.START});

    this.grid.connect(
      'get-preferred-width',
      Lang.bind(this, this._getPreferredWidth)
    );
    this.grid.connect(
      'get-preferred-height',
      Lang.bind(this, this._getPreferredHeight)
    );
    this.grid.connect(
      'allocate',
      Lang.bind(this, this._allocate)
    );
  },

  _setTitle: function(text, demandsAttention) {
    this.titleLabel = new St.Label({text: text, style: 'font-weight: bold'});
    this.titleBin.set_child(this.titleLabel);
    this.titleLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    let parentnode = this.actor.get_parent() ?
      this.actor
        .get_parent()
        .get_parent()
        .get_theme_node()
      : null;
    this.titleLabel.clutter_text.width = Math.min(
      this.titleLabel.clutter_text.width,
      Math.floor(this.grid.width + (parentnode ? parentnode.get_horizontal_padding() : 0))
    );
    this.titleBin.set_position(
      Math.floor(
        (this.grid.width - this.titleLabel.width) / 2),
        Math.floor(-(parentnode ? parentnode.get_padding(St.Side.TOP) : 0) + this.titleLabel.height / 8
      )
    );
  },

  _calcTSize: function() {
    let children = this.grid.get_children();
    for (let i = 0; i < children.length; i++) {
      let size = children[i].get_preferred_size();
      this.tWidth = Math.max(this.tWidth, size[2]);
      this.tHeight = Math.max(this.tHeight, size[3]);
    }
    this.tWidth = Math.ceil(this.tWidth);
    this.tHeight = Math.ceil(this.tHeight);
  },

  _getPreferredWidth: function(actor, forHeight, alloc) {
    let children = this.grid.get_children();
    this._calcTSize();
    let nColumns = this.colLimit ? Math.min(this.colLimit, children.length) : children.length;
    let totalSpacing = Math.max(0, nColumns - 1) * this.spacing;
    alloc.min_size = this.tWidth;
    alloc.natural_size = nColumns * this.tWidth + totalSpacing;
  },

  _getVisibleChildren: function() {
    let children = this.grid.get_children();
    children = children.filter(function(actor) {
      return actor.visible;
    });
    return children;
  },

  _getPreferredHeight: function(actor, forWidth, alloc) {
    let children = this._getVisibleChildren();
    this._calcTSize();
    let [nColumns, usedWidth] = this._computeLayout(forWidth);
    let nRows;
    if (nColumns > 0) nRows = Math.ceil(children.length / nColumns);
    else nRows = 0;
    if (this.rowLimit) nRows = Math.min(nRows, this.rowLimit);
    let totalSpacing = Math.max(0, nRows - 1) * this.spacing;
    let height = nRows * this.tHeight + totalSpacing;
    alloc.min_size = height;
    alloc.natural_size = height;
  },

  _allocate: function(grid, box, flags) {
    let children = this._getVisibleChildren();
    let availWidth = box.x2 - box.x1;
    let availHeight = box.y2 - box.y1;

    this._calcTSize();
    let [nColumns, usedWidth] = this._computeLayout(availWidth);

    let leftPadding = Math.floor((availWidth - usedWidth) / 2);

    let x = box.x1 + leftPadding;
    let y = box.y1 + this.titleLabel.height;
    let columnIndex = 0;
    let rowIndex = 0;

    for (let i = 0; i < children.length; i++) {
      let childBox = new Clutter.ActorBox();
      if (St.Widget.get_default_direction() === St.TextDirection.RTL) {
        let _x = box.x2 - (x + this.tWidth);
        childBox.x1 = Math.floor(_x);
      } else {
        childBox.x1 = Math.floor(x);
      }
      childBox.y1 = Math.floor(y);
      childBox.x2 = childBox.x1 + this.tWidth;
      childBox.y2 = childBox.y1 + this.tHeight;

      if (this.rowLimit && rowIndex >= this.rowLimit) {
        this.grid.set_skip_paint(children[i], true);
      } else {
        children[i].allocate(childBox, flags);
        this.grid.set_skip_paint(children[i], false);
      }

      columnIndex++;
      if (columnIndex === nColumns) {
        columnIndex = 0;
        rowIndex++;
      }

      if (columnIndex === 0) {
        y += this.tHeight + this.spacing;
        x = box.x1 + leftPadding;
      } else {
        x += this.tWidth + this.spacing;
      }
    }
    this.nColumns = nColumns;
    this.nRows = rowIndex + (columnIndex === 0 ? 0 : 1);
  },

  _computeLayout: function(forWidth) {
    let nColumns = 0;
    let usedWidth = 0;

    while ((this.colLimit == null || nColumns < this.colLimit) && usedWidth + this.tWidth <= forWidth) {
      usedWidth += this.tWidth + this.spacing;
      nColumns += 1;
    }

    if (nColumns > 0) usedWidth -= this.spacing;

    return [nColumns, usedWidth];
  },

  removeAll: function() {
    this.grid.get_children().forEach(
      Lang.bind(this, function(child) {
        child.destroy();
      })
    );
  },

  addItem: function(actor) {
    this.grid.add_actor(actor);
  }
};

function AltTabPopup() {
  this._init();
}

AltTabPopup.prototype = {
  _init: function() {
    this.actor = new Cinnamon.GenericContainer({
      name: 'altTabPopup',
      reactive: true,
      visible: false
    });

    this.actor.connect(
      'get-preferred-width',
      Lang.bind(this, this._getPreferredWidth)
    );
    this.actor.connect(
      'get-preferred-height',
      Lang.bind(this, this._getPreferredHeight)
    );
    this.actor.connect(
      'allocate',
      Lang.bind(this, this._allocate)
    );

    this.actor.connect(
      'destroy',
      Lang.bind(this, this._onDestroy)
    );

    this._haveModal = false;
    this._modifierMask = 0;

    this._currentIndex = 0;
    this._motionTimeoutId = 0;
    this._initialDelayTimeoutId = 0;
    this._displayPreviewTimeoutId = 0;

    // Initially disable hover so we ignore the enter-event if
    // the switcher appears underneath the current pointer location
    this._disableHover();

    Main.uiGroup.add_actor(this.actor);

    this._previewEnabled = true;
    this._iconsEnabled = false;
    this._thumbnailsEnabled = true;
    this._oldBinding = null;
    this._oldWindows = [];
    this._changeWS = false;
    this._changedWS = false;
    this._changedBinding = false;
    this._windowManager = global.window_manager;

    this._dcid = this._windowManager.connect(
      'destroy',
      Lang.bind(this, this._windowDestroyed)
    );
    this._mcid = this._windowManager.connect(
      'map',
      Lang.bind(this, this._activateSelected)
    );
  },

  _getPreferredWidth: function(actor, forHeight, alloc) {
    alloc.min_size = global.screen_width;
    alloc.natural_size = global.screen_width;
  },

  _getPreferredHeight: function(actor, forWidth, alloc) {
    alloc.min_size = global.screen_height;
    alloc.natural_size = global.screen_height;
  },

  _allocate: function(actor, box, flags) {
    let childBox = new Clutter.ActorBox();
    let primary = Main.layoutManager.primaryMonitor;

    let leftPadding = this.actor.get_theme_node().get_padding(St.Side.LEFT);
    let rightPadding = this.actor.get_theme_node().get_padding(St.Side.RIGHT);
    let hPadding = leftPadding + rightPadding;

    // Allocate the appSwitcher
    // We select a size based on an icon size that does not overflow the screen
    let [childMinHeight, childNaturalHeight] = this._appSwitcher.actor.get_preferred_height(primary.width - hPadding);
    let [childMinWidth, childNaturalWidth] = this._appSwitcher.actor.get_preferred_width(childNaturalHeight);
    childBox.x1 = Math.max(primary.x + leftPadding, primary.x + Math.floor((primary.width - childNaturalWidth) / 2));
    childBox.x2 = Math.min(primary.x + primary.width - rightPadding, childBox.x1 + childNaturalWidth);
    childBox.y1 = primary.y + Math.floor((primary.height - childNaturalHeight) / 2);
    childBox.y2 = childBox.y1 + childNaturalHeight;
    this._appSwitcher.actor.allocate(childBox, flags);
  },

  _checkDestroyed: function(window) {
    this._checkDestroyedTimeoutId = 0;
    this._removeDestroyedWindow(window);
  },

  _windowDestroyed: function(wm, actor) {
    this._removeDestroyedWindow(actor.meta_window);
  },

  _removeDestroyedWindow: function(window) {
    for (let i in this._winIcons) {
      if (window === this._winIcons[i].window) {
        if (this._winIcons.length === 1) this.destroy();
        else {
          this._winIcons.splice(i, 1)[0].actor.destroy();
          this._appSwitcher._items.splice(i, 1)[0].destroy();
          if (i < this._currentIndex) this._currentIndex--;
          else this._currentIndex %= this._winIcons.length;
          this._select(this._currentIndex);
          this._appSwitcher.thumbGrid._setTitle(this._winIcons[this._currentIndex].label, this._winIcons[this._currentIndex]._demandsAttention);
        }

        return;
      }
    }
  },

  _activateSelected: function() {
    Main.activateWindow(this._winIcons[this._currentIndex].window, global.get_current_time());
    this.destroy();
  },

  _nextWindow: function() {
    return mod(this._currentIndex + 1, this._winIcons.length);
  },

  _previousWindow: function() {
    return mod(this._currentIndex - 1, this._winIcons.length);
  },

  _keyReleaseEvent: function() {
    let [x, y, mods] = global.get_pointer();
    let state = mods & this._modifierMask;

    if (state === 0) this._finish();

    return true;
  },

  _onScroll: function(actor, event) {
    let direction = event.get_scroll_direction();
    if (direction === Clutter.ScrollDirection.UP) {
      this._select(this._previousWindow());
    } else if (direction === Clutter.ScrollDirection.DOWN) {
      this._select(this._nextWindow());
    }
  },

  _clickedOutside: function() {
    this.destroy();
  },

  _windowActivated: function(appSwitcher, n) {
    if (n === this._currentIndex) {
      Main.activateWindow(this._winIcons[this._currentIndex].window);
    }
    this.destroy();
  },

  _windowEntered: function(appSwitcher, n) {
    if (!this._mouseActive) return;

    this._select(n);
  },

  _disableHover: function() {
    this._mouseActive = false;

    if (this._motionTimeoutId !== 0) Mainloop.source_remove(this._motionTimeoutId);

    this._motionTimeoutId = Mainloop.timeout_add(DISABLE_HOVER_TIMEOUT, Lang.bind(this, this._mouseTimedOut));
  },

  _mouseTimedOut: function() {
    this._motionTimeoutId = 0;
    this._mouseActive = true;
  },

  _popModal: function() {
    if (this._haveModal) {
      Main.popModal(this.actor);
      this._haveModal = false;
    }
  },

  destroy: function() {
    this._clearPreview();
    let doDestroy = () => {
      if (isFinalized(this.actor)) return;
      Main.uiGroup.remove_actor(this.actor);
      this.actor.destroy();
    };

    this._popModal();
    if (this.actor.visible) {
      Tweener.addTween(this.actor, {
        opacity: 0,
        time: POPUP_FADE_OUT_TIME,
        transition: 'easeOutQuad',
        onComplete: doDestroy
      });
    } else {
      doDestroy();
    }
    let windows = global.get_window_actors();
    for (let i in windows) {
      if (windows[i].get_meta_window().get_window_type() !== Meta.WindowType.DESKTOP)
        Tweener.addTween(windows[i], {
          opacity: 255,
          time: PREVIEW_SWITCHER_FADEOUT_TIME / 4
        });
    }
  },

  _onDestroy: function() {
    this._popModal();

    if (this._motionTimeoutId) Mainloop.source_remove(this._motionTimeoutId);
    if (this._initialDelayTimeoutId) Mainloop.source_remove(this._initialDelayTimeoutId);
    if (this._displayPreviewTimeoutId) Mainloop.source_remove(this._displayPreviewTimeoutId);
    this._windowManager.disconnect(this._dcid);
    this._windowManager.disconnect(this._mcid);
    /*if (this._checkDestroyedTimeoutId !== 0) {
      Mainloop.source_remove(this._checkDestroyedTimeoutId);
      this._checkDestroyedTimeoutId = 0;
    }*/
  },

  _clearPreview: function() {
    if (!this.overlayPreview) {
      return;
    }
    global.overlay_group.remove_child(this.overlayPreview);
    this.overlayPreview.destroy();
    this.overlayPreview = null;
  },

  _doWindowPreview: function() {
    if (!this._previewEnabled || this._winIcons.length < 1 || !this._winIcons[this._currentIndex].window) {
      return;
    }

    this.metaWindowActor = this._winIcons[this._currentIndex].window.get_compositor_private();
    this.overlayPreview = new Clutter.Clone({
      source: this.metaWindowActor.get_texture(),
      opacity: 0
    });
    let [x, y] = this.metaWindowActor.get_position();
    this.overlayPreview.set_position(x, y);
    global.overlay_group.add_child(this.overlayPreview);
    global.overlay_group.set_child_above_sibling(this.overlayPreview, null);
    setOpacity(PREVIEW_DELAY_TIMEOUT, this.overlayPreview, 92);
  },

  _select: function(index) {
    this._clearPreview();
    this._currentIndex = index;
    if (this._winIcons.length < 1) return;
    this._appSwitcher.highlight(index);
    this._doWindowPreview();
  },

  refresh: function(binding, backward) {
    if (this._appSwitcher) {
      this._clearPreview();
      this.actor.remove_actor(this._appSwitcher.actor);
      this._appSwitcher.thumbGrid.removeAll();
      this._appSwitcher.actor.destroy();
    }

    this._currentIndex = 0;

    let all = isPanels(binding);
    let group = isGroup(binding);

    let windows = getTabList(all, group);
    if (this._changeWS) {
      this._changeWS = false;
      this._changedWS = true;
      binding = this._oldBinding;
      if (this._oldWindows.length > 0 && !isWindows(binding)) windows = this._oldWindows;
    }
    if (this._changedBinding && isGroup(binding)) {
      windows = getTabList(false, true, this._window);
      this._window = null;
      this._changedBinding = false;
    }
    if (windows.length > 0) {
      this._oldWindows = windows;
      this._oldBinding = binding;
    }

    this._appSwitcher = new AppSwitcher(windows, this);
    this.actor.add_actor(this._appSwitcher.actor);

    this._appSwitcher.connect(
      'item-activated',
      Lang.bind(this, this._windowActivated)
    );
    this._appSwitcher.connect(
      'item-entered',
      Lang.bind(this, this._windowEntered)
    );

    this._winIcons = this._appSwitcher.icons;

    this._appSwitcher.actor.opacity = 0;
    if (windows.length < 1 || this._winIcons.length === 0) {
      this._finish();
      return false;
    }
    this.actor.show();
    this.actor.get_allocation_box();

    // Make the initial selection
    if (this._winIcons.length > 0) {
      if (binding === 'no-switch-windows' || this._changedWS || this._winIcons.length === 1) {
        this._select(0);
      } else if (backward) {
        this._select(this._winIcons.length - 1);
      } else {
        this._select(1);
      }
      this._appSwitcher.thumbGrid._setTitle(this._winIcons[this._currentIndex].label, this._winIcons[this._currentIndex]._demandsAttention);
      this._changedWS = false;
    }

    // There's a race condition; if the user released Alt before
    // we got the grab, then we won't be notified. (See
    // https://bugzilla.gnome.org/show_bug.cgi?id=596695 for
    // details.) So we check now. (Have to do this after updating
    // selection.)
    let [x, y, mods] = global.get_pointer();
    if (!(mods & this._modifierMask)) {
      this._finish();
      return false;
    }
    Tweener.addTween(this._appSwitcher.actor, {
      opacity: 255,
      time: POPUP_FADE_OUT_TIME,
      transition: 'easeInQuad'
    });

    // We delay showing the popup so that fast Alt+Tab users aren't
    // disturbed by the popup briefly flashing.
    this._initialDelayTimeoutId = Mainloop.timeout_add(
      POPUP_DELAY_TIMEOUT,
      Lang.bind(this, function() {
        this._appSwitcher.actor.opacity = 255;
        this._initialDelayTimeoutId = 0;
      })
    );

    return true;
  },

  show: function(backward, binding, mask) {
    this._thumbnailsEnabled = false;
    this._previewEnabled = true;
    if (!Main.pushModal(this.actor)) return false;
    this._haveModal = true;
    this._modifierMask = primaryModifier(mask);

    if (!this.refresh(binding, backward)) {
      return false;
    }

    this.actor.connect(
      'key-press-event',
      Lang.bind(this, this._keyPressEvent)
    );
    this.actor.connect(
      'key-release-event',
      Lang.bind(this, this._keyReleaseEvent)
    );

    this.actor.connect(
      'button-press-event',
      Lang.bind(this, this._clickedOutside)
    );
    this.actor.connect(
      'scroll-event',
      Lang.bind(this, this._onScroll)
    );

    return true;
  },

  _finish: function() {
    let showOSD = false;
    if (this._winIcons.length > 0) {
      let icon = this._winIcons[this._currentIndex];
      showOSD = icon.window.get_workspace() !== global.screen.get_active_workspace();
      if (icon.window.get_workspace() != null) Main.activateWindow(icon.window);
    }
    this.destroy();
    if (showOSD) Main.wm.showWorkspaceOSD();
  },

  _keyPressEvent: function(actor, event) {
    var switchWorkspace = (direction) => {
      if (global.screen.n_workspaces < 2) {
        return false;
      }
      let current = global.screen.get_active_workspace_index();
      let nextIndex = (global.screen.n_workspaces + current + direction) % global.screen.n_workspaces;
      global.screen.get_workspace_by_index(nextIndex).activate(global.get_current_time());
      if (current === global.screen.get_active_workspace_index()) {
        return false;
      }
      Main.wm.showWorkspaceOSD();
      this._changeWS = true;
      this.refresh('no-switch-windows');
      return true;
    };
    let keysym = event.get_key_symbol();
    let event_state = Cinnamon.get_event_state(event);
    let backwards = event_state & Clutter.ModifierType.SHIFT_MASK;
    let action = global.display.get_keybinding_action(event.get_key_code(), event_state);

    this._disableHover();
    let nRows = this._appSwitcher.thumbGrid.nRows;
    let nColumns = this._appSwitcher.thumbGrid.nColumns;
    if (keysym === Clutter.Escape) {
      this.destroy();
    } else if (action === Meta.KeyBindingAction.CLOSE) {
      this._winIcons[this._currentIndex].window.delete(global.get_current_time());
      this._checkDestroyedTimeoutId = Mainloop.timeout_add(CHECK_DESTROYED_TIMEOUT, Lang.bind(this, this._checkDestroyed, this._winIcons[this._currentIndex]));
      return false;
    } else if (keysym === Clutter.Return) {
      this._finish();
      return true;
    } else if (action === Meta.KeyBindingAction.SWITCH_WINDOWS || action === Meta.KeyBindingAction.SWITCH_GROUP || action === Meta.KeyBindingAction.SWITCH_PANELS) {
      if ((isWindows(this._oldBinding) || isPanels(this._oldBinding)) && action === Meta.KeyBindingAction.SWITCH_GROUP && !this._changedBinding) {
        this._changedBinding = true;
        this._window = this._winIcons[this._currentIndex].window;
        this.refresh('switch-group', backwards);
        return false;
      }
      this._select(backwards ? this._previousWindow() : this._nextWindow());
    } else {
      let ctrlDown = event_state & Clutter.ModifierType.CONTROL_MASK;
      if (keysym === Clutter.Left) {
        if (ctrlDown) {
          if (switchWorkspace(-1)) {
            return false;
          }
        }
        this._select(this._previousWindow());
      } else if (keysym === Clutter.Right) {
        if (ctrlDown) {
          if (switchWorkspace(1)) {
            return false;
          }
        }
        this._select(this._nextWindow());
      } else if (keysym === Clutter.Down) {
        this._select(Math.min(mod(this._currentIndex + nColumns, nColumns * nRows), this._winIcons.length - 1));
      } else if (keysym === Clutter.Up) {
        this._select(Math.min(mod(this._currentIndex - nColumns, nColumns * nRows), this._winIcons.length - 1));
      } else if (keysym === Clutter.Home) {
        this._select(0);
      } else if (keysym === Clutter.End) {
        this._select(this._winIcons.length - 1);
      }
    }

    if (this._winIcons.length > 0) this._appSwitcher.thumbGrid._setTitle(this._winIcons[this._currentIndex].label, this._winIcons[this._currentIndex]._demandsAttention);
    return true;
  }
};

function AppIcon(window) {
  this._init(window);
}

AppIcon.prototype = {
  _init: function(window) {
    this.window = window;
    let tracker = Cinnamon.WindowTracker.get_default();
    this.app = tracker.get_window_app(window);
    this.actor = new St.BoxLayout({
      style_class: 'alt-tab-app',
      vertical: true
    });
    this.icon = null;
    this._iconBin = new St.Bin();

    this.actor.add(this._iconBin, {x_fill: false, y_fill: false});
    this.label = window.get_title() || (this.app ? this.app.get_name() : ' ');
    this._demandsAttention = window.is_urgent && (window.is_demanding_attention() || window.is_urgent());
    this.win = window.get_compositor_private().get_texture();
    let [width, height] = this.win.get_size();
    this.set_scale(width, height);
    this.set_size(Math.round(Math.max(width, height) * this.scale));
  },

  set_scale: function(width, height) {
    let monitor = Main.layoutManager.primaryMonitor;
    this.scale = Math.min(1.0, (monitor.width * THUMBNAIL_SCALE) / width, (monitor.height * THUMBNAIL_SCALE) / height);
  },

  resize: function(size) {
    this.icon = new St.Group();
    let clones = createWindowClone(this.window, size, true, true);
    for (let i in clones) {
      let clone = clones[i];
      this.icon.add_actor(clone.actor);
      clone.actor.set_position(clone.x, clone.y);
    }
    this._iconBin.set_size(size, size);
    this._iconBin.child = this.icon;
  },

  set_size: function(size) {
    this.resize(size);
    let iconSize = 32;
    let iconOverlap = 3;

    let [width, height] = this.getSize();
    if (this.icon.get_children().length > 1) {
      this.set_scale(width / this.scale, height / this.scale);
      this.resize(Math.round(Math.max(this.win.width, this.win.height) * this.scale));
      [width, height] = this.getSize();
    }
    let iconLeft = width - (iconSize - iconOverlap);
    let iconTop = height - (iconSize - iconOverlap);

    if (this._appIcon) {
      this.actor.remove(this._appIcon);
      this._appIcon.destroy();
    }

    this._appIcon = this.app
      ? this.window.minimized
        ? this.app.get_faded_icon(iconSize)
        : this.app.create_icon_texture(iconSize)
      : new St.Icon({
          icon_name: 'application-default-icon',
          icon_type: St.IconType.FULLCOLOR,
          icon_size: iconSize
        });
    this._appIcon.set_position(iconLeft, iconTop);
    this.actor.add(this._appIcon);
    this._iconBin.set_size(width, height);
  },

  getSize: function() {
    let children = this.icon.get_children();
    if (children.length < 1) {
      return [this.icon.width, this.icon.height];
    }
    let [width, height] = [1, 1];
    for (let i = 0; i < children.length; i++) {
      width = Math.max(width, children[i].width + children[i].x);
      height = Math.max(height, children[i].height + children[i].y);
    }
    width = Math.ceil(width);
    height = Math.ceil(height);
    return [width, height];
  }
};

function AppSwitcher() {
  this._init.apply(this, arguments);
}

AppSwitcher.prototype = {
  _init: function(windows, altTabPopup) {
    this.actor = new Cinnamon.GenericContainer({style_class: 'switcher-list'});
    this.actor.connect(
      'get-preferred-width',
      Lang.bind(this, this._getPreferredWidth)
    );
    this.actor.connect(
      'get-preferred-height',
      Lang.bind(this, this._getPreferredHeight)
    );
    this.actor.connect(
      'allocate',
      Lang.bind(this, this._allocate)
    );

    this._clipBin = new St.Bin({style_class: 'cbin'});
    this.actor.add_actor(this._clipBin);

    this._items = [];
    this._highlighted = -1;
    this._minSize = 0;
    this._scrollableRight = true;
    this._scrollableLeft = false;

    let thumbnails = [];
    for (let i = 0; i < windows.length; i++) {
      let thumb = new AppIcon(windows[i]);
      thumbnails.push(thumb);
    }

    this.icons = [];

    this.thumbGrid = new ThumbnailGrid({colLimit: 6, rowLimit: 3, spacing: 0});

    this._scrollableRight = false;
    this._clipBin.child = this.thumbGrid.actor;

    for (let i = 0; i < thumbnails.length; i++) this._addThumbnail(thumbnails[i]);

    this._iconSize = 0;
    this._altTabPopup = altTabPopup;
    this._tracker = Cinnamon.WindowTracker.get_default();
    this._windowManager = global.window_manager;
  },

  _allocate: function(actor, box, flags) {
    this._clipBin.allocate(box, flags);
  },

  _onItemClicked: function(index) {
    this._itemActivated(index);
  },

  _onItemEnter: function(index) {
    this._itemEntered(index);
  },

  _itemActivated: function(n) {
    this.emit('item-activated', n);
  },

  _itemEntered: function(n) {
    this.emit('item-entered', n);
  },

  _addThumbnail: function(winIcon) {
    this.icons.push(winIcon);
    this.addItem(winIcon.actor, winIcon.label);
  },

  addItem: function(item, label) {
    let bbox = new St.Button({
      style_class: 'item-box',
      reactive: true,
      x_align: St.Align.MIDDLE,
      y_align: St.Align.MIDDLE,
      label: label
    });

    bbox.set_child(item);

    let n = this._items.length;
    bbox.connect(
      'clicked',
      Lang.bind(this, function() {
        this._onItemClicked(n);
      })
    );
    bbox.connect(
      'enter-event',
      Lang.bind(this, function() {
        this._onItemEnter(n);
      })
    );

    this.thumbGrid.addItem(bbox);
    this._items.push(bbox);
  },

  highlight: function(index) {
    if (this._highlighted !== -1 && this._items[this._highlighted]) {
      //this._items[this._highlighted].remove_style_pseudo_class('outlined');
      this._items[this._highlighted].remove_style_pseudo_class('selected');
    }

    this._highlighted = index;

    if (this._highlighted !== -1) {
      //this._items[this._highlighted].add_style_pseudo_class('outlined');
      this._items[this._highlighted].add_style_pseudo_class('selected');
    }
    //Add scrolling here later on
  },

  _getColLimit: function() {
    this.thumbGrid._calcTSize();
    let node = this._altTabPopup.actor.get_theme_node();
    this.padFactor = node.get_horizontal_padding() + node.get_length('spacing');
    return this.thumbGrid._computeLayout(global.screen_width - this.padFactor)[0];
  },

  _getRowLimit: function() {
    this.thumbGrid._calcTSize();
    let node = this._altTabPopup.actor.get_theme_node();
    this.padFactor = node.get_vertical_padding() + node.get_length('spacing');
    return this.thumbGrid._computeLayout(global.screen_height - this.padFactor)[1];
  },

  _getPreferredWidth: function(actor, forHeight, alloc) {
    let colLimit = this._getColLimit();
    this.thumbGrid.colLimit = colLimit;
    let nColumns = Math.min(colLimit, this.thumbGrid._getVisibleChildren().length);
    alloc.natural_size = alloc.min_size = nColumns * this.thumbGrid.tWidth + Math.max(0, nColumns - 1) * this.thumbGrid.spacing + this.padFactor;
  },

  _getPreferredHeight: function(actor, forWidth, alloc) {
    let colLimit = this._getColLimit();
    let rowLimit = this.thumbGrid.rowLimit;
    let nRows = Math.min(rowLimit, Math.ceil(this.thumbGrid._getVisibleChildren().length / colLimit));
    alloc.natural_size = alloc.min_size =
      this.thumbGrid.tHeight * nRows + this.thumbGrid.spacing * Math.max(nRows - 1, 0) + this.thumbGrid.titleLabel.height + this._altTabPopup.actor.get_theme_node().get_vertical_padding();
  },

  _enterItem: function(index) {
    let [x, y, mask] = global.get_pointer();
    let pickedActor = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);
    if (this._items[index].contains(pickedActor)) this._itemEntered(index);
  }
};
Signals.addSignalMethods(AppSwitcher.prototype);

function startTab(display, screen, window, binding) {
  let modifiers = binding.get_modifiers();
  let backwards = modifiers & Meta.VirtualModifier.SHIFT_MASK;
  let tabPopup = new AltTabPopup();
  if (!tabPopup.show(backwards, binding.get_name(), binding.get_mask())) tabPopup.destroy();
}

function init() {}

function enable() {
  Meta.keybindings_set_custom_handler('switch-applications', startTab);
  Meta.keybindings_set_custom_handler('switch-windows', startTab);
  Meta.keybindings_set_custom_handler('switch-group', startTab);
  Meta.keybindings_set_custom_handler('switch-panels', startTab);
  Meta.keybindings_set_custom_handler('switch-applications-backward', startTab);
  Meta.keybindings_set_custom_handler('switch-windows-backward', startTab);
  Meta.keybindings_set_custom_handler('switch-group-backward', startTab);
}

function disable() {
  Meta.keybindings_set_custom_handler('switch-applications', Lang.bind(Main.wm, Main.wm._startAppSwitcher));
  Meta.keybindings_set_custom_handler('switch-windows', Lang.bind(Main.wm, Main.wm._startAppSwitcher));
  Meta.keybindings_set_custom_handler('switch-group', Lang.bind(Main.wm, Main.wm._startAppSwitcher));
  Meta.keybindings_set_custom_handler('switch-panels', Lang.bind(Main.wm, Main.wm._startA11ySwitcher));
  Meta.keybindings_set_custom_handler('switch-applications-backward', Lang.bind(Main.wm, Main.wm._startAppSwitcher));
  Meta.keybindings_set_custom_handler('switch-windows-backward', Lang.bind(Main.wm, Main.wm._startAppSwitcher));
  Meta.keybindings_set_custom_handler('switch-group-backward', Lang.bind(Main.wm, Main.wm._startAppSwitcher));
}
