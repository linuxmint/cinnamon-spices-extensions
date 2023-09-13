const Meta = imports.gi.Meta;
const Settings = imports.ui.settings;
const {SHADOW_CLASS_NAMES, SHADOW_STATES, SHADOW_PARAMS, FALLBACK_SHADOW_CLASSES} = require('src/constants');
const {getPresets} = require('src/presets');
const {safeGet} = require('src/utils');

class UserShadowsExtension {
    constructor(meta) {
        this._meta = meta;
        this._instanceId = (Date.now() + Math.floor(Math.random() * 1000000)).toString(16);
    }

    enable() {
        this._shadowFactory = Meta.ShadowFactory.get_default();
        this._presets = {
            default: this._retrieveShadowClasses(),
            ...getPresets(),
        };

        this._settings = {};
        this._settingsDb = new Settings.ExtensionSettings(this._settings, this._meta.uuid);
        this._settingsDb.bind('preset', 'preset', this._applySettings.bind(this));
        this._settingsDb.bind('customClasses', 'customClasses', this._applySettings.bind(this));
        this._setExtensionVars();

        this._applySettings();
    }

    disable() {
        if (this._settingsDb) {
            this._settingsDb.finalize();
            this._settingsDb = null;
        }

        try {
            if (this._presets && this._presets.default) {
                this._applyShadowClasses(this._presets.default);
            }
        } catch (err) {
            global.logError(err);
        }
    }

    _setExtensionVars() {
        const ref = {};
        const set = () => {
            if (safeGet(ref.value, '_instanceId') === this._instanceId) {
                return;
            }
            this._settingsDb.setValue('_extensionVars', {
                _instanceId: this._instanceId,
                classNames: SHADOW_CLASS_NAMES,
                states: SHADOW_STATES,
                params: SHADOW_PARAMS,
                presets: this._presets,
            });
        };
        set();
        this._settingsDb.bindWithObject(ref, '_extensionVars', 'value', set, null);
    }

    _applySettings() {
        const preset = this._settings.preset;
        if (preset !== '_custom') {
            this._applyShadowClasses(this._presets[preset]);
        } else {
            this._applyShadowClasses(this._settings.customClasses);
        }
    }

    _applyShadowClasses(shadowClasses) {
        for (const className of SHADOW_CLASS_NAMES) {
            this._shadowFactory.set_params(
                className,
                true,
                this._deserializeShadowParams(shadowClasses, className, SHADOW_STATES.focused)
            );
            this._shadowFactory.set_params(
                className,
                false,
                this._deserializeShadowParams(shadowClasses, className, SHADOW_STATES.unfocused)
            );
        }
    }

    _retrieveShadowClasses() {
        const shadowClasses = {};
        for (const className of SHADOW_CLASS_NAMES) {
            const focusedParams = this._serializeShadowParams(this._shadowFactory.get_params(className, true));
            const unfocusedParams = this._serializeShadowParams(this._shadowFactory.get_params(className, false));
            if (focusedParams && unfocusedParams) {
                shadowClasses[className] = [
                    focusedParams, // index == SHADOW_STATES.focused
                    unfocusedParams, // index == SHADOW_STATES.unfocused
                ];
            }
        }
        return shadowClasses;
    }

    _deserializeShadowParams(shadowClasses, className, stateIndex) {
        const params = safeGet(shadowClasses, className, stateIndex);
        const fallbackParams = (FALLBACK_SHADOW_CLASSES[className] || FALLBACK_SHADOW_CLASSES.normal)[stateIndex];
        return new Meta.ShadowParams({
            radius: this._deserializeShadowParam(params, fallbackParams, SHADOW_PARAMS.radius),
            top_fade: this._deserializeShadowParam(params, fallbackParams, SHADOW_PARAMS.topFade),
            x_offset: this._deserializeShadowParam(params, fallbackParams, SHADOW_PARAMS.xOffset),
            y_offset: this._deserializeShadowParam(params, fallbackParams, SHADOW_PARAMS.yOffset),
            opacity: this._deserializeShadowParam(params, fallbackParams, SHADOW_PARAMS.opacity),
        });
    }

    _deserializeShadowParam(params, fallbackParams, paramProps) {
        let value = safeGet(params, paramProps.index);
        if (typeof value !== 'number') {
            value = fallbackParams[paramProps.index];
            if (typeof value !== 'number') {
                value = 0;
            }
        }
        if (value < paramProps.min) {
            return paramProps.min;
        }
        if (value > paramProps.max) {
            return paramProps.max;
        }
        return value;
    }

    _serializeShadowParams(shadowParams) {
        if (typeof shadowParams !== 'object' || typeof shadowParams.radius !== 'number') {
            return undefined;
        }
        return [
            shadowParams.radius, // index == SHADOW_PARAMS.radius.index
            shadowParams.top_fade, // index == SHADOW_PARAMS.topFade.index
            shadowParams.x_offset, // index == SHADOW_PARAMS.xOffset.index
            shadowParams.y_offset, // index == SHADOW_PARAMS.yOffset.index
            shadowParams.opacity, // index == SHADOW_PARAMS.opacity.index
        ];
    }
}

module.exports = UserShadowsExtension;
