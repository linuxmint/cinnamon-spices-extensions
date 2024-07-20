const PopupMenu = imports.ui.popupMenu;
const WindowMenu = imports.ui.windowMenu;
const St = imports.gi.St;

let isEnabled = false, isInstalled = false;
let base_buildMenu, my_buildMenu;
let uuid = "opacity-slider@unknown.uuid"

// This extension creates a slider for adjusting a window's opacity, and adds it
// to the context menu when right-clicking a window's title bar.
// We do this by replacing the funciton that builds the menu, calling the original,
// and then adding our stuff before returning.
// Ideally, there would be a cleaner way to add custom actions to this menu, but for
// now this is the only way.


// Some housekeeping
function init(metadata) {
    uuid = metadata.uuid;
}

let log = function(text) {
    global.log("[" + uuid + "]: " + text);
}

let logW = function(text) {
    global.logWarning("[" + uuid + "]: " + text);
}


// Conversions between slider value and opacity value
const opacity_max = 255;
const opacity_min = 26;

function sliderValueFromOpacity(opacity) {
    return Math.max(0, Math.min(1, (opacity - opacity_min) / (opacity_max - opacity_min)));
}

function opacityFromSliderValue(value) {
    return Math.max(0, Math.min(255, Math.round( (value * (opacity_max-opacity_min) ) + opacity_min )));
}


// add a slider to a menu
// variant of WindowMenu.prototype.addAction, but that adds a slider instead of a MnemonicLeftOrnamentedMenuItem
function addSlider(to_menu, value, callback) {
    let menuItem = new PopupMenu.PopupSliderMenuItem(value);
    to_menu.addMenuItem(menuItem, to_menu.numMenuItems - 2); // num-2 to add before the Close action
    
    menuItem.connect('value-changed', callback );
    
    // this._items is used for mnemonics
    // before you uncomment the next line you must extend PopupSliderMenuItem and implement stuff
    // see Cinnamon's windowMenu.js: https://github.com/linuxmint/cinnamon/blob/master/js/ui/windowMenu.js

    //this._items.push(menuItem); 
    
    return menuItem;
}



function install() {
    // install ourselves by diverting the WindowMenu internal function
    // hacky as hell!
    
    base_buildMenu = WindowMenu.WindowMenu.prototype._buildMenu;

    my_buildMenu = function(window, ...args) {
        // Creating a right-click menu
        
        // Build the normal menu
        const retval = base_buildMenu.call(this, window, ...args);
        
        // If we're enabled, create our extra slider 
        if (isEnabled) {
            // Add separator
            // The position this.numMenuItems-2 adds the item before the last item ("Close")
            this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(), this.numMenuItems - 2);
            
            // Add label
            const label = new PopupMenu.PopupMenuItem(_("Opacity") + ": ???");
            this.addMenuItem(label, this.numMenuItems - 2);
            
            // Function to update the label's text
            function updateLabel(opacity) {
                label.setLabel(_("Opacity") + ": " + Math.floor(100*opacity/255).toString() + "%")
            }
            
            // Use current opacity to set label text
            const initial_opacity = window.get_opacity();
            updateLabel(initial_opacity);
            
            // Create the slider
            let slider = addSlider.call(this, this, sliderValueFromOpacity(initial_opacity), (sl, value) => {                
                // callback: update opacity by slider value
                
                const opacity = opacityFromSliderValue(value);
                
                window.set_opacity(opacity);
                
                updateLabel(opacity);
            } );
            
            
            // For both new menu entries, add empty ornament
            // TODO: add icon too. See MnemonicLeftOrnamentedMenuItem._init in windowMenu.js
            label.addActor(new St.Bin(), {position: 0});
            slider.addActor(new St.Bin(), {position: 0});            
        }
        
        return retval;
    }
    
    log("overriding WindowMenu.prototype._buildMenu");
    WindowMenu.WindowMenu.prototype._buildMenu = my_buildMenu;
    isInstalled = true;
}

function tryUninstall() {
    // Try to revert the method we overrode to what it was before
    // We can only do this if no one else overrode it after us
    // (unless they also cleaned up after themselves like we're doing here)
    if (WindowMenu.WindowMenu.prototype._buildMenu == my_buildMenu) {
        // We are clear to undo!
        log("reverting WindowMenu.prototype._buildMenu to former value")
        WindowMenu.WindowMenu.prototype._buildMenu = base_buildMenu;
        isInstalled = false;
        
        // allow garbage collection
        base_buildMenu = undefined;
        my_buildMenu = undefined;
    } else {
        logW("cannot revert WindowMenu.prototype._buildMenu: it has been overridden elsewhere")
    }
}

function enable() {
    isEnabled = true;
    
    if (!isInstalled) {
        install();
    }
}

function disable() {
    isEnabled = false;
    
    if (isInstalled) {
        tryUninstall();
    }
}
