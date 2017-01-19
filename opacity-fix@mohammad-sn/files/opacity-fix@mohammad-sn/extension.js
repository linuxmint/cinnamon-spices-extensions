//    "Better Transparency for Windows" extension for Cinnamon.
//    Copyright (C) 2015  Mohammad S. Nasrabadi <mohammad@azeribalasi.com>

//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.

//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.

//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.

const Clutter = imports.gi.Clutter;
const Lang = imports.lang;

let newOpacityFixExt = null;

function OpacityFixExt(metadata) {
    this._init(metadata);
}

OpacityFixExt.prototype = {
    _init: function(metadata) { 
        //
    },

    disable: function() {
        global.window_manager.disconnect(this._onWindowAddedID);
//        global.window_group.disconnect(this._onGroupOpacityChangeID);
        let actors = global.get_window_actors();
        let i = actors.length;
        while (i--){
//            if (actors[i]._onOpacityChangeID){
//                actors[i].disconnect(actors[i]._onOpacityChangeID);
//                delete actors[i]._onOpacityChangeID;
//            }
//            if (actors[i]._opacityFix_BrightnessEffect){
//                actors[i].remove_effect(actors[i]._opacityFix_BrightnessEffect);
//                delete actors[i]._opacityFix_BrightnessEffect;
//            }

            if (actors[i]._opacityFix) {
                actors[i].remove_effect(actors[i]._opacityFix);
                delete actors[i]._opacityFix;
            }
        }
    },
    
    enable: function() {
        this._onWindowAddedID = global.window_manager.connect('map', Lang.bind(this, this._onWindowAdded));
//        this._onGroupOpacityChangeID = global.window_group.connect('notify::opacity', Lang.bind(this, this._onGroupOpacityChange));
        this._onWindowAdded(null, false);
    },
    
    _onWindowAdded: function(ws, win) {
        let actors = new Array();
        if (win) actors.push(win);
        else actors = global.get_window_actors();
        let i = actors.length;
        while (i--){
//            if (actors[i]._onOpacityChangeID) continue;new  Clutter.DesaturateEffect()
//            actors[i]._onOpacityChangeID = actors[i].connect('notify::opacity', Lang.bind(this, this._onOpacityChange));
//            this._onOpacityChange(actors[i], null);
            
            if (!actors[i].get_meta_window().decorated || actors[i]._opacityFix) continue;
            actors[i]._opacityFix = new  Clutter.DesaturateEffect({ factor: 0 })
            actors[i].add_effect_with_name('opacityFix', actors[i]._opacityFix);
        }
    },

//    _onOpacityChange: function(actor, event) {
//        if (actor.meta_window.minimized) return;
//        let opacity = actor.opacity;
//        let factor = 0.064 - opacity/4000;
//        if (opacity < 255){
//            if (!actor._opacityFix_BrightnessEffect){
//                actor._opacityFix_BrightnessEffect = new Clutter.BrightnessContrastEffect();
//                actor.add_effect_with_name('bightness', actor._opacityFix_BrightnessEffect);
//            }
//            actor._opacityFix_BrightnessEffect.set_brightness(factor);
//            actor._opacityFix_BrightnessEffect.set_contrast(factor);
//        }
//        else if (actor._opacityFix_BrightnessEffect){
//            actor.remove_effect(actor._opacityFix_BrightnessEffect);
//            actor._opacityFix_BrightnessEffect = 0;
//        }        
//    },

//    _onGroupOpacityChange: function(actor, event) {
//        let opacity = actor.opacity;
//        let factor = 0.07 - opacity/4000;
//        let actors = actor.get_children();
//        let i = actors.length;
//        if (opacity < 255){
//            actor._opacityFix_GroupBrightnessEffect = 1;
//            while (i--){
//                if (!actors[i]._opacityFix_GroupBrightnessEffect){
//                    actors[i]._opacityFix_GroupBrightnessEffect = new Clutter.BrightnessContrastEffect();
//                    actors[i].add_effect_with_name('bightness', actors[i]._opacityFix_GroupBrightnessEffect);
//                }
//                actors[i]._opacityFix_GroupBrightnessEffect.set_brightness(factor);
//                actors[i]._opacityFix_GroupBrightnessEffect.set_contrast(factor);
//            }
//        }
//        else if (actor._opacityFix_GroupBrightnessEffect){
//            while (i--){
//                actors[i].remove_effect(actors[i]._opacityFix_GroupBrightnessEffect);
//                actors[i]._opacityFix_GroupBrightnessEffect = 0;
//                actor._opacityFix_GroupBrightnessEffect = 0;
//            }
//        }        
//    },
}

function init(metadata) { newOpacityFixExt = new OpacityFixExt(metadata); }
function enable() { newOpacityFixExt.enable(); }
function disable() { newOpacityFixExt.disable(); }

