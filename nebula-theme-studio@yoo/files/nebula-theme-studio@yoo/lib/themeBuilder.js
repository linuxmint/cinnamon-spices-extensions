/* themeBuilder.js — 核心：把 Nebula 源主题 + JSON 参数 → 写入 ~/.themes 的定制主题
 *
 * 流水线：复制源主题到 ~/.themes/<Variant>-Studio → 参数化改写三份 CSS（cinnamon /
 * gtk-3.0 / gtk-4.0：颜色角色全局换字面量、透明度按 (选择器, 属性, 色板) 定位缩放、
 * 圆角/字号/面板高度按 (选择器, 属性) 定位）→ 重写 index.theme 与 metacity 主题名。
 * 设计原则：**源主题永远不被改动**，生成物是独立目录，删掉即回到原主题。
 */

const Fs = require('./lib/fsutil');
const Css = require('./lib/cssdoc');
const Palette = require('./lib/palette');
const Color = require('./lib/color');

const CSS_FILES = [
    'cinnamon/cinnamon.css',
    'gtk-3.0/gtk.css',
    'gtk-4.0/gtk.css'
];

/** 透明度参数 → 定位规则的映射 */
const OPACITY_PARAMS = {
    'panel-opacity': 'panel',
    'menu-opacity': 'menu',
    'hover-opacity': 'hover',
    'window-opacity': 'window'
};

function percentToAlpha(value) {
    const n = Number(value);
    if (!isFinite(n)) return null;
    return Math.max(0, Math.min(100, n)) / 100;
}

/** 生成的主题目录里的标记文件：既用于排错，也是「这套主题是我们生成的」的凭据 */
const MARKER_FILE = '.nebula-studio.json';

function markerPath(homeDir, themeName) {
    return `${homeDir}/.themes/${themeName}/${MARKER_FILE}`;
}

/**
 * 这套主题是不是本扩展生成的：只有带标记文件的主题才允许被「切换补全」接管，
 * 用户换第三方主题、或故意让 shell 与 GTK 用不同搭配时原样尊重。
 */
function isGeneratedTheme(themeName, homeDir) {
    if (!themeName) return false;
    const path = markerPath(homeDir, themeName);
    if (!Fs.exists(path)) return false;

    try {
        const data = JSON.parse(Fs.readText(path));
        return !!data && data.name === themeName;
    } catch (e) {
        return false;
    }
}

function readMarker(themeName, homeDir) {
    const path = markerPath(homeDir, themeName);
    if (!Fs.exists(path)) return null;
    try {
        return JSON.parse(Fs.readText(path));
    } catch (e) {
        return null;
    }
}

/** 删除一个生成的主题目录 */
function removeGeneratedTheme(themeName, homeDir) {
    if (!themeName) return false;
    return Fs.removeTree(`${homeDir}/.themes/${themeName}`);
}

/**
 * 读取参数 → 生成主题
 *
 * @param options.targetName 目标目录名；缺省用该变体的工作主题名（Nebula-*-Studio）
 * @param options.presetName 来自哪个方案（写进标记文件，便于回溯）
 */
function build(options) {
    const extensionDir = options.extensionDir;
    const homeDir = options.homeDir;
    const variantId = options.variantId;
    const params = options.params || {};

    const variant = Palette.getVariant(variantId);
    const sourceDir = resolveSourceDir(extensionDir, homeDir, variantId);
    const targetName = options.targetName || variant.generated;
    const targetDir = `${homeDir}/.themes/${targetName}`;

    if (targetName === variant.id) {
        throw new Error(`拒绝覆盖源主题 ${variant.id}`);
    }

    const stats = {
        colorSwaps: 0, alphaRules: 0, alphaValues: 0, sizeRules: 0,
        files: [], sharedVars: []
    };

    // 1) 重建目标目录
    Fs.removeTree(targetDir);
    Fs.copyTree(sourceDir, targetDir);

    // 2) 改写 CSS
    const overrides = Palette.buildColorOverrides(variantId, params);
    for (const rel of CSS_FILES) {
        const abs = `${targetDir}/${rel}`;
        if (!Fs.exists(abs)) continue;
        const original = Fs.readText(abs);
        const { text, fileStats } = transformStylesheet(original, rel, variantId, params, overrides);
        if (text !== original) Fs.writeText(abs, text);
        stats.files.push(rel);
        accumulate(stats, fileStats);
    }

    // 3) 主题名自洽化
    rewriteIndexTheme(`${targetDir}/index.theme`, targetName, variant);
    rewriteMetacityName(`${targetDir}/metacity-1/metacity-theme-3.xml`, targetName);

    // 4) 记录本次参数，便于「重置」与排错
    Fs.writeText(markerPath(homeDir, targetName), JSON.stringify({
        variant: variantId,
        name: targetName,
        preset: options.presetName || null,
        isWorkingTheme: targetName === variant.generated,
        created: new Date().toISOString(),
        params: sanitize(params)
    }, null, 4));

    return { name: targetName, dir: targetDir, sourceDir, variant: variantId, stats };
}

function accumulate(target, source) {
    target.colorSwaps += source.colorSwaps;
    target.alphaRules += source.alphaRules;
    target.alphaValues += source.alphaValues;
    target.sizeRules += source.sizeRules;
    for (const name of source.sharedVars || []) {
        if (target.sharedVars.indexOf(name) < 0) target.sharedVars.push(name);
    }
}

/** 优先用扩展内置的源主题；万一缺失则退回用户 ~/.themes 里的同名主题 */
function resolveSourceDir(extensionDir, homeDir, variantId) {
    const bundled = `${extensionDir}/themes/${variantId}`;
    if (Fs.isDirectory(bundled)) return bundled;

    const installed = `${homeDir}/.themes/${variantId}`;
    if (Fs.isDirectory(installed)) return installed;

    throw new Error(`找不到主题源目录: ${variantId}`);
}

/* -------------------------------------------------------------- CSS 改写 */

function transformStylesheet(text, relPath, variantId, params, overrides) {
    const stats = { colorSwaps: 0, alphaRules: 0, alphaValues: 0, sizeRules: 0, sharedVars: [] };

    // —— 颜色角色：全局字面量替换 ——
    // 这一步刻意放在解析之前：@define-color 语句不是规则，但同样要跟着改。
    let out = text;
    for (const roleName of Object.keys(overrides)) {
        // bg / panel / surface 跳过全局替换：浅色主题里它们与前景、或彼此之间
        // 共用同一字面量，全局换会染掉文字或互相吞掉，各走下面的专用通道。
        if (roleName === 'bg' || roleName === 'panel' || roleName === 'surface') continue;
        const from = variantRole(variantId, roleName);
        if (!from) continue;
        const result = Css.replaceRgbLiteral(out, from, overrides[roleName]);
        out = result.text;
        stats.colorSwaps += result.count;
    }

    // —— 主背景色 1/2：@define-color 里背景类变量的定义（define 不是规则，解析器看不见）——
    if (overrides.bg) {
        const bgFrom = variantRole(variantId, 'bg');
        if (bgFrom) {
            const bgDefines = Css.replaceBgDefineLiterals(out, bgFrom, overrides.bg);
            out = bgDefines.text;
            stats.colorSwaps += bgDefines.count;
        }
    }

    // —— 面板/菜单背景色 1/2：按变量名白名单替换 define ——
    // 变量定义没有选择器作用域，只能按名字认领（Palette.SCOPED_BG_DEFINES）。
    const SCOPED_GROUPS = [
        { group: 'panel', role: 'panel' },
        { group: 'menu', role: 'surface' }
    ];
    for (const { group, role } of SCOPED_GROUPS) {
        if (!overrides[role]) continue;
        const from = variantRole(variantId, role);
        if (!from) continue;
        const named = Css.replaceNamedDefineLiterals(out, Palette.SCOPED_BG_DEFINES[group], from, overrides[role]);
        out = named.text;
        stats.colorSwaps += named.count;
    }

    const nodes = Css.parse(out);
    const variant = Palette.getVariant(variantId);
    const isCinnamon = relPath.indexOf('cinnamon') === 0;

    // —— 主背景色 2/2：规则体内只换背景类属性（白名单见 Palette.BG_PROPS）——
    // 必须先于透明度缩放：窗口不透明度的锚点是「换色之后」的背景 RGB。
    if (overrides.bg) {
        const bgFrom = variantRole(variantId, 'bg');
        if (bgFrom) {
            const bgRules = Css.transformRules(nodes, {
                props: Palette.BG_PROPS,
                fn: (prop, value) => Css.replaceRgbLiteral(value, bgFrom, overrides.bg).text
            });
            stats.colorSwaps += bgRules.values;
        }
    }

    // —— 面板/菜单背景色 2/2：规则体内按 SELECTORS 作用域 + 背景类属性白名单 ——
    // 浅色主题里两个角色同字面量，先换面板再换菜单，两个选择器集合不相交。
    // 同样必须先于透明度缩放（面板/菜单不透明度的锚点是换色后的 RGB）。
    for (const { group, role } of SCOPED_GROUPS) {
        if (!overrides[role]) continue;
        const from = variantRole(variantId, role);
        if (!from) continue;
        const scoped = Css.transformRules(nodes, {
            selectors: Palette.SCOPED_COLOR_SELECTORS[group],
            props: Palette.BG_PROPS,
            fn: (prop, value) => Css.replaceRgbLiteral(value, from, overrides[role]).text
        });
        stats.colorSwaps += scoped.values;
    }

    const addCounts = counters => {
        stats.alphaRules += counters.rules;
        stats.alphaValues += counters.values;
        stats.sizeRules += counters.rules;
        for (const name of counters.shared || []) {
            if (stats.sharedVars.indexOf(name) < 0) stats.sharedVars.push(name);
        }
    };

    // —— 透明度：按各组参考 alpha 等比缩放 ——
    // 锚点用的是「换色之后」的实际色值（见 Palette.effectiveAnchors），
    // 所以换色与调透明度可以叠加使用。
    const alphaTargets = [];

    for (const key of Object.keys(OPACITY_PARAMS)) {
        const groupName = OPACITY_PARAMS[key];
        const alpha = percentToAlpha(params[key]);
        if (alpha === null) continue;

        const anchors = Palette.effectiveAnchors(variantId, groupName, overrides);
        const ref = Palette.opacityRefAlpha(variantId, groupName);
        if (anchors.length === 0 || !(ref > 0)) continue;

        const selectors = Palette.SELECTORS[groupName];
        alphaTargets.push({ groupName, selectors, anchors, ref, alpha });

        // 规则里直接写字面量的
        addCounts(Css.transformRules(nodes, {
            selectors,
            props: Palette.ALPHA_PROPS,
            fn: (prop, value) => Css.scaleAlphaInValue(value, anchors, ref, alpha)
        }));
    }

    // 规则里以 @nebula_xxx 变量中转的，统一放到最后一遍处理
    // （要先看完所有组的字面量结果，才能判断一个变量到底归哪一组）
    addCounts(scaleVariablesByGroup(nodes, alphaTargets));

    // —— 强调淡底浓度：只动「淡强调底」那一个 alpha，不碰描边与焦点环 ——
    const selectionAlpha = percentToAlpha(params['selection-alpha']);
    const accentRgb = Palette.effectiveRgb(variantId, 'accent', overrides);
    if (selectionAlpha !== null && accentRgb) {
        addCounts(Css.transformRules(nodes, {
            props: null,
            fn: (prop, value) => Css.replaceAlphaForRgb(
                value, accentRgb, variant.softAccentAlpha, selectionAlpha)
        }));
    }

    // —— 圆角 ——
    const windowRadius = toPx(params['window-radius']);
    if (windowRadius !== null) {
        const spec = Palette.RADIUS_TOKENS.window;
        addCounts(Css.transformRules(nodes, {
            props: Palette.WINDOW_RADIUS_PROPS,
            exclude: Palette.WINDOW_RADIUS_EXCLUDE,
            fn: (prop, value) => Css.replacePxTokens(value, spec.tokens, spec.ref, windowRadius)
        }));
    }

    const controlRadius = toPx(params['control-radius']);
    if (controlRadius !== null) {
        const spec = Palette.RADIUS_TOKENS.control;
        addCounts(Css.transformRules(nodes, {
            props: Palette.CONTROL_RADIUS_PROPS,
            fn: (prop, value) => Css.replacePxTokens(value, spec.tokens, spec.ref, controlRadius)
        }));
    }

    // —— 字号（只有 Cinnamon 侧用 pt 绝对字号）——
    const baseFont = Number(params['base-font-size']);
    if (isCinnamon && isFinite(baseFont) && baseFont > 0 && baseFont !== Palette.BASE_FONT_PT) {
        const factor = baseFont / Palette.BASE_FONT_PT;
        addCounts(Css.transformRules(nodes, {
            props: ['font-size'],
            fn: (prop, value) => Css.scalePtSize(value, factor)
        }));
    }

    return { text: Css.stringify(nodes), fileStats: stats };
}

function variantRole(variantId, roleName) {
    const rgb = Palette.getVariant(variantId).roles[roleName];
    if (!rgb) return null;
    return { r: rgb[0], g: rgb[1], b: rgb[2] };
}

/**
 * 缩放「被规则以变量方式引用」的透明度：GTK 侧大量用 @define-color 中转颜色
 * （GTK 里变量优先级高于字面量，写字面量不起作用），只改字面量会让菜单/popover
 * 的不透明度失效。归属判定：一个变量的**所有引用都归同一组**才改它的定义值；
 * 有组外引用或分属多组则不碰，记进 shared 供排错。
 */
function scaleVariablesByGroup(nodes, targets) {
    const counters = { rules: 0, values: 0, shared: [] };
    if (targets.length === 0) return counters;

    const usage = Css.collectVarUsage(nodes, Palette.ALPHA_PROPS);

    for (const [name, refs] of usage) {
        // 逐条引用判断它落在哪几组里
        let owner = null;
        let outside = 0;
        let ambiguous = false;

        for (const ref of refs) {
            const groups = targets
                .filter(t => Css.selectorMatches(ref.node, t.selectors))
                .map(t => t.groupName);

            if (groups.length === 0) {
                outside++;
                continue;
            }
            if (groups.length > 1) {
                ambiguous = true;          // 单条引用就横跨多组
                break;
            }
            if (owner === null) {
                owner = groups[0];
            } else if (owner !== groups[0]) {
                ambiguous = true;          // 不同引用落在不同组
                break;
            }
        }

        // 全部引用都在组外 → 与透明度参数无关，不碰也不报
        if (!ambiguous && owner === null && outside === refs.length) continue;

        // 归属不唯一 → 宁可不改，改定义会波及别的语义
        if (ambiguous || outside > 0) {
            counters.shared.push(name);
            continue;
        }

        const target = targets.find(t => t.groupName === owner);
        if (Css.rewriteDefine(nodes, name, value =>
            Css.scaleAlphaInValue(value, target.anchors, target.ref, target.alpha))) {
            counters.rules++;
            counters.values++;
        }
    }

    return counters;
}

function toPx(value) {
    const n = Number(value);
    if (!isFinite(n)) return null;
    return Math.max(0, Math.round(n));
}

function sanitize(params) {
    const out = {};
    for (const key of Object.keys(params)) {
        const value = params[key];
        if (value === null || value === undefined) continue;
        out[key] = value;
    }
    return out;
}

/* -------------------------------------------------------------- 主题名改写 */

function rewriteIndexTheme(path, newName, variant) {
    if (!Fs.exists(path)) {
        Fs.writeText(path, defaultIndexTheme(newName, variant));
        return;
    }

    const text = Fs.readText(path);
    let out = text;

    out = out.replace(/^Name\s*=.*$/m, `Name=${newName}`);
    out = out.replace(/^Comment\s*=.*$/m,
        `Comment=Nebula Theme Studio 生成（源主题 ${variant.id} + 自定义参数）`);
    out = out.replace(/^GtkTheme\s*=.*$/m, `GtkTheme=${newName}`);
    out = out.replace(/^MetacityTheme\s*=.*$/m, `MetacityTheme=${newName}`);

    // 补齐缺失字段
    if (!/^Name\s*=/m.test(out)) out = out.replace(/(\[Desktop Entry\])/, `$1\nName=${newName}`);
    if (!/^GtkTheme\s*=/m.test(out)) {
        out = out.replace(/(\[X-GNOME-Metatheme\])/, `$1\nGtkTheme=${newName}`);
    }
    if (!/^MetacityTheme\s*=/m.test(out)) {
        out = out.replace(/(\[X-GNOME-Metatheme\])/, `$1\nMetacityTheme=${newName}`);
    }

    if (out !== text) Fs.writeText(path, out);
}

function defaultIndexTheme(newName, variant) {
    return [
        '[Desktop Entry]',
        'Type=X-GNOME-Metatheme',
        `Name=${newName}`,
        'Comment=Nebula Theme Studio 生成',
        'Encoding=UTF-8',
        '',
        '[X-GNOME-Metatheme]',
        `GtkTheme=${newName}`,
        `MetacityTheme=${newName}`,
        'ButtonLayout=:minimize,maximize,close',
        ''
    ].join('\n');
}

function rewriteMetacityName(path, newName) {
    if (!Fs.exists(path)) return;
    const text = Fs.readText(path);
    const out = text.replace(/(<name>)[^<]*(<\/name>)/, `$1${newName}$2`);
    if (out !== text) Fs.writeText(path, out);
}

module.exports = {
    MARKER_FILE,
    build,
    transformStylesheet,
    resolveSourceDir,
    isGeneratedTheme,
    readMarker,
    removeGeneratedTheme,
    markerPath,
    CSS_FILES,
    OPACITY_PARAMS
};