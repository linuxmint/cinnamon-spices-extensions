const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const Settings = imports.ui.settings;
const Meta = imports.gi.Meta;

const GRID_WIDTH = 4;
const GRID_HEIGHT = 4;
const EPSILON = 0.2;
const MASS = 15.0;

let settings;

function WobblyWindowObject(posX, posY) {
    this._init(posX, posY);
}

WobblyWindowObject.prototype = {
    _init: function(posX, posY) {
        this.posX = posX;
        this.posY = posY;

        this.velX = 0;
        this.velY = 0;

        this.forceX = 0;
        this.forceY = 0;

        this.immobile = false;
    },

    move: function(dX, dY) {
        this.posX += dX;
        this.posY += dY;
    },

    applyForce: function(fX, fY) {
        this.forceX += fX;
        this.forceY += fY;
    },

    step: function(friction, k) {

        if (this.immobile) {
            this.velX = 0;
            this.velY = 0;

            this.forceX = 0;
            this.forceY = 0;

            return [0, 0];
        }

        let fX = this.forceX - (friction * this.velX);
        let fY = this.forceY - (friction * this.velY);

        this.velX += fX / MASS;
        this.velY += fY / MASS;

        this.posX += this.velX;
        this.posY += this.velY;

        let totalForce = Math.abs(this.forceX + this.forceY);
        let totalVelocity = Math.abs(this.velX + this.velY);

        this.forceX = 0;
        this.forceY = 0;

        return [totalVelocity, totalForce];
    }
};

function WobblyWindowSpring(objA, objB, offsetX, offsetY) {
    this._init(objA, objB, offsetX, offsetY);
}

WobblyWindowSpring.prototype = {
    _init: function(objA, objB, offsetX, offsetY) {
        this.objA = objA;
        this.objB = objB;
        this.offsetX = offsetX;
        this.offsetY = offsetY;
    },

    step: function(friction, k) {
        let dx, dy;

        dx = (this.objB.posX - this.objA.posX - this.offsetX) * 0.5 * k;
        dy = (this.objB.posY - this.objA.posY - this.offsetY) * 0.5 * k;
        this.objA.applyForce(dx, dy);

        dx = (this.objA.posX - this.objB.posX + this.offsetX) * 0.5 * k;
        dy = (this.objA.posY - this.objB.posY + this.offsetY) * 0.5 * k;
        this.objB.applyForce(dx, dy);
    }
};

const WobblyWindowEffect = new Lang.Class({
    Name: 'WobblyWindowEffect',
    Extends: Clutter.DeformEffect,

    _init: function(params) {
        this.parent(params);
        this.allowStop = false;
        this.isWobbling = false;
        this._hasModel = false;
        this._anchorObject = null;
        this._oldX = null;
        this._oldY = null;
        this._oldW = null;
        this._oldH = null;
    },

    _setAnchorObject: function(obj) {
        if (this._anchorObject)
            this._anchorObject.immobile = false;

        this._anchorObject = obj;

        if (this._anchorObject)
            this._anchorObject.immobile = true;
    },

    /*
     * returns model-object at coordinates (x,y)
     */
    _objectAt: function(x, y) {
        let obj = this.objects[y * GRID_WIDTH + x];
        if (!obj)
            throw new Error("No object at " + x + ", " + y);
        return obj;
    },

    /*
     * returns dimensions of an actor
     */
    _getActorDimensions: function() {
        let [success, box] = this.actor.get_paint_box();
        let x, y, width, height, px, py;
        [px, py] = this.actor.get_position();
        if (success) {
            [x, y] = [box.x1, box.y1];
            [width, height] = [box.x2 - x, box.y2 - y];
        } else {
            [width, height] = this.actor.get_size();
        }
        return [px, py, width, height];
    },

    /*
     * set the anchor position (the position, where we grab the windows with
     * the mouse pointer)
     */
    _setAnchorPosition: function(x, y) {
        let [ax, ay, width, height] = this._getActorDimensions();
        x -= ax; y -= ay;

        let gridX = Math.round(x / width * (GRID_WIDTH - 1));
        let gridY = Math.round(y / height * (GRID_HEIGHT - 1));

        this._setAnchorObject(this._objectAt(gridX, gridY));
    },

    _invalidateModel: function() {
        this._hasModel = false;
    },

    _createModel: function() {
        let actor = this.get_actor();
        if (!actor)
            return false;

        let [ax, ay, width, height] = this._getActorDimensions();

        this.objects = [];

        for (let i = 0; i < GRID_WIDTH; i++) {
            for (let j = 0; j < GRID_HEIGHT; j++) {
                let tx = j / (GRID_WIDTH - 1);
                let ty = i / (GRID_HEIGHT - 1);

                let x = tx * width;
                let y = ty * height;

                let obj = new WobblyWindowObject(ax + x, ay + y);

                this.objects.push(obj);
            }
        }

        let xRest = width / (GRID_WIDTH - 1);
        let yRest = height / (GRID_HEIGHT - 1);

        this.springs = [];

        for (let y = 0; y < GRID_WIDTH; y++) {
            for (let x = 0; x < GRID_HEIGHT; x++) {
                if (x > 0) {
                    let objA = this._objectAt(x - 1, y);
                    let objB = this._objectAt(x, y);
                    this.springs.push(new
                        WobblyWindowSpring(objA, objB, xRest, 0));
                }

                if (y > 0) {
                    let objA = this._objectAt(x, y - 1);
                    let objB = this._objectAt(x, y);
                    this.springs.push(new
                        WobblyWindowSpring(objA, objB, 0, yRest));
                }
            }
        }

        this._hasModel = true;
        return true;
    },

    _ensureModel: function() {
        if (!this._hasModel)
            return this._createModel();
        return true;
    },

    _positionChanged: function(oldX, oldY, newX, newY) {
        if (this._anchorObject)
            this._anchorObject.move(newX - oldX, newY - oldY);
    },

    _allocationChanged: function(actor, allocation, flags) {
        if (!this._oldAllocation) {
            let [newX, newY] = allocation.get_origin();
            let [newW, newH] = allocation.get_size();
            this._oldX = newX;
            this._oldY = newY;
            this._oldW = newW;
            this._oldH = newH;
            this._oldAllocation = true;
            return;
        }

        let [newX, newY] = allocation.get_origin();
        let [newW, newH] = allocation.get_size();

        if (this._oldX != newX || this._oldY != newY)
            this._positionChanged(this._oldX, this._oldY, newX, newY);

        if (this._oldW != newW || this._oldH != newH)
            this._invalidateModel();

        this._oldX = newX;
        this._oldY = newY;
        this._oldW = newW;
        this._oldH = newH;
    },

    _modelStep: function() {
        if (!this._ensureModel())
            return;

        const friction = settings.friction;
        const k = settings.springK;

        this.springs.forEach(function(s) {
            s.step(friction, k);
        });

        let totalForce = 0, totalVelocity = 0;
        this.objects.forEach(function(o) {
            let [force, velocity] = o.step(friction, k);
            totalForce += force;
            totalVelocity += velocity;
        });

        if (totalForce > 0)
            this.isWobbling = true;

        const epsilon = EPSILON;

        // If the user is still grabbing on to the window, we don't
        // want to remove the effect, even if we've temporarily stopped
        // wobbling: if the user starts moving the window again, the
        // wobbling will have stopped.
        if (this.allowStop && this.isWobbling && totalVelocity < epsilon)
            this.remove();
    },

    ungrabbed: function() {
        // If we're wobbling, allow us to stop in the near future
        // when we stop wobbling. If we're not wobbling, remove
        // us now.
        if (this.isWobbling)
            this.allowStop = true;
        else
            this.remove();
    },

    remove: function() {
        let actor = this.get_actor();
        if(actor)
            actor.remove_effect(this);
        Meta.remove_clutter_debug_flags( 0, 1 << 6, 0 ); // CLUTTER_DEBUG_CONTINUOUS_REDRAW
    },

    _newFrame: function() {
        this._modelStep();
        this.invalidate();
    },

    vfunc_notify: function(pspec) {
        // If someone changes the tile properties on us, make sure
        // to build a new model next time.
        if (pspec.name == "x-tiles" || pspec.name == "y-tiles" &&
            this._hasModel)
            this._invalidateModel();
    },

    _bezierPatchEvaluate: function (u, v) {
        let coeffsU = new Array(4);
        let coeffsV = new Array(4);
        let x, y;

        coeffsU[0] = (1 - u) * (1 - u) * (1 - u);
        coeffsU[1] = 3 * u * (1 - u) * (1 - u);
        coeffsU[2] = 3 * u * u * (1 - u);
        coeffsU[3] = u * u * u;

        coeffsV[0] = (1 - v) * (1 - v) * (1 - v);
        coeffsV[1] = 3 * v * (1 - v) * (1 - v);
        coeffsV[2] = 3 * v * v * (1 - v);
        coeffsV[3] = v * v * v;

        x = 0;
        y = 0;
        for (let i = 0; i < 4; i++)
        {
            for (let j = 0; j < 4; j++)
            {
                x += coeffsU[i] * coeffsV[j] *
                    this.objects[j * GRID_WIDTH + i].posX;
                y += coeffsU[i] * coeffsV[j] *
                    this.objects[j * GRID_WIDTH + i].posY;
            }
        }
        return [x, y];
    },

    vfunc_deform_vertex: function(width, height, vertex) {
        let [ax, ay] = this.actor.get_position();

        // Objects are in the space of the actor's parent, and these
        // vertexes are in the space of the actor.
        [vertex.x, vertex.y] = this._bezierPatchEvaluate
            (vertex.x / width, vertex.y / height);
        [vertex.x, vertex.y] = [vertex.x - ax, vertex.y - ay];
    },

    vfunc_set_actor: function(actor) {
        let oldActor = this.get_actor();

        if (oldActor && this._allocationChangedId > 0) {
            oldActor.disconnect(this._allocationChangedId);
            this._allocationChangedId = 0;
        }

        if (this._timeline) {
            this._timeline.run_dispose();
            this._timeline = null;
        }

        if (actor) {
            this._allocationChangedId = actor.connect('allocation-changed',
                Lang.bind(this, this._allocationChanged));

            this._timeline = new Clutter.Timeline({ duration: 1000*1000 });
            this._timeline.connect('new-frame',
                Lang.bind(this, this._newFrame));
            this._timeline.start();
        }

        this.parent(actor);

        if (actor)
            this._ensureModel();
    }
});


let _beginGrabOpId;
let _endGrabOpId;

function onBeginGrabOp(display, screen, window, op) {
    let actor = (window) ? window.get_compositor_private() : null;
    if (actor) {
        let effect;
        effect = actor.get_effect('wobbly');
        if (!effect) {
            effect =
                new WobblyWindowEffect({
                    x_tiles: settings.gridRes, y_tiles: settings.gridRes });
            // This is a workaround for issue of leaving window artifacts when animating,
            // we enable it only during the animation sequence so users don't need to set
            // it using export CLUTTER_PAINT...
            Meta.add_clutter_debug_flags( 0, 1 << 6, 0 ); // CLUTTER_DEBUG_CONTINUOUS_REDRAW
            actor.add_effect_with_name('wobbly', effect);
        }

        let [x, y, mods] = global.get_pointer();
        effect._setAnchorPosition(x, y);
    }
}

function onEndGrabOp(display, screen, window, op) {
    let actor = (window) ? window.get_compositor_private() : null;
    if(actor) {
        let effect = actor.get_effect('wobbly');
        if (effect)
            effect.ungrabbed();
    }
}

function init(metadata)
{
    settings = new SettingsHandler(metadata.uuid);
}

function SettingsHandler(uuid) {
    this._init(uuid);
}

SettingsHandler.prototype = {
    _init: function(uuid) {
        this.settings = new Settings.ExtensionSettings(this, uuid);
        this.settings.bindProperty(Settings.BindingDirection.IN,
            "friction", "friction", function(){});
        this.settings.bindProperty(Settings.BindingDirection.IN,
            "springK", "springK", function(){});
        this.settings.bindProperty(Settings.BindingDirection.IN,
            "gridRes", "gridRes", function(){});
    }
}

function enable() {
    _beginGrabOpId = global.display.connect('grab-op-begin', onBeginGrabOp);
    _endGrabOpId = global.display.connect('grab-op-end', onEndGrabOp);
}

function disable() {
    global.display.disconnect(_beginGrabOpId);
    global.display.disconnect(_endGrabOpId);
    global.get_window_actors().forEach(function (actor) {
        actor.remove_effect_by_name('wobbly');
    });
}
