// Adds a tiling section to the window (titlebar right-click / Alt+Space) menu:
// clickable layout thumbnails plus "best tile", "leftmost/rightmost empty
// tile" and "untile" actions.

const St = imports.gi.St;
const PopupMenu = imports.ui.popupMenu;
const WindowMenu = imports.ui.windowMenu;
const Me = imports.ui.extension.getCurrentExtension();
const U = Me.imports.lib.utils;
const _ = U._;
const W = Me.imports.lib.widgets;

const PER_ROW = 4;

var WindowMenuPatch = class WindowMenuPatch {
    constructor(controller) {
        this._c = controller;
        const proto = WindowMenu.WindowMenu.prototype;
        this._orig = proto._buildMenu;
        const self = this;
        proto._buildMenu = function (window) {
            self._orig.call(this, window);
            if (!self._c.settings.get('override-window-menu'))
                return;
            try {
                self._extend(this, window);
            } catch (e) {
                U.logError(e, 'window menu');
            }
        };
    }

    _extend(menu, win) {
        if (!U.isTileable(win))
            return;
        const tm = this._c.tiling;
        const mon = win.get_monitor();
        const items = menu._getMenuItems();
        let pos = Math.max(0, items.length - 2);
        const add = item => menu.addMenuItem(item, pos++);

        add(new PopupMenu.PopupSeparatorMenuItem());

        const grid = new St.BoxLayout({ vertical: true, style_class: 'tiling-window-menu-grid' });
        let row = null;
        this._c.layouts.forEach((layout, i) => {
            if (i % PER_ROW === 0) {
                row = new St.BoxLayout({ vertical: false, style_class: 'tiling-window-menu-row' });
                grid.add_child(row);
            }
            const thumb = new W.LayoutThumbnail(layout, 64, 38, {
                buttons: true,
                gap: 2,
                styleClass: 'tiling-thumb tiling-window-menu-thumb',
                onTileClicked: tile => {
                    menu.close();
                    U.idle(() => tm.tileWindow(win, tile, mon));
                },
            });
            row.add_child(thumb.actor);
        });
        const gridItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        gridItem.addActor(grid);
        add(gridItem);

        const action = (text, icon, cb) => {
            const it = new PopupMenu.PopupIconMenuItem(text, icon, St.IconType.SYMBOLIC);
            it.connect('activate', () => U.idle(cb));
            add(it);
        };
        const empties = () => tm.emptyTiles(mon, win).slice().sort((a, b) => a.x - b.x || a.y - b.y);
        action(_('Move to best tile'), 'view-grid-symbolic', () => {
            const t = tm.bestTile(mon, win) || this._c.layoutFor(mon).tiles[0];
            tm.tileWindow(win, t, mon);
        });
        action(_('Tile to leftmost empty tile'), 'go-first-symbolic', () => {
            const e = empties();
            if (e.length)
                tm.tileWindow(win, e[0], mon);
        });
        action(_('Tile to rightmost empty tile'), 'go-last-symbolic', () => {
            const e = empties();
            if (e.length) {
                const maxX = Math.max(...e.map(t => t.x + t.width));
                tm.tileWindow(win, e.filter(t => Math.abs(t.x + t.width - maxX) < U.EPS)[0], mon);
            }
        });
        if (tm.isTiled(win))
            action(_('Untile'), 'view-restore-symbolic', () => tm.untileWindow(win));
    }

    destroy() {
        WindowMenu.WindowMenu.prototype._buildMenu = this._orig;
    }
};
