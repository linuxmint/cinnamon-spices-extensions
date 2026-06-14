// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Cinnamon = imports.gi.Cinnamon;
const Meta = imports.gi.Meta;
const Lang = imports.lang;
const Pango = imports.gi.Pango;

const Main = imports.ui.main;
const BaseAppSwitcher = imports.ui.appSwitcher.appSwitcher;
const ClassicSwitcherModule = imports.ui.appSwitcher.classicSwitcher;

const WindowUtils = imports.misc.windowUtils;

const PREVIEW_HEIGHT = 120;
const MIN_PREVIEW_WIDTH = 170;
const MAX_PREVIEW_WIDTH = 330;
const MAX_LIST_WIDTH_RATIO = 0.9;

function WindowsAppIcon(window, showThumbnail) {
  this._init(window, showThumbnail);
}

WindowsAppIcon.prototype = {
  _init: function (window, showThumbnail) {
    this.window = window;
    this.showThumbnail = showThumbnail;

    let tracker = Cinnamon.WindowTracker.get_default();
    this.app = tracker.get_window_app(window);

    this.actor = new St.BoxLayout({
      style_class: "alt-tab-app windows-alt-tab-app",
      vertical: true,
    });

    this.icon = null;

    this._infoBox = new St.BoxLayout({
      style_class: "windows-alt-tab-info-box",
      vertical: false,
    });

    this._appIconBin = new St.Bin({
      x_align: St.Align.START,
      y_align: St.Align.MIDDLE,
    });

    this._smallAppIcon = this.app
      ? this.app.create_icon_texture(18)
      : new St.Icon({
          icon_name: "application-default-icon",
          icon_type: St.IconType.FULLCOLOR,
          icon_size: 18,
        });

    this._appIconBin.set_child(this._smallAppIcon);

    let title = window.get_title();
    this.label = new St.Label({
      style_class: "windows-alt-tab-title",
      text: title || (this.app ? this.app.get_name() : window.title),
      y_align: Clutter.ActorAlign.CENTER,
    });
    this.label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    this.label.clutter_text.single_line_mode = true;

    this._infoBox.add(this._appIconBin, {
      x_fill: false,
      y_fill: false,
    });

    this._infoBox.add(this.label, {
      x_fill: true,
      y_fill: false,
      expand: true,
    });

    this._iconBin = new St.Bin({
      style_class: "windows-alt-tab-preview-bin",
      x_align: St.Align.START,
      y_align: St.Align.MIDDLE,
    });

    this.actor.add(this._infoBox, {
      x_fill: true,
      y_fill: false,
      expand: true,
    });

    this.actor.add(this._iconBin, {
      x_fill: true,
      y_fill: false,
      expand: true,
    });

    if (window.minimized) {
      let contrastEffect = new Clutter.BrightnessContrastEffect();
      contrastEffect.set_brightness_full(-0.5, -0.5, -0.5);
      this.actor.add_effect(contrastEffect);
    }
  },

  set_size: function (size) {
    this.icon = new St.Widget({
      layout_manager: new Clutter.BinLayout(),
      clip_to_allocation: true,
    });

    let frame = this.window.get_frame_rect();
    let ratio = frame.height > 0 ? frame.width / frame.height : 1.6;
    ratio = Math.max(0.6, Math.min(2.5, ratio));

    let previewHeight = Math.round(PREVIEW_HEIGHT * global.ui_scale);
    let previewWidth = Math.round(previewHeight * ratio);
    previewWidth = Math.max(
      Math.round(MIN_PREVIEW_WIDTH * global.ui_scale),
      Math.min(previewWidth, Math.round(MAX_PREVIEW_WIDTH * global.ui_scale)),
    );

    let clones = WindowUtils.createWindowClone(
      this.window,
      previewWidth,
      previewHeight,
      true,
      true,
    );

    for (let i in clones) {
      let clone = clones[i];
      this.icon.add_actor(clone.actor);
      clone.actor.set_position(clone.x, clone.y);
    }

    this._iconBin.set_size(previewWidth, previewHeight);
    this._iconBin.child = this.icon;

    this.label.clutter_text.set_width(Math.max(80, previewWidth - 34));
  },
};

function WindowsAppList() {
  this._init.apply(this, arguments);
}

WindowsAppList.prototype = {
  __proto__: ClassicSwitcherModule.AppList.prototype,

  _init: function (windows, showThumbnails, activeMonitor) {
    ClassicSwitcherModule.SwitcherList.prototype._init.call(
      this,
      false,
      activeMonitor,
    );

    let workspaceIcons = [];
    for (let i = 0; i < windows.length; i++) {
      workspaceIcons.push(new WindowsAppIcon(windows[i], showThumbnails));
    }

    this.icons = [];
    for (let i = 0; i < workspaceIcons.length; i++) {
      this._addIcon(workspaceIcons[i]);
    }

    this._curApp = -1;
    this._iconSize = 0;
    this._mouseTimeOutId = 0;
    this._activeMonitor = activeMonitor;
  },

  // Sobrescreve para interceptar o clique com o botão do meio: ao invés de
  // deixar o evento subir até o actor do switcher (que chama destroy e fecha
  // o alt+tab), fecha apenas a janela daquele item e para a propagação.
  // O Cinnamon trata a destruição da janela em _removeDestroyedWindow,
  // reconstruindo a lista (ou fechando o switcher se era a última janela).
  _addIcon: function (appIcon) {
    this.icons.push(appIcon);
    this.addItem(appIcon.actor, appIcon.label);

    let bbox = this._items[this._items.length - 1];
    bbox.connect(
      "button-press-event",
      Lang.bind(this, function (actor, event) {
        let button = event.get_button();

        // Botão do meio: fecha a janela daquele item (igual ao "X"),
        // sem fechar o alt+tab.
        if (button === Clutter.BUTTON_MIDDLE) {
          if (appIcon.window) {
            appIcon.window.delete(global.get_current_time());
          }
          return Clutter.EVENT_STOP;
        }

        // Botão direito: abre o menu de janela do Cinnamon (o mesmo da barra
        // de título: minimizar, maximizar, mover, fechar, etc.), posicionado
        // sobre a miniatura. O menu empilha seu próprio grab modal por cima do
        // grab do switcher, então o alt+tab continua aberto.
        if (button === Clutter.BUTTON_SECONDARY) {
          if (appIcon.window) {
            let [x, y] = actor.get_transformed_position();
            let [w, h] = actor.get_transformed_size();
            let rect = new Meta.Rectangle({
              x: Math.round(x),
              y: Math.round(y),
              width: Math.round(w),
              height: Math.round(h),
            });
            Main.wm._windowMenuManager.showWindowMenuForWindow(
              appIcon.window,
              Meta.WindowMenuType.WM,
              rect,
            );
          }
          return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
      }),
    );
  },

  _ensureIconsSized: function () {
    this._iconSize = 96;
    for (let i = 0; i < this.icons.length; i++) {
      if (this.icons[i].icon !== null) continue;
      this.icons[i].set_size(this._iconSize);
    }
  },

  // Distribui os itens em linhas, quebrando quando a largura passar do
  // limite (90% da largura do monitor). Retorna { rows, width, height } com a
  // largura/altura totais já considerando o espaçamento entre itens e linhas.
  _computeRows: function () {
    let spacing = this._list.spacing > -1 ? this._list.spacing : 10;
    // Usa o monitor onde o alt+tab está sendo exibido (não necessariamente o
    // primário). _activeMonitor é o objeto de geometria do monitor ativo.
    let monitor =
      this._activeMonitor || Main.layoutManager.primaryMonitor;
    let maxWidth = monitor
      ? Math.round(monitor.width * MAX_LIST_WIDTH_RATIO)
      : Math.round(1700 * global.ui_scale);

    let rows = [];
    let current = { items: [], width: 0, height: 0 };

    for (let i = 0; i < this._items.length; i++) {
      let [, childNatW] = this._items[i].get_preferred_width(-1);
      let [, childNatH] = this._items[i].get_preferred_height(childNatW);

      let extra = current.items.length > 0 ? spacing : 0;
      if (
        current.items.length > 0 &&
        current.width + extra + childNatW > maxWidth
      ) {
        rows.push(current);
        current = { items: [], width: 0, height: 0 };
        extra = 0;
      }

      current.items.push({ child: this._items[i], width: childNatW, height: childNatH });
      current.width += extra + childNatW;
      current.height = Math.max(current.height, childNatH);
    }

    if (current.items.length > 0) rows.push(current);

    let width = 0;
    let height = 0;
    for (let r = 0; r < rows.length; r++) {
      width = Math.max(width, rows[r].width);
      height += rows[r].height;
    }
    height += spacing * Math.max(0, rows.length - 1);

    return { rows: rows, width: width, height: height };
  },

  _getPreferredWidth: function (actor, forHeight, alloc) {
    if (this._items.length < 1) {
      alloc.min_size = 32;
      alloc.natural_size = 32;
      return;
    }

    this._ensureIconsSized();

    let layout = this._computeRows();
    this._minSize = layout.width;
    alloc.min_size = layout.width;
    alloc.natural_size = layout.width;
  },

  _getPreferredHeight: function (actor, forWidth, alloc) {
    if (this._items.length < 1) {
      alloc.min_size = alloc.natural_size = 32;
      return;
    }

    this._ensureIconsSized();

    let layout = this._computeRows();
    alloc.min_size = layout.height;
    alloc.natural_size = layout.height;
  },

  _allocate: function (actor, box, flags) {
    let spacing = this._list.spacing > -1 ? this._list.spacing : 10;
    let childBox = new Clutter.ActorBox();

    let layout = this._computeRows();
    let availableWidth = box.x2 - box.x1;
    let y = 0;

    for (let r = 0; r < layout.rows.length; r++) {
      let row = layout.rows[r];
      let x = Math.max(0, Math.floor((availableWidth - row.width) / 2));

      for (let i = 0; i < row.items.length; i++) {
        let item = row.items[i];
        let itemY = y + Math.max(0, Math.floor((row.height - item.height) / 2));

        childBox.x1 = x;
        childBox.y1 = itemY;
        childBox.x2 = x + item.width;
        childBox.y2 = itemY + item.height;
        item.child.allocate(childBox, flags);

        x += item.width + spacing;
      }

      y += row.height + spacing;
    }

    let leftPadding = this.actor.get_theme_node().get_padding(St.Side.LEFT);
    let rightPadding = this.actor.get_theme_node().get_padding(St.Side.RIGHT);
    let topPadding = this.actor.get_theme_node().get_padding(St.Side.TOP);
    let bottomPadding = this.actor.get_theme_node().get_padding(St.Side.BOTTOM);

    this._clipBin.set_clip(
      0,
      -topPadding,
      this.actor.allocation.x2 -
        this.actor.allocation.x1 -
        leftPadding -
        rightPadding,
      this.actor.height + bottomPadding,
    );
  },
};

function WindowsClassicSwitcher() {
  this._init.apply(this, arguments);
}

WindowsClassicSwitcher.prototype = {
  __proto__: ClassicSwitcherModule.ClassicSwitcher.prototype,

  _updateList: function (direction) {
    if (direction !== 0) return;

    if (this._appList) {
      if (this._applist_act_id !== 0) {
        this._appList.disconnect(this._applist_act_id);
        this._applist_act_id = 0;
      }

      if (this._applist_enter_id !== 0) {
        this._appList.disconnect(this._applist_enter_id);
        this._applist_enter_id = 0;
      }

      this._clearPreview();
      this._destroyThumbnails();
      this.actor.remove_actor(this._appList.actor);
      this._appList.actor.destroy();
    }

    this._appList = new WindowsAppList(
      this._windows,
      this._showThumbnails,
      this._activeMonitor,
    );
    this._appList.actor.add_style_class_name("windows-switcher-list");
    this.actor.add_actor(this._appList.actor);

    if (!this._iconsEnabled && !this._thumbnailsEnabled) {
      this._appList.actor.hide();
    }

    this._applist_act_id = this._appList.connect(
      "item-activated",
      Lang.bind(this, this._appActivated),
    );
    this._applist_enter_id = this._appList.connect(
      "item-entered",
      Lang.bind(this, this._appEntered),
    );

    this._appIcons = this._appList.icons;
    this.actor.get_allocation_box();
  },

  _appActivated: function (appSwitcher, n) {
    this._select(n);
    this._activateSelected();
  },

  _appEntered: function (appSwitcher, n) {
    if (!this._mouseActive) return;
    this._select(n);
  },
};

function getWindowsForBinding(binding) {
  return BaseAppSwitcher.getWindowsForBinding(binding);
}
