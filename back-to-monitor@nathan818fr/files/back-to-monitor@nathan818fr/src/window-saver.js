const Meta = imports.gi.Meta;
const {globalLogger: logger} = require('src/logger');

const META_MAXIMIZE_HORIZONTAL = Meta.MaximizeFlags.HORIZONTAL;
const META_MAXIMIZE_VERTICAL = Meta.MaximizeFlags.VERTICAL;

const META_TILE_NONE = Meta.TileMode.NONE;
const META_TILE_LEFT = Meta.TileMode.LEFT;
const META_TILE_RIGHT = Meta.TileMode.RIGHT;
const META_TILE_ULC = Meta.TileMode.ULC;
const META_TILE_LLC = Meta.TileMode.LLC;
const META_TILE_URC = Meta.TileMode.URC;
const META_TILE_LRC = Meta.TileMode.LRC;
const META_TILE_TOP = Meta.TileMode.TOP;
const META_TILE_BOTTOM = Meta.TileMode.BOTTOM;
const META_TILE_MAXIMIZE = Meta.TileMode.MAXIMIZE;

class WindowSaverBase {
    constructor(version) {
        this.version = version;
    }

    save(metaWindow) {
        const frameRect = this._getFrameRect(metaWindow);
        const workspace = metaWindow.get_workspace();
        const tile = this._saveTile(metaWindow);

        return {
            x: frameRect.x,
            y: frameRect.y,
            width: frameRect.width,
            height: frameRect.height,
            minimized: metaWindow.minimized,
            maximized: {
                horizontally: metaWindow.maximized_horizontally,
                vertically: metaWindow.maximized_vertically,
            },
            tile,
            fullscreen: metaWindow.fullscreen,
            workspace: workspace ? workspace.index() : -1,
            onAllWorkspaces: false, // MetaWindow.on_all_workspaces_requested is not accessible
        };
    }

    restore(metaWindow, state, monitorRect) {
        if (!this._supportsFullscreen() && (metaWindow.fullscreen || state.fullscreen)) {
            // Fullscreen is not supported, skip this window
            return;
        }

        if (state.minimized) {
            // Minimize first if needed
            metaWindow.minimize();
        }

        // Always unfullscreen, untile & unmaximize (otherwise move is impossible)
        if (metaWindow.fullscreen) {
            this._unmakeFullscreen(metaWindow);
        }
        this._untile(metaWindow);
        metaWindow.unmaximize(META_MAXIMIZE_HORIZONTAL | META_MAXIMIZE_VERTICAL);

        // FIX: Force-move the window; this prevent many strange placement bugs
        // (-32768 is arbitrary: need a value that is not the current one nor the state one)
        metaWindow.move_frame(false, -32768, -32768);

        // Move back to the correct monitor
        if ((state.maximized.horizontally && state.maximized.vertically) || state.tile || state.fullscreen) {
            // If it's a full-maximize/tile/fullscreen, only move (to keep the saved width & height)
            const frameRect = this._getFrameRect(metaWindow);
            metaWindow.move_frame(
                true,
                monitorRect.x + Math.floor(monitorRect.width / 2) - Math.floor(frameRect.width / 2),
                monitorRect.y + Math.floor(monitorRect.height / 2) - Math.floor(frameRect.height / 2)
            );
        } else {
            // ... otherwise immediately move & resize correctly
            metaWindow.move_resize_frame(true, state.x, state.y, state.width, state.height);
        }

        // Change workspace (before maximize, tile & fullscreen)
        if (state.onAllWorkspaces === true) {
            this._changeWorkspaceByIndex(metaWindow, -1, false);
        } else if (state.workspace !== -1) {
            this._changeWorkspaceByIndex(metaWindow, state.workspace, false);
        }

        if (state.maximized.horizontally || state.maximized.vertically) {
            // Maximize if needed
            metaWindow.maximize(
                (state.maximized.horizontally ? META_MAXIMIZE_HORIZONTAL : 0) |
                    (state.maximized.vertically ? META_MAXIMIZE_VERTICAL : 0)
            );
        }

        if (state.tile) {
            // Tile if needed
            this._retile(metaWindow, state.tile);
        }

        if (state.fullscreen) {
            // Fullscreen if needed
            this._makeFullscreen(metaWindow);
        }

        if (!state.minimized) {
            // Unminimize at end if needed
            metaWindow.unminimize();
        }
    }

    /**
     * @abstract
     */
    isInside(metaWindow, monitorRect, monitorIndex) {
        throw new Error('not implemented');
    }

    /**
     * @abstract
     */
    allowsMove(metaWindow) {
        throw new Error('not implemented');
    }

    /**
     * @abstract
     */
    _getFrameRect(metaWindow) {
        throw new Error('not implemented');
    }

    /**
     * @abstract
     */
    _untile(metaWindow) {
        throw new Error('not implemented');
    }

    /**
     * @abstract
     */
    _retile(metaWindow, tileState) {
        throw new Error('not implemented');
    }

    /**
     * @abstract
     */
    _saveTile(metaWindow) {
        throw new Error('not implemented');
    }

    /**
     * @abstract
     */
    _supportsFullscreen() {
        throw new Error('not implemented');
    }

    /**
     * @abstract
     */
    _makeFullscreen(metaWindow) {
        throw new Error('not implemented');
    }

    /**
     * @abstract
     */
    _unmakeFullscreen(metaWindow) {
        throw new Error('not implemented');
    }

    /**
     * @abstract
     */
    _changeWorkspaceByIndex(metaWindow, workspaceIndex, append) {
        throw new Error('not implemented');
    }
}

class WindowSaver4_8 extends WindowSaverBase {
    constructor() {
        super('4.8<>5.2');
        this.MetaWindowTileTypeNone = Meta.WindowTileType.NONE;
        this.MetaWindowTileTypeTiled = Meta.WindowTileType.TILED;
        this.MetaWindowTileTypeSnapped = Meta.WindowTileType.SNAPPED;
    }

    isInside(metaWindow, monitorRect, monitorIndex) {
        return metaWindow.get_monitor() === monitorIndex;
    }

    allowsMove(metaWindow) {
        return metaWindow.can_move();
    }

    _getFrameRect(metaWindow) {
        // Can't access to MetaWindow.get_frame_rect with Muffin
        // So try our best to get the frame rect
        const rect = metaWindow.get_rect();
        const inputRect = metaWindow.get_input_rect();
        const outerRect = metaWindow.get_outer_rect();
        if (
            rect.x === inputRect.x &&
            rect.y === inputRect.y &&
            rect.width === inputRect.width &&
            rect.height === inputRect.height
        ) {
            return inputRect;
        } else {
            return outerRect;
        }
    }

    _untile(metaWindow) {
        metaWindow.tile(META_TILE_NONE, false);
    }

    _retile(metaWindow, tileState) {
        metaWindow.tile(tileState.mode, tileState.type === this.MetaWindowTileTypeSnapped);
        // TODO: Find a way to re-apply custom tile dimensions
    }

    _saveTile(metaWindow) {
        const tileType = metaWindow.tile_type;
        if (tileType === this.MetaWindowTileTypeNone) {
            return undefined;
        }

        const tileMode = this._computeTileMode(metaWindow);
        if (tileMode === META_TILE_NONE) {
            return undefined;
        }

        return {
            type: tileType,
            mode: tileMode,
        };
    }

    _computeTileMode(metaWindow) {
        // Can't access to MetaWindow.tile_mode
        // So try our best to re-compute it (unfortunately if the window is tiled with a custom size it is possible to make mistakes)

        if (metaWindow.tile_type === this.MetaWindowTileTypeNone) {
            return META_TILE_NONE;
        }

        const monitorIndex = metaWindow.get_monitor();
        if (monitorIndex === -1) {
            return META_TILE_NONE;
        }

        const monitorGeo = metaWindow.get_screen().get_monitor_geometry(monitorIndex);
        if (!monitorGeo) {
            return META_TILE_NONE;
        }

        let {x, y, width, height} = monitorGeo;
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const tileAreas = [
            {mode: META_TILE_LEFT, x: x, y: y, width: halfWidth, height: height},
            {mode: META_TILE_RIGHT, x: x + halfWidth, y: y, width: halfWidth, height: height},
            {mode: META_TILE_ULC, x: x, y: y, width: halfWidth, height: halfHeight},
            {mode: META_TILE_LLC, x: x, y: y + halfHeight, width: halfWidth, height: halfHeight},
            {mode: META_TILE_URC, x: x + halfWidth, y: y, width: halfWidth, height: halfHeight},
            {mode: META_TILE_LRC, x: x + halfWidth, y: y + halfHeight, width: halfWidth, height: halfHeight},
            {mode: META_TILE_TOP, x: x, y: y, width: width, height: halfHeight},
            {mode: META_TILE_BOTTOM, x: x, y: y + halfHeight, width: width, height: halfHeight},
            // I don't known what META_TILE_MAXIMIZE is... Skip it for now.
        ];

        const rect = metaWindow.get_outer_rect();
        x = rect.x;
        y = rect.y;
        width = rect.width;
        height = rect.height;

        let bestIou = 0;
        let bestTileMode = META_TILE_NONE;
        for (const tileArea of tileAreas) {
            // Compute intersection area
            const iLeft = Math.max(x, tileArea.x);
            const iTop = Math.max(y, tileArea.y);
            const iRight = Math.min(x + width, tileArea.x + tileArea.width);
            const iBottom = Math.min(y + height, tileArea.y + tileArea.height);
            if (iRight < iLeft || iBottom < iTop) {
                // No intersection
                continue;
            }
            const iArea = (iRight - iLeft) * (iBottom - iTop);

            // Compute union area
            const uArea = Math.max(width * height + tileArea.width * tileArea.height - iArea, 1);

            // Compute intersection over union
            const iou = iArea / uArea;

            if (iou > bestIou) {
                bestIou = iou;
                bestTileMode = tileArea.mode;
            }
        }
        return bestTileMode;
    }

    /**
     * @abstract
     */
    _supportsFullscreen() {
        // MetaWindow.make_fullscreen & MetaWindow.unmake_fullscreen are not accessible
        return false;
    }

    /**
     * @abstract
     */
    _makeFullscreen(metaWindow) {
        // MetaWindow.make_fullscreen is not accessible
    }

    /**
     * @abstract
     */
    _unmakeFullscreen(metaWindow) {
        // MetaWindow.unmake_fullscreen is not accessible
    }

    _changeWorkspaceByIndex(metaWindow, workspaceIndex, append) {
        metaWindow.change_workspace_by_index(workspaceIndex, append, 0);
    }
}

class WindowSaver5_4 extends WindowSaverBase {
    constructor() {
        super('5.4+');
    }

    isInside(metaWindow, monitorRect) {
        const frameRect = this._getFrameRect(metaWindow);
        const frameCenterX = frameRect.x + frameRect.width / 2;
        const frameCenterY = frameRect.y + frameRect.height / 2;
        return (
            frameCenterX >= monitorRect.x &&
            frameCenterY >= monitorRect.y &&
            frameCenterX < monitorRect.x + monitorRect.width &&
            frameCenterY < monitorRect.y + monitorRect.height
        );
    }

    allowsMove(metaWindow) {
        return metaWindow.allows_move() || metaWindow.fullscreen;
    }

    _getFrameRect(metaWindow) {
        return metaWindow.get_frame_rect();
    }

    _untile(metaWindow) {
        // meta_window_tile is not exported in Cinnamon 5.4... :'(
        // TODO: Open an issue on muffin to ask to export it again.
        //       Take the opportunity to ask to export the other missing APIs.
    }

    _retile(metaWindow, tileState) {
        // Noting-to-do (see below)
    }

    _saveTile(metaWindow) {
        // Still cannot access tile_mode in Cinnamon 5.4.
        // But since tile_type doesn't exist anymore, we can't use it to detect tilling like in Cinnamon 4.8.
        return undefined;
    }

    /**
     * @abstract
     */
    _supportsFullscreen() {
        return true;
    }

    /**
     * @abstract
     */
    _makeFullscreen(metaWindow) {
        metaWindow.make_fullscreen();
    }

    /**
     * @abstract
     */
    _unmakeFullscreen(metaWindow) {
        metaWindow.unmake_fullscreen();
    }

    _changeWorkspaceByIndex(metaWindow, workspaceIndex, append) {
        metaWindow.change_workspace_by_index(workspaceIndex, append);
    }
}

const windowSaver = (() => {
    let ret;
    if (typeof Meta.WindowTileType === 'undefined') {
        ret = new WindowSaver5_4();
    } else {
        ret = new WindowSaver4_8();
    }
    logger.log('Using WindowSaver for Cinnamon ' + ret.version);
    return ret;
})();

module.exports = {windowSaver};
