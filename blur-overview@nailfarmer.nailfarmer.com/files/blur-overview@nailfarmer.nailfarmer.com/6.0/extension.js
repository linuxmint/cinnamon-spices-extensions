/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

// Blur Overview: Blur background in overview.
// Does not affect background dimming.

// Copyright (C) 2012 Jen Bowen aka nailfarmer

// This program is free software: you can redistribute it and/or m odify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

// Author: Jen Bowen aka nailfarmer
// Fixes and changes by Kevin Langman 2024
// Gaussian Blur (borrowed from Blur-my-shell / Aurélien Hamy) modified for Cinnamon and added by Kevin Langman 2024

const Clutter = imports.gi.Clutter;
const Tweener = imports.ui.tweener;
const Overview = imports.ui.overview;
const Settings = imports.ui.settings;

const GaussianBlur = require("./gaussian_blur");

const ANIMATION_TIME = 0.25;

let originalAnimate;

let settings;

const BlurType = {
    None: 0,
    Simple: 1,
    Gaussian: 2
}


function _animateVisible() {
    if (this.visible || this.animationInProgress)
        return;

    this._oldAnimateVisible();

    let children = this._background.get_children();
    // Get the overview's background image and add the BlurEffect to it if configured to do so
    if (settings.blurType > BlurType.None) {
       let fx;
       let desktopBackground = children[0];
       if (settings.blurType === BlurType.Simple) {
          fx =  new Clutter.BlurEffect();
       } else {
          fx = new GaussianBlur.GaussianBlurEffect({
                        radius: settings.radius,
                        brightness: 1.0,//(100-settings.opacity)/100,
                        width: 0,
                        height: 0});
       }
       desktopBackground.add_effect_with_name( "blur", fx );
    }
    // Get the overview's backgroundShade child and set it's color to see-through solid black or the user specified color if "color blending" is enabled
    let backgroundShade = children[1];
    let [ret,color] = Clutter.Color.from_string( (settings.colorBlend) ? settings.blendColor : "rgba(0,0,0,1)" );
    backgroundShade.set_opacity(0);
    backgroundShade.set_background_color(color);

    // Dim the backgroundShade by making the black/"Color blend" color less see-through by the configured percentage
    Tweener.addTween( backgroundShade,
                     { opacity: Math.round(settings.opacity*2.55),
                       time: ANIMATION_TIME,
                       transition: 'easeNone'
                     });
}

function BlurSettings(uuid) {
    this._init(uuid);
}

BlurSettings.prototype = {
    _init: function(uuid) {
        this.settings = new Settings.ExtensionSettings(this, uuid);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'opacity', 'opacity', null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'blurType', 'blurType', null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'radius', 'radius', null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'colorBlend', 'colorBlend', null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'blendColor', 'blendColor', null);
    }
};

function init(extensionMeta) {
    settings = new BlurSettings(extensionMeta.uuid);

    originalAnimate = Overview.Overview.prototype._animateVisible;
}

function enable() {
    // Monkey patch the original animation
    Overview.Overview.prototype._animateVisible = this._animateVisible;
    Overview.Overview.prototype._oldAnimateVisible = originalAnimate;
}

function disable() {
    // Ideally, we should remove the tween off the background,
    // but I haven't found a way to make this work yet. Patches welcomed!
    delete Overview.Overview.prototype._oldAnimateVisible;
    Overview.Overview.prototype._animateVisible = originalAnimate;
}