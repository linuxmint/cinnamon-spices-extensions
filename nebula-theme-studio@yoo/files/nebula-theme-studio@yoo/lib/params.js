/* params.js — 参数模型：键、默认值、取值、范围校验、明暗默认值迁移
 *
 * settings-schema.json 决定设置面板长什么样，这里决定「参数怎么解释」，键名两边必须同步。
 * 明暗两套只有颜色与「强调淡底浓度」默认值不同，切换时只迁移这些键，且只在用户还停留
 * 在旧默认值时迁移——自己调过的颜色不会被覆盖。
 */

const Color = require('./lib/color');
const Palette = require('./lib/palette');
const Fs = require('./lib/fsutil');

/** 与设置面板一致的参数顺序 */
const PARAM_KEYS = [
    'variant',
    'panel-opacity', 'menu-opacity', 'hover-opacity', 'window-opacity',
    'selection-alpha',
    'bg-color', 'panel-color', 'menu-color',
    'accent-color', 'fg-color', 'fg-dim-color', 'border-color',
    'danger-color', 'warn-color', 'success-color',
    'window-radius', 'control-radius', 'base-font-size',
    'terminal-palette', 'terminal-opacity', 'auto-apply', 'preset-name'
];

/**
 * 不参与 CSS 生成、但要跟着方案保存/应用的参数（终端相关）。
 * 单独列出是为了不混进 THEME_PARAM_KEYS —— 生成器只认颜色/透明度/尺寸三类。
 */
const SIDE_EFFECT_KEYS = ['terminal-palette', 'terminal-opacity'];

/** 参与「生成主题 CSS」的参数；排除 variant / terminal 两项 / auto-apply / preset-name */
const THEME_PARAM_KEYS = PARAM_KEYS.filter(
    key => key !== 'variant' && key !== 'auto-apply' && key !== 'preset-name'
        && SIDE_EFFECT_KEYS.indexOf(key) < 0);

const NUMERIC_RANGES = {
    'panel-opacity': [30, 100],
    'menu-opacity': [20, 100],
    'hover-opacity': [20, 100],
    'window-opacity': [30, 100],
    'selection-alpha': [5, 60],
    'window-radius': [0, 24],
    'control-radius': [0, 16],
    'base-font-size': [8, 14],
    // 终端输入区不透明度。下限 20：再低字就贴着桌面背景读不清了，
    // 和其它透明度参数保持同一条底线。
    'terminal-opacity': [20, 100]
};

/** 与明暗无关的默认值 */
const SHARED_DEFAULTS = {
    'panel-opacity': 70,
    'menu-opacity': 80,
    'hover-opacity': 60,
    'window-opacity': 90,
    'window-radius': 12,
    'control-radius': 6,
    'base-font-size': 10,
    'terminal-palette': 'system',
    // 100 = 完全不透明，也是「不接管」的默认值：终端透明度只在 <100 时才写 gsettings。
    'terminal-opacity': 100,
    'auto-apply': false
};

/** 某个变体下的完整默认值 */
function defaultsFor(variantId) {
    const variant = Palette.getVariant(variantId);
    const out = Object.assign({}, SHARED_DEFAULTS);
    for (const key of Palette.variantSpecificKeys()) {
        out[key] = variant.defaults[key];
    }
    return out;
}

/** 变体 id 是否合法（外部来的值先过这一关再往设置里写） */
function isValidVariantId(id) {
    return Palette.isValidVariant(id);
}

/** 当前生效的变体 id（非法值退回 Nebula-Dark） */
function readVariant(settings) {
    const value = settings ? settings.getValue('variant') : null;
    return Palette.isValidVariant(value) ? value : 'Nebula-Dark';
}

/**
 * 把颜色设置还原成「它其实是某个变体的默认值」：设置面板只有一套 schema，颜色默认值
 * 钉死给 Nebula-Dark，切到 Light 时会拿到深色默认前景（白底白字）。值若等于**任何变体**
 * 的默认值就视为「没自定义过」，改用当前变体的默认值。用户真调到别变体的默认色会被
 * 当成没调过 —— 刻意的取舍，两套明暗默认色差得足够远，撞上的概率极低。
 */
function resolveVariantColor(key, value, variantId) {
    if (!(key in Palette.COLOR_PARAMS)) return value;
    const parsed = Color.parse(value);
    if (!parsed) return value;

    for (const id of Palette.VARIANT_IDS) {
        const defaults = Palette.getVariant(id).defaults;
        if (!(key in defaults)) continue;
        if (!Color.equals(parsed, Color.parse(defaults[key]), 0)) continue;

        // 命中的就是当前变体 → 原样返回
        if (id === variantId) return value;
        // 命中的是别的变体 → 换成**当前**变体的默认值（不是刚才命中的那个）
        const current = Palette.getVariant(variantId).defaults;
        return key in current ? current[key] : value;
    }
    return value;
}

/** 把设置面板上的值读成一份「可直接喂给生成器」的参数表 */
function readParams(settings, variantId) {
    const variant = Palette.isValidVariant(variantId) ? variantId : 'Nebula-Dark';
    const params = {};

    for (const key of THEME_PARAM_KEYS) {
        if (key in NUMERIC_RANGES) {
            const [min, max] = NUMERIC_RANGES[key];
            params[key] = clampNumber(settings.getValue(key), min, max);
        } else if (Palette.COLOR_PARAMS[key]) {
            const fallback = Palette.getVariant(variant).defaults[key];
            const resolved = resolveVariantColor(key, settings.getValue(key), variant);
            const parsed = Color.parse(resolved);
            params[key] = parsed ? Color.toRgbString(parsed) : fallback;
        } else {
            params[key] = settings.getValue(key);
        }
    }

    return params;
}

function clampNumber(value, min, max) {
    const n = Number(value);
    if (!isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
}

/**
 * 切换明暗时迁移「还是旧默认值」的颜色，避免深色调色板被套到浅色主题上。
 * 返回实际迁移的键列表。
 */
function migrateVariantDefaults(settings, fromVariantId, toVariantId) {
    if (fromVariantId === toVariantId) return [];

    const from = Palette.getVariant(fromVariantId);
    const to = Palette.getVariant(toVariantId);
    const migrated = [];

    for (const key of Palette.variantSpecificKeys()) {
        if (!(key in from.defaults) || !(key in to.defaults)) continue;

        const current = settings.getValue(key);
        let isDefault = false;

        if (Palette.COLOR_PARAMS[key]) {
            // 容差取 0：colorchooser 存的是整数 RGB，用户只要差 1 也是「自己调过」，
            // 不应该被默认值覆盖掉。
            isDefault = Color.equals(Color.parse(current), Color.parse(from.defaults[key]));
        } else {
            isDefault = Number(current) === Number(from.defaults[key]);
        }

        if (!isDefault) continue;

        settings.setValue(key, to.defaults[key]);
        migrated.push(key);
    }

    return migrated;
}

/** 把所有可调参数恢复到指定变体的默认值（保留当前变体选择） */
function resetParams(settings, variantId) {
    const defaults = defaultsFor(variantId);
    const changed = [];

    for (const key of THEME_PARAM_KEYS.concat(SIDE_EFFECT_KEYS)) {
        if (!(key in defaults)) continue;
        const current = settings.getValue(key);
        let next = defaults[key];

        if (Palette.COLOR_PARAMS[key]) {
            next = Color.toRgbString(Color.parseOr(next, next));
            if (Color.equals(Color.parse(current), Color.parse(next), 0)) continue;
        } else if (typeof next === 'string' ? current === next : Number(current) === Number(next)) {
            continue;
        }

        settings.setValue(key, next);
        changed.push(key);
    }

    return changed;
}

/** 预设 → 设置面板：把预设里的参数写回 gsettings，让面板显示与预设一致 */
function applyPresetToSettings(settings, preset) {
    const params = preset.params || {};
    const applied = [];
    const skipped = [];

    for (const key of THEME_PARAM_KEYS.concat(SIDE_EFFECT_KEYS)) {
        if (!(key in params)) continue;
        if (SIDE_EFFECT_KEYS.indexOf(key) >= 0) {
            if (typeof params[key] === 'string') {
                settings.setValue(key, params[key]);
                applied.push(key);
            } else if (key in NUMERIC_RANGES) {
                const [min, max] = NUMERIC_RANGES[key];
                settings.setValue(key, clampNumber(params[key], min, max));
                applied.push(key);
            } else {
                skipped.push(key);
            }
            continue;
        }

        if (key in NUMERIC_RANGES) {
            const [min, max] = NUMERIC_RANGES[key];
            settings.setValue(key, clampNumber(params[key], min, max));
            applied.push(key);
        } else if (Palette.COLOR_PARAMS[key]) {
            const parsed = Color.parse(params[key]);
            if (!parsed) {
                skipped.push(key);
                continue;
            }
            settings.setValue(key, Color.toRgbString(parsed));
            applied.push(key);
        }
    }

    return { applied, skipped };
}

/** 当前设置 → 预设负载（CSS 参数 + 终端配色这类副作用参数） */
function paramsForPreset(settings, variantId) {
    const out = readParams(settings, variantId);

    for (const key of SIDE_EFFECT_KEYS) {
        const value = settings.getValue(key);
        // terminal-palette 是字符串选项，terminal-opacity 是数字标量，
        // 两种都收，否则方案会漏掉终端透明度。
        if (typeof value === 'string' || key in NUMERIC_RANGES) out[key] = value;
    }

    return out;
}

/* ===== 按变体记忆参数 =====
 *
 * 存于 ~/.config/nebula-theme-studio/variant-params.json（{ 变体: 参数 }）。
 * migrateVariantDefaults 只搬停在旧默认值的键，用户调过的颜色会被原样带到另一变体
 * （深色调的浅灰字套到浅色上就是白底灰字），所以两变体参数各自独立：切走存档、切回取回。
 */

function variantParamsPath() {
    return imports.gi.GLib.build_filenamev([
        imports.gi.GLib.get_user_config_dir(),
        'nebula-theme-studio', 'variant-params.json'
    ]);
}

/** 设置面板 → 原始参数快照（不做默认值解析，存的就是用户看到的值） */
function snapshotParams(settings) {
    const out = {};
    for (const key of THEME_PARAM_KEYS.concat(SIDE_EFFECT_KEYS)) {
        const value = settings.getValue(key);
        if (typeof value === 'string' || typeof value === 'number'
            || typeof value === 'boolean') {
            out[key] = value;
        }
    }
    return out;
}

function _readVariantStore(path) {
    try {
        const data = JSON.parse(Fs.readText(path));
        return data && typeof data === 'object' ? data : {};
    } catch (e) {
        return {};
    }
}

/** 把某个变体的参数存档（与已有存档合并，别的变体不动） */
function saveVariantParams(variantId, params, path) {
    if (!Palette.isValidVariant(variantId) || !params) return false;
    const storePath = path || variantParamsPath();
    const store = _readVariantStore(storePath);
    store[variantId] = params;
    Fs.ensureDirectory(imports.gi.GLib.build_filenamev([
        imports.gi.GLib.get_user_config_dir(), 'nebula-theme-studio'
    ]));
    Fs.writeText(storePath, JSON.stringify(store, null, 2));
    return true;
}

/** 取回某个变体上次保存的参数；没有存档返回 null（调用方走默认值迁移） */
function loadVariantParams(variantId, path) {
    const store = _readVariantStore(path || variantParamsPath());
    const params = store[variantId];
    return params && typeof params === 'object' ? params : null;
}

/**
 * 存档前的参数归属对账：当前参数是否真的属于 variantId。
 * 见证是桌面正在应用的主题——它由哪个变体生成，参数就属于哪个变体。
 * 扩展离线期间 variant 可能被设置窗拨走而参数没跟上（没人执行切换链），
 * 此时存档会把参数写进错误的变体名下（存档交叉污染），所以存档前必须查。
 *
 * @param shellTheme    org.cinnamon.theme name 的当前值
 * @param markerVariant shellTheme 生成主题 marker 里记录的变体；非生成主题为 null
 * @param variantId     待存档的变体（切换链里的 previous）
 */
function paramsBelongTo(shellTheme, markerVariant, variantId) {
    // 源主题路径（重置/恢复后切回源主题）没有 marker，主题名即变体名
    if (shellTheme === variantId) return true;
    return markerVariant === variantId;
}

module.exports = {
    resolveVariantColor,
    isValidVariantId,
    PARAM_KEYS,
    THEME_PARAM_KEYS,
    SIDE_EFFECT_KEYS,
    NUMERIC_RANGES,
    SHARED_DEFAULTS,
    defaultsFor,
    readVariant,
    readParams,
    clampNumber,
    migrateVariantDefaults,
    resetParams,
    applyPresetToSettings,
    paramsForPreset,
    variantParamsPath,
    snapshotParams,
    saveVariantParams,
    loadVariantParams,
    paramsBelongTo
};