/* palette.js — 两个 Nebula 变体的色板角色、默认参数、以及参数→CSS 的定位规则
 *
 * 同一语义角色在主题里有多种写法（#hex / rgb() / rgba() 同值并存），角色替换必须
 * 三种写法一起改，否则留下「半新半旧」的界面。明暗两套色板几乎由对方的 rgba 值 +
 * 同值 hex 构成，因此一份角色表即可覆盖全部颜色字面量，无需逐条枚举选择器。
 */

const Color = require('./lib/color');

const SOURCE_SUFFIX = 'Studio';

const VARIANTS = {
    'Nebula-Dark': {
        id: 'Nebula-Dark',
        label: 'Nebula-Dark（深色）',
        generated: 'Nebula-Dark-' + SOURCE_SUFFIX,
        dark: true,
        softAccentAlpha: 0.15,

        roles: {
            bg: [13, 17, 23],
            surface: [22, 27, 34],
            panel: [28, 33, 40],
            hover: [33, 38, 45],
            border: [48, 54, 61],
            accent: [88, 166, 255],
            danger: [248, 81, 73],
            warn: [210, 153, 34],
            success: [63, 185, 80],
            fg: [230, 237, 243],
            fgDim: [139, 148, 158],
            // 深色主题额外的「未聚焦选中底」，只出现一次，跟随强调色派生
            accentMuted: [58, 90, 125]
        },

        defaults: {
            'bg-color': 'rgb(13,17,23)',
            'panel-color': 'rgb(28,33,40)',
            'menu-color': 'rgb(22,27,34)',
            'accent-color': 'rgb(88,166,255)',
            'fg-color': 'rgb(230,237,243)',
            'fg-dim-color': 'rgb(139,148,158)',
            'border-color': 'rgb(48,54,61)',
            'danger-color': 'rgb(248,81,73)',
            'warn-color': 'rgb(210,153,34)',
            'success-color': 'rgb(63,185,80)',
            'selection-alpha': 15
        },

        // 透明度锚定**色板角色**而非写死 RGB：换色后锚点跟着变，否则「换了色就调不动
        // 透明度」。ref 是参考 alpha —— 参数停在 ref 时缩放系数为 1，不改变原主题观感。
        opacityGroups: {
            panel: { roles: ['panel'], ref: 0.70 },
            menu: { roles: ['surface'], ref: 0.80 },
            hover: { roles: ['hover', 'border'], ref: 0.60 },
            window: { roles: ['bg'], ref: 0.90 }
        }
    },

    'Nebula-Light': {
        id: 'Nebula-Light',
        label: 'Nebula-Light（浅色）',
        generated: 'Nebula-Light-' + SOURCE_SUFFIX,
        dark: false,
        softAccentAlpha: 0.20,

        roles: {
            bg: [255, 255, 255],
            surface: [246, 248, 250],
            // 与 surface 同值：缺此角色时 variantRole/effectiveAnchors 拿 null，
            // 面板色替换与面板透明度锚点会一起失效。
            panel: [246, 248, 250],
            hover: [234, 238, 242],
            border: [208, 215, 222],
            accent: [9, 105, 218],
            danger: [207, 34, 46],
            warn: [154, 103, 0],
            success: [26, 127, 55],
            fg: [31, 35, 40],
            fgDim: [101, 109, 118]
        },

        defaults: {
            'bg-color': 'rgb(255,255,255)',
            'panel-color': 'rgb(246,248,250)',
            'menu-color': 'rgb(246,248,250)',
            'accent-color': 'rgb(9,105,218)',
            'fg-color': 'rgb(31,35,40)',
            'fg-dim-color': 'rgb(101,109,118)',
            'border-color': 'rgb(208,215,222)',
            'danger-color': 'rgb(207,34,46)',
            'warn-color': 'rgb(154,103,0)',
            'success-color': 'rgb(26,127,55)',
            'selection-alpha': 20
        },

        opacityGroups: {
            // 浅色面板与菜单同色（f6f8fa），靠 alpha 与各自选择器集合区分；
            // 锚定 panel 角色：「面板背景色」参数覆盖的是它，锚点必须跟着走。
            panel: { roles: ['panel'], ref: 0.70 },
            menu: { roles: ['surface'], ref: 0.80 },
            hover: { roles: ['hover', 'border'], ref: 0.60 },
            window: { roles: ['bg'], ref: 0.90 }
        }
    }
};

const VARIANT_IDS = Object.keys(VARIANTS);

/** 设置项 → 色板角色的映射（只有这些是可换色参数） */
const COLOR_PARAMS = {
    'bg-color': 'bg',
    'panel-color': 'panel',
    'menu-color': 'surface',
    'accent-color': 'accent',
    'fg-color': 'fg',
    'fg-dim-color': 'fgDim',
    'border-color': 'border',
    'danger-color': 'danger',
    'warn-color': 'warn',
    'success-color': 'success'
};

/* ------------------------------------------------------------------ 选择器集合 */

const SELECTORS = {
    // Cinnamon 面板（含四方向）+ GTK 标题栏 / 工具栏 / 菜单栏
    panel: [
        /^#panel$/,
        /^\.panel$/,
        /^\.panel-(top|bottom|left|right)$/,
        /^(headerbar|\.titlebar)$/,
        /^(toolbar|\.toolbar)$/,
        /^menubar$/
    ],

    // 菜单 / 弹出层 / 提示 / OSD / 日历 / 对话框底
    menu: [
        /^\.menu$/,
        /^\.menu-background$/,
        /^\.appmenu-background$/,
        /^\.appmenu-sidebar$/,
        /^\.popup-menu$/,
        /^\.popup-menu-boxpointer$/,
        /^\.popup-combo-menu$/,
        /^#Tooltip$/,
        /^(tooltip|tooltip\.background)$/,
        /^\.calendar$/,
        /^\.window-caption$/,
        /^\.window-list-preview$/,
        /^\.switcher-list$/,
        /^\.osd-window$/,
        /^\.info-osd$/,
        /^\.modal-dialog$/,
        /^\.dialog$/,
        /^#keyboard$/,
        /^\.keyboard-subkeys$/,
        // 任务栏 hover 的窗口预览气泡：底色在外层 .grouped-window-list-thumbnail-menu
        // 上（内层 .item-box 是 transparent），两层都要列出，只认内层会漏。
        /^\.grouped-window-list-thumbnail-menu$/,
        /^\.grouped-window-list-thumbnail-menu \.item-box$/,
        /^(menu|context-menu)$/,
        // GTK 侧浮层：popover 用 @nebula_bg_alt 变量中转底色，只认 contents 会漏壳
        /^popover$/,
        /^popover\.background$/,
        /^popover > contents$/,
        /^window\.(popup|tooltip)$/,
        /^\.osd$/
    ],

    // 交互态：悬停 / 按下 / 选中
    hover: [/:(hover|active|checked)\b/],

    // 窗口主背景与对话框底。刻意不含 #overview / .expo-background / .switcher-preview-backdrop：
    // 那是概览的遮罩层（源主题里 alpha 0.85），不该被「窗口不透明度」顺带改掉观感。
    window: [
        /^window$/,
        /^window\.background$/,
        /^\.background$/,
        /^\.modal-dialog$/,
        /^\.dialog$/
    ]
};

/** 透明度参数作用到的属性 */
const ALPHA_PROPS = ['background-color', '-arrow-background-color'];

/**
 * 主背景色允许替换的属性（背景类）。刻意排除 color / box-shadow / outline ——
 * 源主题里它们与背景共用同一字面量但语义是前景，跟着换会把按钮文字染成背景色。
 */
const BG_PROPS = [
    'background-color',
    'background',
    'background-gradient-start',
    'background-gradient-end',
    '-arrow-background-color'
];

/**
 * 面板/菜单背景色的 @define-color 变量名白名单：浅色主题两角色同字面量（f6f8fa），
 * 规则体内靠 SELECTORS 作用域区分，变量定义没有作用域只能按名字认领。
 * 刻意不含 insensitive_base_color / theme_unfocused_* —— 那是窗口底色语义。
 */
const SCOPED_BG_DEFINES = {
    panel: ['nebula_panel', 'wm_bg'],
    menu: ['nebula_bg_alt', 'nebula_menu_bg', 'theme_tooltip_bg_color']
};

/**
 * 面板/菜单背景色规则体内替换用的选择器集合：在 SELECTORS 基础上给面板补两类
 * 派生位置（标题栏 :backdrop 与子控件、searchbar/actionbar/toolbar/treeview 表头
 * 等条状 chrome），不换它们会在改面板色后留下一条旧色。仍按 panel 字面量匹配，
 * 深色里用 surface 字面量的位置天然不误伤；不含 .nemo-places-sidebar（内容面板
 * 语义）。透明度通道仍用原 SELECTORS —— 派生位置的 alpha 不跟面板参数走。
 */
const SCOPED_COLOR_SELECTORS = {
    panel: SELECTORS.panel.concat([
        /^(headerbar|\.titlebar)(:backdrop|\s)/,
        /^(searchbar|actionbar)(:backdrop|\s|$)/,
        /(^|\s)(toolbar|\.toolbar)(:backdrop|\s|$)/,
        /^treeview\s+header(\s|:|$)/
    ]),
    menu: SELECTORS.menu
};

/** 圆角：窗口级（大圆角）与控件级（小圆角），并排除标题栏以免破坏其上圆下方形状 */
const WINDOW_RADIUS_EXCLUDE = [/headerbar/, /titlebar/, /^menubar$/];
const WINDOW_RADIUS_PROPS = ['border-radius', '-arrow-border-radius'];
const CONTROL_RADIUS_PROPS = ['border-radius'];

/**
 * 圆角档位：源主题 12px（菜单/窗口/OSD）与 8px（提示/通知）两档、控件统一 6px。
 * window-radius / control-radius 在对应档上等比换算，默认值处系数为 1。
 */
const RADIUS_TOKENS = {
    window: { tokens: [8, 12], ref: 12 },
    control: { tokens: [6], ref: 6 }
};

const BASE_FONT_PT = 10;

/** 需要参与「明暗切换时迁移默认值」的键（两套默认色不同的项） */
function variantSpecificKeys() {
    return Object.keys(COLOR_PARAMS).concat(['selection-alpha']);
}

function getVariant(id) {
    return VARIANTS[id] || VARIANTS['Nebula-Dark'];
}

function isValidVariant(id) {
    return Object.prototype.hasOwnProperty.call(VARIANTS, id);
}

function generatedName(variantId) {
    return getVariant(variantId).generated;
}

function sourceName(variantId) {
    return getVariant(variantId).id;
}

/**
 * 方案名 → 主题目录名（Nebula-<变体>-<方案名>）：保存方案即在 ~/.themes 多出
 * 一套完整主题，系统设置可直接选用。目录名硬约束：不能有空格、不能有
 * / \ : * ? " < > | 与控制字符、不能与源主题或工作主题 Nebula-*-Studio 撞名；
 * 中文目录名 GTK / Cinnamon / metacity 都能正常加载。
 *
 * @returns 合法的主题名；方案名不可用时返回 null
 */
function namedTheme(variantId, label) {
    const variant = getVariant(variantId);
    const clean = sanitizeThemeLabel(label);
    if (!clean) return null;

    const name = `${variant.id}-${clean}`;
    const truncated = name.length > 120 ? name.slice(0, 120) : name;

    // 撞名判断必须放在拼接之后：标签 "Studio" 拼出来正好是工作主题名
    if (truncated === variant.id || truncated === variant.generated) return null;

    return truncated;
}

/** 方案名清洗：空白→连字符、去掉路径与通配符、压缩重复连字符 */
function sanitizeThemeLabel(label) {
    if (typeof label !== 'string') return '';

    let out = label
        .replace(/[\x00-\x1f\x7f]/g, ' ')       // 控制字符
        .replace(/[\\/:*?"<>|]/g, '-')   // 文件名非法字符
        .replace(/\s+/g, '-')            // 所有空白（含全角空格）→ 连字符
        .replace(/-{2,}/g, '-')          // 压缩
        .replace(/^[-.\s]+|[-.\s]+$/g, ''); // 去首尾

    return out;
}

/**
 * 角色 → 目标颜色 的重绘表。
 * 未被用户改动的颜色返回 null，表示保持主题原样。
 */
function buildColorOverrides(variantId, values) {
    const variant = getVariant(variantId);
    const overrides = {};

    for (const key of Object.keys(COLOR_PARAMS)) {
        const roleName = COLOR_PARAMS[key];
        const roleRgb = variant.roles[roleName];
        if (!roleRgb) continue;

        const target = Color.parse(values[key]);
        if (!target) continue;

        const original = { r: roleRgb[0], g: roleRgb[1], b: roleRgb[2] };
        if (Color.equals(target, original, 1)) continue;

        overrides[roleName] = { r: target.r, g: target.g, b: target.b };
    }

    // 深色主题的未聚焦选中底跟随强调色（压暗）
    const accentOverride = overrides.accent;
    if (accentOverride && variant.roles.accentMuted) {
        const derived = Color.shade(accentOverride, -0.35);
        overrides.accentMuted = { r: derived.r, g: derived.g, b: derived.b };
    }

    return overrides;
}

/**
 * 角色在「本次生成结果里」实际使用的 RGB（被用户覆盖则用覆盖值）。
 * 透明度定位必须用换色之后的值：颜色替换先于透明度缩放，否则用户改了强调色后，
 * 悬停态 / 淡强调底的透明度就再也调不动了。
 */
function effectiveRgb(variantId, roleName, overrides) {
    const override = overrides && overrides[roleName];
    if (override) return [override.r, override.g, override.b];

    const base = getVariant(variantId).roles[roleName];
    return base ? [base[0], base[1], base[2]] : null;
}

/** 某组透明度参数对应的实际锚点 RGB 列表 */
function effectiveAnchors(variantId, groupName, overrides) {
    const group = getVariant(variantId).opacityGroups[groupName];
    if (!group) return [];

    const out = [];
    for (const roleName of group.roles) {
        const rgb = effectiveRgb(variantId, roleName, overrides);
        if (rgb) out.push(rgb);
    }
    return out;
}

/** 某组透明度参数的参考 alpha */
function opacityRefAlpha(variantId, groupName) {
    const group = getVariant(variantId).opacityGroups[groupName];
    return group ? group.ref : 0;
}

module.exports = {
    VARIANTS,
    VARIANT_IDS,
    COLOR_PARAMS,
    SELECTORS,
    ALPHA_PROPS,
    BG_PROPS,
    SCOPED_BG_DEFINES,
    SCOPED_COLOR_SELECTORS,
    WINDOW_RADIUS_EXCLUDE,
    WINDOW_RADIUS_PROPS,
    CONTROL_RADIUS_PROPS,
    BASE_FONT_PT,
    RADIUS_TOKENS,
    variantSpecificKeys,
    getVariant,
    isValidVariant,
    generatedName,
    sourceName,
    namedTheme,
    sanitizeThemeLabel,
    buildColorOverrides,
    effectiveRgb,
    effectiveAnchors,
    opacityRefAlpha
};