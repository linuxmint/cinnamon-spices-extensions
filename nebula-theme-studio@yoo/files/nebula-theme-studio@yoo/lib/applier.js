/* applier.js — 应用 / 读取主题，以及用户可见的反馈
 *
 * 四处 gsettings 各管一段，缺一不可：
 *   org.cinnamon.theme name                  → Cinnamon 面板/菜单（cinnamon.css）
 *   org.cinnamon.desktop.interface gtk-theme → GTK3 应用（csd-xsettings 经 XSettings
 *     Net/ThemeName 下发，优先级高于 GSettings 与 settings.ini，只写 org.gnome 那份收不到）
 *   org.gnome.desktop.interface gtk-theme    → GTK4 应用 / 非 Cinnamon 桌面
 *   org.gnome.desktop.wm.preferences theme   → 窗口标题栏（metacity）
 */

const TARGETS = [
    { schema: 'org.cinnamon.theme', key: 'name', role: 'shell' },
    { schema: 'org.cinnamon.desktop.interface', key: 'gtk-theme', role: 'gtk3' },
    { schema: 'org.gnome.desktop.interface', key: 'gtk-theme', role: 'gtk4' },
    { schema: 'org.gnome.desktop.wm.preferences', key: 'theme', role: 'wm' }
];

/** 决定 GTK3 应用主题的那个 schema（Cinnamon 的 XSettings 就是从它下发 Net/ThemeName） */
const GTK3_SCHEMA = 'org.cinnamon.desktop.interface';

const _settingsCache = {};

function gsettings(schemaId) {
    if (!(schemaId in _settingsCache)) {
        _settingsCache[schemaId] = new (imports.gi.Gio.Settings)({ schema_id: schemaId });
    }
    return _settingsCache[schemaId];
}

/**
 * 把各处主题名一次性切到 themeName。
 *
 * @param themeName 目标主题名
 * @param options.refreshFrom 中转主题名，用于制造一次真实变化（见 refreshGtkApps）
 * @returns 实际改动成功的项数
 */
function applyTheme(themeName, options) {
    let changed = 0;
    let shellChanged = false;

    for (const target of TARGETS) {
        try {
            const s = gsettings(target.schema);
            if (s.get_string(target.key) === themeName) continue;
            s.set_string(target.key, themeName);
            changed++;
            if (target.role === 'shell') shellChanged = true;
        } catch (e) {
            global.logError(`[Nebula Theme Studio] 设置 ${target.schema} ${target.key} 失败 - ${e.message}`);
        }
    }

    // sync 只是「尽快落盘」，失败也不该让整次应用被当成失败
    try {
        imports.gi.Gio.Settings.sync();
    } catch (e) {
        global.logWarning(`[Nebula Theme Studio] gsettings 落盘失败 - ${e.message}`);
    }

    // 主题名没变时 ThemeManager 不会重新解析 cinnamon.css，
    // 而本扩展的应用流程恰恰是「同名主题目录里的 CSS 被重新生成」，必须显式重载。
    if (!shellChanged) reloadShellTheme();

    if (options && options.refreshFrom) {
        refreshGtkApps(themeName, options.refreshFrom);
    }

    return changed;
}

/**
 * 强制已打开的 GTK3 应用重新读一遍主题：GDK 只在 `Net/ThemeName` 真的变化时
 * 才重载样式，同名主题重新生成时值前后一致，借「中转 → 目标」两段写入制造变化。
 * 中转值取当前变体的源主题（必存在、与生成主题观感几乎一样）；首次切换（值确实变了）不中转。
 *
 * @returns 是否执行了刷新
 */
function refreshGtkApps(themeName, intermediateName) {
    if (!intermediateName || intermediateName === themeName) return false;

    try {
        const s = gsettings(GTK3_SCHEMA);
        if (s.get_string('gtk-theme') !== themeName) return false;

        s.set_string('gtk-theme', intermediateName);
        s.set_string('gtk-theme', themeName);

        try {
            imports.gi.Gio.Settings.sync();
        } catch (e) { /* 落盘失败不影响应用 */ }

        return true;
    } catch (e) {
        global.logWarning(`[Nebula Theme Studio] 刷新 GTK 应用失败 - ${e.message}`);
        return false;
    }
}

/** 让 Cinnamon 立刻重新解析当前主题的 cinnamon.css */
function reloadShellTheme() {
    try {
        imports.ui.main.loadTheme();
    } catch (e) {
        global.logWarning(`[Nebula Theme Studio] 强制重载面板样式失败 - ${e.message}`);
    }
}

/**
 * 把「只改了部分主题名」的半截切换补齐：系统设置里 GTK / Cinnamon chooser
 * 各写各的键、metacity 谁都不碰。目标是否本扩展生成由调用方用标记文件确认。
 *
 * @returns 实际补齐的项数
 */
function completeThemeSwitch(themeName) {
    let filled = 0;

    for (const target of TARGETS) {
        try {
            const s = gsettings(target.schema);
            if (s.get_string(target.key) === themeName) continue;
            s.set_string(target.key, themeName);
            filled++;
        } catch (e) {
            global.logWarning(
                `[Nebula Theme Studio] 补全 ${target.schema} ${target.key} 失败 - ${e.message}`);
        }
    }

    try {
        imports.gi.Gio.Settings.sync();
    } catch (e) { /* 落盘失败不影响 */ }

    if (filled > 0) {
        global.log(`[Nebula Theme Studio]: 已把 ${filled} 处主题名补全到 ${themeName}`);
    }
    return filled;
}

function currentTheme() {
    try {
        return gsettings('org.cinnamon.theme').get_string('name');
    } catch (e) {
        return '';
    }
}

/** 主题是否正被使用（Cinnamon 侧判断即可） */
function isThemeActive(themeName) {
    return currentTheme() === themeName;
}

/* ------------------------------------------------------------------ 反馈 */

function notify(title, details, isError) {
    try {
        const Main = imports.ui.main;
        if (isError) {
            Main.criticalNotify('Nebula Theme Studio', `${title}\n${details || ''}`);
        } else {
            Main.notify(title, details || '');
        }
    } catch (e) {
        global.log(`[Nebula Theme Studio] ${title} ${details || ''}`);
    }
}

function reportOk(title, details) {
    notify(title, details, false);
}

function reportError(title, details) {
    global.logError(`[Nebula Theme Studio] ${title} - ${details}`);
    notify(title, details, true);
}

module.exports = {
    TARGETS,
    GTK3_SCHEMA,
    applyTheme,
    refreshGtkApps,
    completeThemeSwitch,
    reloadShellTheme,
    currentTheme,
    isThemeActive,
    notify,
    reportOk,
    reportError
};