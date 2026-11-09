/* terminal.js — 终端 ANSI 16 色调色板
 *
 * 终端不吃 GTK 主题（cinnamon.css / gtk.css 对它毫无作用），只能写 gsettings。
 * gnome-terminal 3.52 的 profile 在独立的 relocatable schema：
 *   schema: org.gnome.Terminal.Legacy.Profile
 *   path  : /org/gnome/terminal/legacy/profiles:/:<uuid>/
 *   key   : palette   （16 个 #rrggbb 的数组）
 * 老版 org.gnome.Terminal.ProfilesList:uuid:/ 也一并支持，探测到哪个用哪个。
 * 只改 ANSI 16 色、不碰 background/foreground-color —— 终端明暗继续跟随 GTK 主题。
 */

const Gio = imports.gi.Gio;
const Fs = require('./lib/fsutil');

const LEGACY_SCHEMA = 'org.gnome.Terminal.Legacy.Profile';
/**
 * relocatable 实例路径前缀，完整形态 <前缀><uuid>/。注意 profiles 后面是「/::」——
 * 少一个冒号会写进一个并不存在的实例，gsettings 读真路径完全看不到，表现为「改了没反应」。
 */
const LEGACY_PATH_PREFIX = '/org/gnome/terminal/legacy/profiles:/:';
const OLD_SCHEMA = 'org.gnome.Terminal.ProfilesList';
const PALETTE_KEY = 'palette';

/* ------------------------------------------------------------------ 色板
 *
 * nebula-dark / nebula-light 与两套 Nebula 源主题同源（浅色 0 号用主文字色、
 * 15 号才是底色）；neutral 中等彩度明暗，深浅背景都不刺眼；system 不干预。
 */

const SCHEMES = {
    system: {
        id: 'system',
        label: '跟随系统（不干预）',
        colors: null
    },
    'nebula-dark': {
        id: 'nebula-dark',
        label: 'Nebula 深色',
        colors: [
            '#010409', // 0  black        比背景更深，用于分隔与注释
            '#ff7b72', // 1  red          danger 在深底上偏暗，提到这个亮度
            '#3fb950', // 2  green        success
            '#d29922', // 3  yellow       warn
            '#58a6ff', // 4  blue         accent 原值
            '#bc8cff', // 5  magenta      accent 紫化
            '#39c5cf', // 6  cyan         accent 青化
            '#b1bac4', // 7  white        次要前景
            '#6e7681', // 8  bright black 更暗的灰
            '#ffa198', // 9  bright red
            '#56d364', // 10 bright green
            '#e3b341', // 11 bright yellow
            '#79c0ff', // 12 bright blue
            '#d2a8ff', // 13 bright magenta
            '#56d4dd', // 14 bright cyan
            '#f6f8fa'  // 15 bright white 主前景
        ]
    },
    'nebula-light': {
        id: 'nebula-light',
        label: 'Nebula 浅色',
        colors: [
            '#1f2328', // 0  black        主文字色
            '#cf222e', // 1  red          danger
            '#1a7f37', // 2  green        success
            '#9a6700', // 3  yellow       warn
            '#0969da', // 4  blue         accent
            '#8250df', // 5  magenta
            '#1b7c83', // 6  cyan
            '#656d76', // 7  white        次要文字
            '#8c959f', // 8  bright black
            '#a40e26', // 9  bright red
            '#116329', // 10 bright green
            '#633c01', // 11 bright yellow
            '#218bff', // 12 bright blue
            '#a475f9', // 13 bright magenta
            '#3192aa', // 14 bright cyan
            '#ffffff'  // 15 bright white 浅底终端里这一项是背景色
        ]
    },
    neutral: {
        id: 'neutral',
        label: '中性通用',
        colors: [
            '#3b4252', // 0  black
            '#e06c75', // 1  red
            '#98c379', // 2  green
            '#e5c07b', // 3  yellow
            '#61afef', // 4  blue
            '#c678dd', // 5  magenta
            '#56b6c2', // 6  cyan
            '#dcdfe4', // 7  white
            '#5c6370', // 8  bright black
            '#ef8a92', // 9  bright red
            '#a9d18a', // 10 bright green
            '#f0d399', // 11 bright yellow
            '#7cc0f5', // 12 bright blue
            '#d59ae8', // 13 bright magenta
            '#74c8d3', // 14 bright cyan
            '#f5f7fa'  // 15 bright white
        ]
    }
};

const SCHEME_IDS = Object.keys(SCHEMES);

function getScheme(id) {
    return SCHEMES[id] || null;
}

function isSchemeId(id) {
    return Object.prototype.hasOwnProperty.call(SCHEMES, id);
}

/* ------------------------------------------------------------------ 探测 */

/** 列出 gnome-terminal 的全部 profile：{ uuid, schema, path } */
function listProfiles() {
    const out = [];

    let uuids = [];
    try {
        uuids = new Gio.Settings({ schema_id: OLD_SCHEMA })
            .get_strv('list')
            .filter(uuid => uuid);
    } catch (e) {
        return out;
    }

    for (const uuid of uuids) {
        // 3.52 及以后：独立的 relocatable schema
        const legacyPath = `${LEGACY_PATH_PREFIX}${uuid}/`;
        try {
            const s = new Gio.Settings({ schema_id: LEGACY_SCHEMA, path: legacyPath });
            s.get_strv(PALETTE_KEY);
            out.push({ uuid, schema: LEGACY_SCHEMA, path: legacyPath, settings: s });
            continue;
        } catch (e) { /* 落到老路径 */ }

        // 老版本：org.gnome.Terminal.ProfilesList:<uuid>:/
        const oldPath = `${uuid}:/`;
        try {
            const s = new Gio.Settings({ schema_id: OLD_SCHEMA, path: oldPath });
            s.get_strv(PALETTE_KEY);
            out.push({ uuid, schema: OLD_SCHEMA, path: oldPath, settings: s });
        } catch (e) { /* 这个 profile 读不到，跳过 */ }
    }

    return out;
}

function isAvailable() {
    return listProfiles().length > 0;
}

/* ------------------------------------------------------------------ 落盘 */

/**
 * 强制 dconf 把挂起的写刷出去：GSettings 的写是异步批处理的，两次 apply 挨得近时
 * （滑杆从 70 一下拖回 100），后一次的还原值可能被前一次未落盘的写盖掉 ——
 * 实测出现过「读回来是 50、实际落盘 30」。写完同步一次就按代码顺序定下来了。
 */
function syncSettings() {
    try {
        if (Gio && Gio.Settings && typeof Gio.Settings.sync === 'function') {
            Gio.Settings.sync();
        }
    } catch (e) {
        // 同步只是保险，失败不影响本次写入的结果
    }
}

/* ------------------------------------------------------------------ 备份
 *
 * 「跟随系统」要还原原值而我们无从得知用户原本是什么，所以首次覆盖前先记进状态文件。
 */

const BACKUP_KEY = 'terminalPalettes';
const BACKUP_KEY_ALPHA = 'terminalTransparency';

/** 读某一类备份。调色板跟「跟随系统」还原、透明度跟滑杆回 100 还原，时机不同分两节存。 */
function readBackups(statePath, key) {
    if (!statePath || !Fs.exists(statePath)) return {};
    try {
        const data = JSON.parse(Fs.readText(statePath));
        return (data && data[key || BACKUP_KEY]) || {};
    } catch (e) {
        return {};
    }
}

function writeBackups(statePath, backups, key) {
    const BACKUP_KEY_SLOT = key || BACKUP_KEY;
    if (!statePath) return;
    try {
        let data = {};
        if (Fs.exists(statePath)) {
            data = JSON.parse(Fs.readText(statePath));
            if (!data || typeof data !== 'object') data = {};
        }
        if (Object.keys(backups).length === 0) delete data[BACKUP_KEY_SLOT];
        else data[BACKUP_KEY_SLOT] = backups;
        Fs.writeText(statePath, JSON.stringify(data, null, 4));
    } catch (e) {
        global.logWarning(`[Nebula Theme Studio] 终端备份写入失败 - ${e.message}`);
    }
}

/** 判断某 profile 当前的调色板是否就是本扩展写进去的 */
function isOurs(colors, schemeId) {
    if (!Array.isArray(colors) || colors.length !== 16) return false;
    const scheme = getScheme(schemeId);
    return !!scheme && !!scheme.colors && scheme.colors.join(',') === colors.join(',');
}

/* ------------------------------------------------------------------ 应用 */

/**
 * 应用一套调色板到全部 gnome-terminal profile。
 * schemeId 为 'system' 时还原本扩展覆盖前的值（没有备份就跳过）。
 *
 * @returns { ok, applied, restored, skipped, reason }
 */
function applyScheme(schemeId, options) {
    const statePath = options && options.statePath;
    const profiles = listProfiles();

    if (profiles.length === 0) {
        return { ok: false, applied: 0, restored: 0, skipped: 0, reason: '未找到 gnome-terminal 的配置档案' };
    }

    const backups = readBackups(statePath);
    const result = { ok: true, applied: 0, restored: 0, skipped: 0, reason: '' };

    if (schemeId === 'system') {
        for (const profile of profiles) {
            const backup = backups[profile.uuid];
            if (!Array.isArray(backup) || backup.length !== 16) {
                result.skipped++;
                continue;
            }
            try {
                profile.settings.set_strv(PALETTE_KEY, backup);
                delete backups[profile.uuid];
                result.restored++;
            } catch (e) {
                result.skipped++;
                global.logWarning(`[Nebula Theme Studio] 还原终端调色板失败 - ${e.message}`);
            }
        }
        syncSettings();
        writeBackups(statePath, backups);
        return result;
    }

    const scheme = getScheme(schemeId);
    if (!scheme || !scheme.colors) {
        return { ok: false, applied: 0, restored: 0, skipped: profiles.length, reason: `未知方案 ${schemeId}` };
    }

    for (const profile of profiles) {
        try {
            // 只在第一次覆盖某个 profile 之前记备份；重复应用不覆盖备份
            if (!(profile.uuid in backups)) {
                const current = profile.settings.get_strv(PALETTE_KEY);
                if (Array.isArray(current) && current.length === 16) {
                    backups[profile.uuid] = current;
                }
            }
            profile.settings.set_strv(PALETTE_KEY, scheme.colors);
            result.applied++;
        } catch (e) {
            result.skipped++;
            global.logWarning(`[Nebula Theme Studio] 写入终端调色板失败 - ${e.message}`);
        }
    }

    syncSettings();
    writeBackups(statePath, backups);
    return result;
}

/* ------------------------------------------------------------------ 输入区透明度
 *
 * gnome-terminal 自己的背景透明度只能落到 profile，两个键必须成对使用：
 *   use-transparent-background        总开关，gschema 默认 false
 *   background-transparency-percent   0 = 全不透明，100 = 全透明
 * 本扩展参数用「不透明度」表述（与其它 *-opacity 一致、100 最实），
 * 写入时取反：transparency = 100 - opacity。
 */
const USE_ALPHA_KEY = 'use-transparent-background';
const ALPHA_KEY = 'background-transparency-percent';

/** 滑杆夹紧到 20~100，再换算成 gnome-terminal 的「透明度百分比」 */
function opacityToTransparencyPercent(opacity) {
    const n = Number(opacity);
    const clamped = Math.min(100, Math.max(20, Math.round(Number.isFinite(n) ? n : 100)));
    return 100 - clamped;
}

/**
 * 设置终端输入区的不透明度（与其它 *-opacity 同义，100 = 最实）。
 * 滑杆顶到 100 是**强制完全不透明**而非「恢复原样」；想回自己原本的配置，
 * 走设置里的「恢复原始主题」→ restoreTransparency()。
 *
 * @returns { ok, applied, skipped, reason, percent }
 */
function applyTransparency(opacity, options) {
    const statePath = options && options.statePath;
    const profiles = listProfiles();

    if (profiles.length === 0) {
        return { ok: false, applied: 0, restored: 0, skipped: 0, reason: '未找到 gnome-terminal 的配置档案' };
    }

    const backups = readBackups(statePath, BACKUP_KEY_ALPHA);
    const result = { ok: true, applied: 0, skipped: 0, reason: '', percent: null };
    const percent = opacityToTransparencyPercent(opacity);
    result.percent = percent;

    for (const profile of profiles) {
        try {
            // 只在第一次覆盖之前记备份；重复应用不覆盖备份，否则还原不回去
            if (!(profile.uuid in backups)) {
                backups[profile.uuid] = {
                    [USE_ALPHA_KEY]: tryGetBool(profile, USE_ALPHA_KEY),
                    [ALPHA_KEY]: tryGetInt(profile, ALPHA_KEY)
                };
            }
            profile.settings.set_boolean(USE_ALPHA_KEY, true);
            profile.settings.set_int(ALPHA_KEY, percent);
            result.applied++;
        } catch (e) {
            result.skipped++;
            global.logWarning(`[Nebula Theme Studio] 写入终端透明度失败 - ${e.message}`);
        }
    }

    syncSettings();
    writeBackups(statePath, backups, BACKUP_KEY_ALPHA);
    return result;
}

/**
 * 把输入区透明度还原成本扩展接管之前的值。
 * 滑杆不再承担「不干预」语义（顶到 100 是强制不透明），还原必须有这个明确入口。
 *
 * @returns { ok, restored, skipped, reason }
 */
function restoreTransparency(options) {
    const statePath = options && options.statePath;
    const backups = readBackups(statePath, BACKUP_KEY_ALPHA);

    const list = listProfiles();
    if (list.length === 0) {
        return { ok: false, restored: 0, skipped: 0, reason: '未找到 gnome-terminal 的配置档案' };
    }

    const result = { ok: true, restored: 0, skipped: 0, reason: '' };

    for (const profile of list) {
        const backup = backups[profile.uuid];
        if (!backup || typeof backup !== 'object') {
            result.skipped++;
            continue;
        }
        try {
            profile.settings.set_boolean(USE_ALPHA_KEY, !!backup[USE_ALPHA_KEY]);
            profile.settings.set_int(ALPHA_KEY, Number(backup[ALPHA_KEY]));
            delete backups[profile.uuid];
            result.restored++;
        } catch (e) {
            result.skipped++;
            global.logWarning(`[Nebula Theme Studio] 还原终端透明度失败 - ${e.message}`);
        }
    }

    syncSettings();
    writeBackups(statePath, backups, BACKUP_KEY_ALPHA);
    return result;
}

function tryGetBool(profile, key) {
    try {
        return profile.settings.get_boolean(key);
    } catch (e) {
        return false;
    }
}

function tryGetInt(profile, key) {
    try {
        return profile.settings.get_int(key);
    } catch (e) {
        return 50;
    }
}

/** 当前所有 profile 的输入区不透明度百分比；判不出来返回 null */
function currentTransparencyOpacity() {
    const profiles = listProfiles();
    if (profiles.length === 0) return null;
    let total = 0;
    for (const profile of profiles) {
        if (!tryGetBool(profile, USE_ALPHA_KEY)) return 100;
        total += 100 - tryGetInt(profile, ALPHA_KEY);
    }
    return Math.round(total / profiles.length);
}

/** 当前处于哪一套（无法判定时返回 'custom'） */
function currentScheme() {
    const profiles = listProfiles();
    if (profiles.length === 0) return 'unavailable';

    for (const schemeId of SCHEME_IDS) {
        if (schemeId === 'system') continue;
        if (profiles.every(p => isOurs(tryGet(p), schemeId))) return schemeId;
    }
    return 'custom';
}

function tryGet(profile) {
    try {
        return profile.settings.get_strv(PALETTE_KEY);
    } catch (e) {
        return null;
    }
}

module.exports = {
    SCHEMES,
    LEGACY_PATH_PREFIX,
    SCHEME_IDS,
    LEGACY_SCHEMA,
    OLD_SCHEMA,
    PALETTE_KEY,
    USE_ALPHA_KEY,
    ALPHA_KEY,
    getScheme,
    isSchemeId,
    listProfiles,
    isAvailable,
    applyScheme,
    currentScheme,
    isOurs,
    readBackups,
    applyTransparency,
    restoreTransparency,
    currentTransparencyOpacity,
    opacityToTransparencyPercent
};