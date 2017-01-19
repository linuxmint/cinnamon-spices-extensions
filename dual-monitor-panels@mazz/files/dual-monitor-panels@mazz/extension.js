const Main = imports.ui.main;
const AppletManager = imports.ui.appletManager;
const Lang = imports.lang;

function enable(){
    if (Main.desktop_layout == Main.LAYOUT_CLASSIC && !global.settings.get_boolean("panel-autohide")){
        let p1height = Main.layoutManager.panelBox.get_height();
        let p2height = Main.layoutManager.panelBox2.get_height();
        let primaryMonitor = global.screen.get_primary_monitor();

        if(primaryMonitor == 0)
                secondaryMonitor = 1;
        else
                secondaryMonitor = 0;

        // Fix for looking glass especially- otherwise it goes in reverse. It really shouldnt slide out like that,
        // it should expand by width from the left side ( X: 0, Y: (height / 2 - (windowHeight / 2) )
        // 
        // You can't fix it by manually setting the _targetY and _hiddenY values because lookingGlass.js resets these values
        // based on the desktop_layout.
        // 
        // Animation makes me sad, KBM capture makes me even sadder =(
        Main.desktop_layout = Main.LAYOUT_TRADITIONAL;
        Main.panel.bottomPosition = true;
        
        Main.layoutManager.panelBox.set_size(Main.layoutManager.monitors[primaryMonitor].width, p1height);
        Main.layoutManager.panelBox.set_position(Main.layoutManager.monitors[primaryMonitor].x, Main.layoutManager.monitors[primaryMonitor].y + Main.layoutManager.monitors[primaryMonitor].height - p1height);
        
        Main.layoutManager.panelBox.add_style_class_name('panel-bottom');
        Main.layoutManager.panelBox.remove_style_class_name('panel-top');
        
        Main.layoutManager.panelBox2.set_size(Main.layoutManager.monitors[secondaryMonitor].width, p2height);
        Main.layoutManager.panelBox2.set_position(Main.layoutManager.monitors[secondaryMonitor].x, Main.layoutManager.monitors[secondaryMonitor].y + Main.layoutManager.monitors[secondaryMonitor].height - p2height);

        Main.layoutManager._chrome.updateRegions();
    }
}

function disable(){
    Main.desktop_layout = global.settings.get_string("desktop-layout");
    Main.layoutManager._updateBoxes();
}

function init(){
}
