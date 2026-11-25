// Panel indicator (shows the current layout, lets you pick a layout per
// monitor and opens the editor / import / export / settings) and the
// layout-switch OSD.

const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Me = imports.ui.extension.getCurrentExtension();
const U = Me.imports.lib.utils;
const _ = U._;
const W = Me.imports.lib.widgets;

const COLUMNS = 3;

function panelSide(panel) {
    switch (panel ? panel.panelPosition : 0) {
    case 1: return St.Side.BOTTOM;
    case 2: return St.Side.LEFT;
    case 3: return St.Side.RIGHT;
    default: return St.Side.TOP;
    }
}

var Indicator = class Indicator {
    constructor(controller) {
        this._c = controller;
        this._target = -1; // -1 = all monitors
        this._panel = Main.panel || (Main.panelManager && Main.panelManager.panels.find(p => p));
        if (!this._panel)
            throw new Error('no panel found');
        this.actor = new St.Button({ style_class: 'applet-box tiling-indicator', reactive: true, track_hover: true, can_focus: true });
        this.actor._delegate = this;
        this._iconBin = new St.Bin({ y_align: Clutter.ActorAlign.CENTER });
        this.actor.set_child(this._iconBin);
        this._panel._rightBox.insert_child_at_index(this.actor, 0);

        this.menu = new PopupMenu.PopupMenu(this.actor, panelSide(this._panel));
        this.menu.actor.add_style_class_name('tiling-indicator-menu');
        Main.uiGroup.add_child(this.menu.actor);
        this.menu.actor.hide();
        this._manager = new PopupMenu.PopupMenuManager(this);
        this._manager.addMenu(this.menu);

        this.actor.connect('clicked', () => {
            if (!this.menu.isOpen)
                this._rebuildMenu();
            this.menu.toggle();
        });
        this._destroyId = this.actor.connect('destroy', () => {
            this.actor = null;
        });
        this.refresh();
    }

    refresh() {
        if (!this.actor)
            return;
        const p = U.pointer();
        const mon = this._target >= 0 ? this._target : U.monitorAt(p.x, p.y);
        const layout = this._c.layoutFor(mon);
        const old = this._iconBin.get_child();
        if (old)
            old.destroy();
        const vertical = this._panel.panelPosition >= 2;
        const thumb = new W.LayoutThumbnail(layout, vertical ? 20 : 26, vertical ? 14 : 16, {
            styleClass: 'tiling-indicator-icon', tileStyleClass: 'tiling-indicator-icon-tile', gap: 1.5,
        });
        this._iconBin.set_child(thumb.actor);
    }

    _rebuildMenu() {
        this.menu.removeAll();
        const mons = U.monitors();

        const header = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        header.addActor(new St.Label({ text: _('Tiling layouts'), style_class: 'tiling-menu-header' }));
        this.menu.addMenuItem(header);

        if (mons.length > 1) {
            const row = new St.BoxLayout({ style_class: 'tiling-monitor-row' });
            const mk = (label, idx) => {
                const b = new St.Button({ label, style_class: 'tiling-monitor-button', toggle_mode: true, reactive: true, track_hover: true });
                b.checked = this._target === idx;
                b.connect('clicked', () => {
                    this._target = idx;
                    this._rebuildMenu();
                });
                row.add_child(b);
            };
            mk(_('All monitors'), -1);
            mons.forEach((m, i) => mk(_('Monitor %d').format(i + 1), i));
            const item = new PopupMenu.PopupBaseMenuItem({ reactive: false });
            item.addActor(row);
            this.menu.addMenuItem(item);
        }

        const currentMon = this._target >= 0 ? this._target : Main.layoutManager.primaryIndex;
        const currentId = this._c.layoutFor(currentMon).id;
        const grid = new St.BoxLayout({ vertical: true, style_class: 'tiling-layout-grid' });
        let row = null;
        this._c.layouts.forEach((layout, i) => {
            if (i % COLUMNS === 0) {
                row = new St.BoxLayout({ vertical: false, style_class: 'tiling-layout-row' });
                grid.add_child(row);
            }
            const btn = new St.Button({ style_class: 'tiling-layout-button', reactive: true, can_focus: true, track_hover: true, toggle_mode: false });
            const box = new St.BoxLayout({ vertical: true });
            const thumb = new W.LayoutThumbnail(layout, 84, 50, { gap: 2.5 });
            box.add_child(thumb.actor);
            box.add_child(new St.Label({ text: layout.id, style_class: 'tiling-layout-name', x_align: Clutter.ActorAlign.CENTER }));
            btn.set_child(box);
            if (layout.id === currentId)
                btn.add_style_pseudo_class('checked');
            btn.connect('clicked', () => {
                this._c.setLayout(this._target, layout.id);
                this.menu.close();
            });
            row.add_child(btn);
        });
        const gridItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        gridItem.addActor(grid);
        this.menu.addMenuItem(gridItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const action = (text, icon, cb) => {
            const it = new PopupMenu.PopupIconMenuItem(text, icon, St.IconType.SYMBOLIC);
            it.connect('activate', () => {
                this.menu.close();
                U.idle(cb);
            });
            this.menu.addMenuItem(it);
        };
        action(_('Edit current layout'), 'document-edit-symbolic', () => this._c.openEditor(currentId, currentMon));
        action(_('New layout'), 'list-add-symbolic', () => this._c.newLayout(currentMon));
        action(_('Import layouts…'), 'document-open-symbolic', () => this._c.importLayouts());
        action(_('Export layouts…'), 'document-save-symbolic', () => this._c.exportLayouts());
        action(_('Settings'), 'preferences-system-symbolic', () => this._c.openSettings());
    }

    destroy() {
        if (this.menu) {
            this.menu.close();
            this._manager.removeMenu(this.menu);
            this.menu.destroy();
            this.menu = null;
        }
        if (this.actor) {
            this.actor.disconnect(this._destroyId);
            this.actor.destroy();
            this.actor = null;
        }
    }
};

// Brief popup listing layouts with the newly selected one highlighted.
var LayoutOsd = class LayoutOsd {
    constructor(controller) {
        this._c = controller;
        this.actor = null;
        this._timer = 0;
    }

    show(monitorIndex, layoutId) {
        this._timer = U.removeSource(this._timer);
        if (this.actor)
            this.actor.destroy();
        this.actor = new St.BoxLayout({ style_class: 'tiling-layout-osd', vertical: true, reactive: false });
        const row = new St.BoxLayout({ vertical: false, style_class: 'tiling-layout-osd-row' });
        for (const l of this._c.layouts) {
            const wrap = new St.Bin({ style_class: 'tiling-layout-osd-item' });
            wrap.set_child(new W.LayoutThumbnail(l, 84, 50, { gap: 2.5 }).actor);
            if (l.id === layoutId)
                wrap.add_style_pseudo_class('checked');
            row.add_child(wrap);
        }
        this.actor.add_child(row);
        this.actor.add_child(new St.Label({ text: layoutId, style_class: 'tiling-layout-osd-label', x_align: Clutter.ActorAlign.CENTER }));
        Main.uiGroup.add_child(this.actor);
        const wa = U.workArea(monitorIndex);
        const [, w] = this.actor.get_preferred_width(-1);
        const [, h] = this.actor.get_preferred_height(w);
        this.actor.set_position(Math.round(wa.x + (wa.width - w) / 2), Math.round(wa.y + (wa.height - h) / 2));
        this.actor.opacity = 0;
        U.ease(this.actor, { opacity: 255, duration: 120 });
        const a = this.actor;
        this._timer = U.timeout(1100, () => {
            this._timer = 0;
            U.ease(a, {
                opacity: 0, duration: 250, onComplete: () => {
                    a.destroy();
                    if (this.actor === a)
                        this.actor = null;
                },
            });
        });
    }

    destroy() {
        this._timer = U.removeSource(this._timer);
        if (this.actor)
            this.actor.destroy();
        this.actor = null;
    }
};
