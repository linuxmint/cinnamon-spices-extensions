/*
 * Compiz-windows-effect for Cinnamon
 *
 * Copyright (C) 2022
 *     Mauro Pepe <https://github.com/hermes83/compiz-windows-effect-cinnamon>
 *
 * This file is part of the cinnamon extension Compiz-windows-effect.
 *
 * cinnamon extension Compiz-windows-effect is free software: you can
 * redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * cinnamon extension Compiz-windows-effect is distributed in the hope that it
 * will be useful, but WITHOUT ANY WARRANTY; without even the
 * implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR
 * PURPOSE.  See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with cinnamon extension Compiz-windows-effect.  If not, see
 * <http://www.gnu.org/licenses/>.
 */

const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Clutter = imports.gi.Clutter;
const Settings = imports.ui.settings;
const Config = imports.misc.config;

const IS_VERSION_BEFORE_5_4 = parseFloat(Config.PACKAGE_VERSION.split('.')[0] + '.' + Config.PACKAGE_VERSION.split('.')[1]) < 5.4;

let settings;
let extension;

function init(metadata) {
    settings = new SettingsHandler(metadata.uuid);
}

function enable() {
    extension = new CompizWindowsEffectExtension();
    if (extension) {
        extension.enable();
    }
}   

function disable() {
    if (extension) {
        extension.disable();
        extension = null;
    }
}

class SettingsHandler {
    constructor(uuid) {
        this.settings = new Settings.ExtensionSettings(this, uuid);
        this.settings.bindProperty(Settings.BindingDirection.IN, "friction", "friction", function(){});
        this.settings.bindProperty(Settings.BindingDirection.IN, "springK", "springK", function(){});
        this.settings.bindProperty(Settings.BindingDirection.IN, "speedupFactorDivider", "speedupFactorDivider", function(){});
        this.settings.bindProperty(Settings.BindingDirection.IN, "mass", "mass", function(){});
        this.settings.bindProperty(Settings.BindingDirection.IN, "xTiles", "xTiles", function(){});
        this.settings.bindProperty(Settings.BindingDirection.IN, "yTiles", "yTiles", function(){});
        this.settings.bindProperty(Settings.BindingDirection.IN, "maxUnmaxFactor", "maxUnmaxFactor", function(){});
    }    
}

class CompizWindowsEffectExtension {
    constructor() {
        this.EFFECT_NAME = 'wobbly-compiz-effect';

        this.beginGrabOpId = null;
        this.endGrabOpId = null;
        this.resizeOpId = null;
        this.unmaximizeOpId = null;
        this.maximizeOpId = null;
        this.tileOpId = null;
        this.sizeChangeOpId = null;
    }

    enable() {
        this.beginGrabOpId = global.display.connect('grab-op-begin', this.onBeginGrabOp.bind(this));
        this.endGrabOpId = global.display.connect('grab-op-end', this.onEndGrabOp.bind(this));
        if (settings.maxUnmaxFactor) {
            if (IS_VERSION_BEFORE_5_4) {
                this.unmaximizeOpId = global.window_manager.connect("unmaximize", this.onUnmaximize.bind(this));
                this.maximizeOpId = global.window_manager.connect("maximize", this.onMaximize.bind(this));
                this.tileOpId = global.window_manager.connect("tile", this.onTile.bind(this));
            } else {
                this.sizeChangeOpId = global.window_manager.connect('size-change', this.onSizeChange.bind(this));
            }
        }
    }

    disable() {
        global.display.disconnect(this.beginGrabOpId);
        global.display.disconnect(this.endGrabOpId);

        if (this.unmaximizeOpId != null) {
            global.window_manager.disconnect(this.unmaximizeOpId);
        }
        if (this.maximizeOpId != null) {
            global.window_manager.disconnect(this.maximizeOpId);
        }
        if (this.tileOpId != null) {
            global.window_manager.disconnect(this.tileOpId);
        }
        if (this.sizeChangeOpId != null) {
            global.window_manager.disconnect(this.sizeChangeOpId);
        }
        
        global.get_window_actors().forEach(function (actor) {
            if (actor) {
                let effect = actor.get_effect(this.EFFECT_NAME);
                if (effect) {
                    effect.destroy();
                }
            }
        }, this );
    }

    onBeginGrabOp(display, screen, window, op) {
        if (op != Meta.GrabOp.MOVING) {
            return;
        }

        let actor = window.get_compositor_private();
        if (!actor) {
            return;
        }

        let effect = actor.get_effect(this.EFFECT_NAME);
        if (effect) {
            effect.destroy();
        }

        effect = new WobblyEffect('move');
        actor.add_effect_with_name(this.EFFECT_NAME, effect);
    }
    
    onEndGrabOp(display, screen, window, op) {
        if (op != Meta.GrabOp.MOVING) {
            return;
        }

        let actor = window.get_compositor_private();
        if (!actor) {
            return;
        }

        let effect = actor.get_effect(this.EFFECT_NAME);
        if (effect) {
            effect.on_end_event(actor);
        }
    }
    
    onUnmaximize(shellwm, actor) {
        if (!actor) {
            return;
        }

        let effect = actor.get_effect(this.EFFECT_NAME);
        if (!effect || effect.ended) {
            if (effect) {
                effect.destroy();
            }
            
            effect = new WobblyEffect('unmaximized');
            actor.add_effect_with_name(this.EFFECT_NAME, effect);   
        }
    }
    
    onMaximize(shellwm, actor) {
        if (!actor) {
            return;
        }

        let effect = actor.get_effect(this.EFFECT_NAME);
        if (effect) {
            effect.destroy();
        }

        actor.add_effect_with_name(this.EFFECT_NAME, new WobblyEffect('maximized'));
    }
    
    onTile(shellwm, actor) {
        if (!actor) {
            return;
        }

        let effect = actor.get_effect(this.EFFECT_NAME);
        if (effect) {
            effect.destroy();
        }

        actor.add_effect_with_name(this.EFFECT_NAME, new WobblyEffect('maximized'));
    }

    onSizeChange(shellwm, actor, whichChange, oldFrameRect, _oldBufferRect) {
        switch (whichChange) {
            case Meta.SizeChange.MAXIMIZE:
                this.onMaximize(shellwm, actor);
                break;
            case Meta.SizeChange.UNMAXIMIZE:
                this.onUnmaximize(shellwm, actor);
                break;
            case Meta.SizeChange.TILE:
                this.onTile(shellwm, actor);
                break;
        }
    }
}

const WobblyEffect = new Lang.Class({
    Name: `WobblyEffect_${Math.floor(Math.random() * 100000) + 1}`,
    Extends: Clutter.DeformEffect,

    _init: function(op) {
        this.parent();
        this.operationType = op;
        
        this.paintEvent = null;
        this.moveEvent = null;
        this.resizedEvent = null;
        this.newFrameEvent = null;
        this.completedEvent = null;
        
        this.timerId = null;
        this.deltaX = 0;
        this.deltaY = 0;
        this.width = 0;
        this.height = 0;
        this.mouseX = 0;
        this.mouseY = 0;
        this.msecOld = 0;

        this.wobblyModel = null;
        this.coeff = null;
        this.deformedObjects = null;
        this.tilesX = 0;
        this.tilesY = 0;
        
        this.CLUTTER_TIMELINE_DURATION = 1000 * 1000;
        this.FRICTION = settings.friction;
        this.SPRING_K = settings.springK;            
        this.SPEEDUP_FACTOR = settings.speedupFactorDivider;
        this.MASS = settings.mass;
        this.X_TILES = 'maximized' === this.operationType ? 10 : settings.xTiles;
        this.Y_TILES = 'maximized' === this.operationType ? 10 : settings.yTiles;

        this.set_n_tiles(this.X_TILES, this.Y_TILES);
        
        this.initialized = false;
        this.ended = false;
    },

    init: function(actor) {
        if (actor && !this.initialized) {
            this.initialized = true;

            [this.width, this.height] = actor.get_size();
            [this.newX, this.newY] = [actor.get_x(), actor.get_y()];
            [this.oldX, this.oldY] = [this.newX, this.newY];
            [this.mouseX, this.mouseY] = global.get_pointer();

            this.tilesX = this.X_TILES + 0.1;
            this.tilesY = this.Y_TILES + 0.1;

            this.coeff = new Array(this.Y_TILES + 1);
            this.deformedObjects = new Array(this.Y_TILES + 1);
        
            var x, y, tx, ty;
            for (y = 0; y <= this.Y_TILES; y++) {
                ty = y / this.Y_TILES;

                this.coeff[y] = new Array(this.X_TILES + 1);
                this.deformedObjects[y] = new Array(this.X_TILES + 1);
        
                for (x = 0; x <= this.X_TILES; x++) {
                    tx = x / this.X_TILES;
    
                    this.coeff[y][x] = new Array(16);    
                    this.coeff[y][x][0] = (1 - tx) * (1 - tx) * (1 - tx) * (1 - ty) * (1 - ty) * (1 - ty);
                    this.coeff[y][x][1] = 3 * tx * (1 - tx) * (1 - tx) * (1 - ty) * (1 - ty) * (1 - ty);
                    this.coeff[y][x][2] = 3 * tx * tx * (1 - tx) * (1 - ty) * (1 - ty) * (1 - ty);
                    this.coeff[y][x][3] = tx * tx * tx * (1 - ty) * (1 - ty) * (1 - ty);
                    this.coeff[y][x][4] = 3 * (1 - tx) * (1 - tx) * (1 - tx) * ty * (1 - ty) * (1 - ty);
                    this.coeff[y][x][5] = 9 * tx * (1 - tx) * (1 - tx) * ty * (1 - ty) * (1 - ty);
                    this.coeff[y][x][6] = 9 * tx * tx * (1 - tx) * ty * (1 - ty) * (1 - ty);
                    this.coeff[y][x][7] = 3 * tx * tx * tx * ty * (1 - ty) * (1 - ty);
                    this.coeff[y][x][8] = 3 * (1 - tx) * (1 - tx) * (1 - tx) * ty * ty * (1 - ty);
                    this.coeff[y][x][9] = 3 * tx * (1 - tx) * (1 - tx) * 3 * ty * ty * (1 - ty);
                    this.coeff[y][x][10] = 9 * tx * tx * (1 - tx) * ty * ty * (1 - ty);
                    this.coeff[y][x][11] = 3 * tx * tx * tx * ty * ty * (1 - ty);
                    this.coeff[y][x][12] = (1 - tx) * (1 - tx) * (1 - tx) * ty * ty * ty;
                    this.coeff[y][x][13] = 3 * tx * (1 - tx) * (1 - tx) * ty * ty * ty;
                    this.coeff[y][x][14] = 3 * tx * tx * (1 - tx) * ty * ty * ty;
                    this.coeff[y][x][15] = tx * tx * tx * ty * ty * ty;

                    this.deformedObjects[y][x] = [tx * this.width, ty * this.height];
                }
            }


            this.wobblyModel = new WobblyModel({ friction: this.FRICTION, springK: this.SPRING_K, mass: this.MASS, sizeX: this.width, sizeY: this.height });

            if ('unmaximized' === this.operationType) {
                this.wobblyModel.unmaximize(settings.maxUnmaxFactor);
                this.ended = true;
            } else if ('maximized' === this.operationType) {                    
                this.wobblyModel.maximize(settings.maxUnmaxFactor);
                this.ended = true;
            } else {
                this.wobblyModel.grab(this.mouseX - this.newX, this.mouseY - this.newY);
                this.moveEvent = actor.connect('allocation-changed', Lang.bind(this, this.on_move_event));
                this.resizedEvent = actor.connect('notify::size', Lang.bind(this, this.on_resized_event));
            }
            
            this.paintEvent = actor.connect('paint', () => {});

            this.timerId = new Clutter.Timeline({duration: this.CLUTTER_TIMELINE_DURATION});
            this.newFrameEvent = this.timerId.connect('new-frame', Lang.bind(this, this.on_new_frame_event));
            this.completedEvent = this.timerId.connect('completed', Lang.bind(this, this.destroy));
            this.timerId.start();      
        }
    },

    destroy: function() {
        if (this.timerId) {
            this.timerId.stop();
            if (this.completedEvent) {
                this.timerId.disconnect(this.completedEvent);
                this.completedEvent = null;
            }
            if (this.newFrameEvent) {
                this.timerId.disconnect(this.newFrameEvent);
                this.newFrameEvent = null;
            }
            this.timerId.run_dispose();
            this.timerId = null;
        }

        if (this.wobblyModel) {
            this.wobblyModel.dispose();
            this.wobblyModel = null;
        }
        
        let actor = this.get_actor();
        if (actor) {
            if (this.paintEvent) {
                actor.disconnect(this.paintEvent);
                this.paintEvent = null;
            }

            if (this.moveEvent) {
                actor.disconnect(this.moveEvent);
                this.moveEvent = null;
            }

            if (this.resizedEvent) {
                actor.disconnect(this.resizedEvent);
                this.resizedEvent = null;
            }

            actor.remove_effect(this);
        }
    },

    on_end_event: function(actor) {
        this.ended = true;
    },

    on_move_event: function(actor, allocation, flags) {
        [this.oldX, this.oldY, this.newX, this.newY] = [this.newX, this.newY, actor.get_x(), actor.get_y()];
        this.wobblyModel.move(this.newX - this.oldX, this.newY - this.oldY);
        this.deltaX -= this.newX - this.oldX;
        this.deltaY -= this.newY - this.oldY;
    },

    on_resized_event(actor, params) {
        var [width, height] = actor.get_size();
        if (this.width != width || this.height != height) {
            [this.width, this.height] = [width, height];
            this.wobblyModel.resize(this.width, this.height);
            this.deltaX = 0;
            this.deltaY = 0;
        }
    },

    on_new_frame_event: function(timer, msec) {
        if (this.ended) {
            if (!this.timerId) {
                this.destroy();
                return;
            }
            if (!this.wobblyModel) {
                this.destroy();
                return;
            }
            if (!this.wobblyModel.movement) {
                this.destroy();
                return;
            }
        }

        this.wobblyModel.step((msec - this.msecOld) / this.SPEEDUP_FACTOR);
        this.msecOld = msec;

        var x, y;
        for (y = 0; y <= this.Y_TILES; y++) {
            for (x = 0; x <= this.X_TILES; x++) {
                this.deformedObjects[y][x][0] = 
                    this.coeff[y][x][0] * this.wobblyModel.objects[0].x
                    + this.coeff[y][x][1] * this.wobblyModel.objects[1].x
                    + this.coeff[y][x][2] * this.wobblyModel.objects[2].x
                    + this.coeff[y][x][3] * this.wobblyModel.objects[3].x
                    + this.coeff[y][x][4] * this.wobblyModel.objects[4].x
                    + this.coeff[y][x][5] * this.wobblyModel.objects[5].x
                    + this.coeff[y][x][6] * this.wobblyModel.objects[6].x
                    + this.coeff[y][x][7] * this.wobblyModel.objects[7].x
                    + this.coeff[y][x][8] * this.wobblyModel.objects[8].x
                    + this.coeff[y][x][9] * this.wobblyModel.objects[9].x
                    + this.coeff[y][x][10] * this.wobblyModel.objects[10].x
                    + this.coeff[y][x][11] * this.wobblyModel.objects[11].x
                    + this.coeff[y][x][12] * this.wobblyModel.objects[12].x
                    + this.coeff[y][x][13] * this.wobblyModel.objects[13].x
                    + this.coeff[y][x][14] * this.wobblyModel.objects[14].x
                    + this.coeff[y][x][15] * this.wobblyModel.objects[15].x;
                this.deformedObjects[y][x][1] = 
                    this.coeff[y][x][0] * this.wobblyModel.objects[0].y
                    + this.coeff[y][x][1] * this.wobblyModel.objects[1].y
                    + this.coeff[y][x][2] * this.wobblyModel.objects[2].y
                    + this.coeff[y][x][3] * this.wobblyModel.objects[3].y
                    + this.coeff[y][x][4] * this.wobblyModel.objects[4].y
                    + this.coeff[y][x][5] * this.wobblyModel.objects[5].y
                    + this.coeff[y][x][6] * this.wobblyModel.objects[6].y
                    + this.coeff[y][x][7] * this.wobblyModel.objects[7].y
                    + this.coeff[y][x][8] * this.wobblyModel.objects[8].y
                    + this.coeff[y][x][9] * this.wobblyModel.objects[9].y
                    + this.coeff[y][x][10] * this.wobblyModel.objects[10].y
                    + this.coeff[y][x][11] * this.wobblyModel.objects[11].y
                    + this.coeff[y][x][12] * this.wobblyModel.objects[12].y
                    + this.coeff[y][x][13] * this.wobblyModel.objects[13].y
                    + this.coeff[y][x][14] * this.wobblyModel.objects[14].y
                    + this.coeff[y][x][15] * this.wobblyModel.objects[15].y;
            }
        }

        if ((this.newX === this.actor.get_x() && this.newY === this.actor.get_y()) || 'move' !== this.operationType) {
            this.invalidate();
        }
    },

    vfunc_set_actor: function(actor) {
        this.parent(actor);
        this.init(actor);
    },

    vfunc_deform_vertex: function(w, h, v) {
        if (this.deformedObjects) {
            [v.x, v.y] = this.deformedObjects[v.ty * this.tilesY >> 0][v.tx * this.tilesX >> 0];
            v.x += this.deltaX;
            v.y += this.deltaY;
            v.x *= w / this.width;
            v.y *= h / this.height;
        }
    }

});

/*
 * Copyright © 2005 Novell, Inc.
 * Copyright © 2022 Mauro Pepe
 *
 * Permission to use, copy, modify, distribute, and sell this software
 * and its documentation for any purpose is hereby granted without
 * fee, provided that the above copyright notice appear in all copies
 * and that both that copyright notice and this permission notice
 * appear in supporting documentation, and that the name of
 * Novell, Inc. not be used in advertising or publicity pertaining to
 * distribution of the software without specific, written prior permission.
 * Novell, Inc. makes no representations about the suitability of this
 * software for any purpose. It is provided "as is" without express or
 * implied warranty.
 *
 * NOVELL, INC. DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE,
 * INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS, IN
 * NO EVENT SHALL NOVELL, INC. BE LIABLE FOR ANY SPECIAL, INDIRECT OR
 * CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
 * OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT,
 * NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION
 * WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * Author: David Reveman <davidr@novell.com>
 *         Scott Moreau <oreaus@gmail.com>
 *         Mauro Pepe <https://github.com/hermes83/compiz-windows-effect>
 *
 * Spring model implemented by Kristian Hogsberg.
 */
class Obj {
    constructor(forceX, forceY, positionX, positionY, velocityX, velocityY, immobile) {
        [this.forceX, this.forceY, this.x, this.y, this.velocityX, this.velocityY, this.immobile] = [forceX, forceY, positionX, positionY, velocityX, velocityY, immobile];
    }    
}

class Spring {
    constructor(a, b, offsetX, offsetY) {
        [this.a, this.b, this.offsetX, this.offsetY] = [a, b, offsetX, offsetY];
    }
}

class WobblyModel {
    constructor(config) {
        this.GRID_WIDTH = 4;
        this.GRID_HEIGHT = 4;

        this.objects = new Array(this.GRID_WIDTH * this.GRID_HEIGHT);
        this.numObjects = this.GRID_WIDTH * this.GRID_HEIGHT;
        this.springs = new Array(this.GRID_WIDTH * this.GRID_HEIGHT);
        this.movement = false;
        this.steps = 0;
        this.vertex_count = 0;
        this.immobileObjects = [];
    
        this.width = config.sizeX;
        this.height = config.sizeY;
        this.friction = config.friction;
        this.springK = config.springK * 0.5;
        this.mass = 100 - config.mass;
        
        this.initObjects();
        this.initSprings();
    }

    dispose() {
        this.objects = null;
        this.springs = null;
    }

    initObjects() {
        var i = 0, gridY, gridX, gw = this.GRID_WIDTH - 1, gh = this.GRID_HEIGHT - 1;
    
        for (gridY = 0; gridY < this.GRID_HEIGHT; gridY++) {
            for (gridX = 0; gridX < this.GRID_WIDTH; gridX++) {
                this.objects[i++] = new Obj(0, 0, gridX * this.width / gw, gridY * this.height / gh, 0, 0, false);
            }
        }
    }

    initSprings() {
        var i = 0, numSprings = 0, gridY, gridX, hpad = this.width / (this.GRID_WIDTH - 1), vpad = this.height / (this.GRID_HEIGHT - 1);
    
        for (gridY = 0; gridY < this.GRID_HEIGHT; gridY++) {
            for (gridX = 0; gridX < this.GRID_WIDTH; gridX++) {
                if (gridX > 0) {
                    this.springs[numSprings++] = new Spring(this.objects[i - 1], this.objects[i], hpad, 0);
                }
    
                if (gridY > 0) {
                    this.springs[numSprings++] = new Spring(this.objects[i - this.GRID_WIDTH], this.objects[i], 0, vpad);
                }
    
                i++;
            }
        }
    }

    updateObjects() {
        var i = 0, gridY, gridX, gw = this.GRID_WIDTH - 1, gh = this.GRID_HEIGHT - 1;

        for (gridY = 0; gridY < this.GRID_HEIGHT; gridY++) {
            for (gridX = 0; gridX < this.GRID_WIDTH; gridX++) {
                [this.objects[i].x, this.objects[i].y, this.objects[i].velocityX, this.objects[i].velocityY, this.objects[i].forceX, this.objects[i].forceY] = [gridX * this.width / gw, gridY * this.height / gh, 0, 0, 0, 0];
                i++;
            }
        }
    }

    nearestObject(x, y) {
        let distance, minDistance = -1, result = null;

        for (let i = this.objects.length - 1, object; i >= 0, object = this.objects[i]; --i) {
            distance = (object.x - x < 0 ? x - object.x : object.x - x) + (object.y - y < 0 ? y - object.y : object.y - y);
    
            if (minDistance === -1 || distance < minDistance) {
                minDistance = distance;
                result = object;
            }
        }

        return result;
    }

    grab(x, y) {
        var immobileObject = this.nearestObject(x, y);
        immobileObject.immobile = true;
        this.immobileObjects = [immobileObject];
    }

    maximize(maxUnmaxFactor) {
        var intensity = maxUnmaxFactor / 10;

        var topLeft = this.nearestObject(0, 0), topRight = this.nearestObject(this.width, 0), bottomLeft = this.nearestObject(0, this.height), bottomRight = this.nearestObject(this.width, this.height);
        [topLeft.immobile, topRight.immobile, bottomLeft.immobile, bottomRight.immobile] = [true, true, true, true];

        this.immobileObjects = [topLeft, topRight, bottomLeft, bottomRight];

        this.friction *= 2;
        if (this.friction > 10) {
            this.friction = 10;
        }

        for (let i = this.springs.length - 1, spring; i >= 0, spring = this.springs[i]; --i) {
            if (spring.a === topLeft) {
                spring.b.velocityX -= spring.offsetX * intensity;
                spring.b.velocityY -= spring.offsetY * intensity;
            } else if (spring.b === topLeft) {
                spring.a.velocityX -= spring.offsetX * intensity;
                spring.a.velocityY -= spring.offsetY * intensity;
            } else if (spring.a === topRight) {
                spring.b.velocityX -= spring.offsetX * intensity;
                spring.b.velocityY -= spring.offsetY * intensity;
            } else if (spring.b === topRight) {
                spring.a.velocityX -= spring.offsetX * intensity;
                spring.a.velocityY -= spring.offsetY * intensity;
            } else if (spring.a === bottomLeft) {
                spring.b.velocityX -= spring.offsetX * intensity;
                spring.b.velocityY -= spring.offsetY * intensity;
            } else if (spring.b === bottomLeft) {
                spring.a.velocityX -= spring.offsetX * intensity;
                spring.a.velocityY -= spring.offsetY * intensity;
            } else if (spring.a === bottomRight) {
                spring.b.velocityX -= spring.offsetX * intensity;
                spring.b.velocityY -= spring.offsetY * intensity;
            } else if (spring.b === bottomRight) {
                spring.a.velocityX -= spring.offsetX * intensity;
                spring.a.velocityY -= spring.offsetY * intensity;
            }
        }

        this.step(0);
    }

    unmaximize(maxUnmaxFactor) {
        var intensity = maxUnmaxFactor / 10;

        var immobileObject = this.nearestObject(this.width / 2, this.height / 2);
        immobileObject.immobile = true;
        this.immobileObjects = [immobileObject];

        this.friction *= 2;
        if (this.friction > 10) {
            this.friction = 10;
        }

        for (let i = this.springs.length - 1, spring; i >= 0, spring = this.springs[i]; --i) {
            if (spring.a === immobileObject) {
                spring.b.velocityX -= spring.offsetX * intensity;
                spring.b.velocityY -= spring.offsetY * intensity;
            } else if (spring.b === immobileObject) {
                spring.a.velocityX -= spring.offsetX * intensity;
                spring.a.velocityY -= spring.offsetY * intensity;
            }
        }
        
        this.step(0);
    }

    step(steps) {
        var movement = false;
        var spring;
        var object;

        for (var j = 0; j <= steps; j++) {
            for (var i = this.springs.length - 1; i >= 0; --i) {
                spring = this.springs[i];
                spring.a.forceX += this.springK * (spring.b.x - spring.a.x - spring.offsetX);
                spring.a.forceY += this.springK * (spring.b.y - spring.a.y - spring.offsetY);
                spring.b.forceX -= this.springK * (spring.b.x - spring.a.x - spring.offsetX);
                spring.b.forceY -= this.springK * (spring.b.y - spring.a.y - spring.offsetY);
            }

            for (var i = this.objects.length - 1; i >= 0; --i) {
                object = this.objects[i];
                if (!object.immobile) {
                    object.forceX -= this.friction * object.velocityX;
                    object.forceY -= this.friction * object.velocityY;
                    object.velocityX += object.forceX / this.mass;
                    object.velocityY += object.forceY / this.mass;
                    object.x += object.velocityX; 
                    object.y += object.velocityY;

                    movement |= Math.abs(object.velocityX) > 5 || Math.abs(object.velocityY) > 5 || Math.abs(object.forceX) > 5 || Math.abs(object.forceY) > 5;
    
                    object.forceX = 0;
                    object.forceY = 0;
                }
            }
        }

        this.movement = movement;
    }

    move(deltaX, deltaY) {
        this.immobileObjects[0].x += deltaX;
        this.immobileObjects[0].y += deltaY;
    }

    resize(sizeX, sizeY) {
        this.width = sizeX;
        this.height = sizeY;

        this.updateObjects();
        this.initSprings();
    }
}