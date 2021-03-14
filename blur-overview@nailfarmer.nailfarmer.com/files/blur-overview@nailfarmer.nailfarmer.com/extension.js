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

const Clutter = imports.gi.Clutter;
const Tweener = imports.ui.tweener;
const Overview = imports.ui.overview;
const Settings = imports.ui.settings;

const ANIMATION_TIME = 0.25;

let originalAnimate, fx;

let settings;

function _animateVisible() {
    if (this.visible || this.animationInProgress)
        return;
    
    this._oldAnimateVisible();

    Tweener.addTween(this._background,
                     { opacity: settings.opacity,
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