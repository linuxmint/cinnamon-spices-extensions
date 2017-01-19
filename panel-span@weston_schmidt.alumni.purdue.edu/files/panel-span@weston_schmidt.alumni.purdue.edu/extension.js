const Main = imports.ui.main;

function init() {
}

function enable() {
    Main.layoutManager._updateMonitors();
    Main.layoutManager._updateBoxes();
    Main.layoutManager._updateHotCorners();

    if (Main.desktop_layout == Main.LAYOUT_TRADITIONAL) {
        let bottomEdge = Main.layoutManager.bottomMonitor.y +
                        Main.layoutManager.bottomMonitor.height;
        let bottomEdgeWidth = 0;
        for (let i = 0; i < Main.layoutManager.monitors.length; i++) {
            let thisEdge = Main.layoutManager.monitors[i].y +
                                Main.layoutManager.monitors[i].height;
            if (bottomEdge == thisEdge) {
                bottomEdgeWidth += Main.layoutManager.monitors[i].width;
            }
        }
        Main.layoutManager.panelBox.set_size(bottomEdgeWidth, 25);
    } else if (Main.desktop_layout == Main.LAYOUT_FLIPPED) {
        let topEdge = Main.layoutManager.primaryMonitor.y;
        let topEdgeWidth = 0;
        for (let i = 0; i < Main.layoutManager.monitors.length; i++) {
            let thisEdge = Main.layoutManager.monitors[i].y;
            if (topEdge == thisEdge) {
                topEdgeWidth += Main.layoutManager.monitors[i].width;
            }
        }
        Main.layoutManager.panelBox.set_size(topEdgeWidth, -1);
    } else if (Main.desktop_layout == Main.LAYOUT_CLASSIC) {
        let topEdge = Main.layoutManager.primaryMonitor.y;
        let topEdgeWidth = 0;
        for (let i = 0; i < Main.layoutManager.monitors.length; i++) {
            let thisEdge = Main.layoutManager.monitors[i].y;
            if (topEdge == thisEdge) {
                topEdgeWidth += Main.layoutManager.monitors[i].width;
            }
        }
        let bottomEdge = Main.layoutManager.bottomMonitor.y +
                        Main.layoutManager.bottomMonitor.height;
        let bottomEdgeWidth = 0;
        for (let i = 0; i < Main.layoutManager.monitors.length; i++) {
            let thisEdge = Main.layoutManager.monitors[i].y +
                                Main.layoutManager.monitors[i].height;
            if (bottomEdge == thisEdge) {
                bottomEdgeWidth += Main.layoutManager.monitors[i].width;
            }
        }
        Main.layoutManager.panelBox.set_size(topEdgeWidth, -1);
        Main.layoutManager.panelBox2.set_size(bottomEdgeWidth, 25);
    }
    Main.layoutManager.emit('monitors-changed');
}

function disable() {
    Main.layoutManager._updateMonitors();
    Main.layoutManager._updateBoxes();
    Main.layoutManager._updateHotCorners();
    Main.layoutManager.emit('monitors-changed');
}
