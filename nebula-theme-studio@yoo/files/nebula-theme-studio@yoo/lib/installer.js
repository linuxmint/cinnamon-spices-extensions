/* installer.js — 首次启用时把扩展内置的两个 Nebula 主题装进 ~/.themes
 *
 * 幂等：目标目录已存在就跳过，绝不覆盖用户可能手动改过的 ~/.themes/Nebula-*；
 * state.json 记录「本扩展装的」主题，卸载时只删这些。主题名切换即时生效
 * （themeManager 监听 changed::name 即重 loadTheme），无需 cinnamon --replace。
 */

const Fs = require('./lib/fsutil');
const Palette = require('./lib/palette');

const STATE_VERSION = 1;

function defaultState() {
    return { version: STATE_VERSION, installedThemes: [] };
}

function readState(statePath) {
    if (!Fs.exists(statePath)) return defaultState();
    try {
        const parsed = JSON.parse(Fs.readText(statePath));
        if (!parsed || !Array.isArray(parsed.installedThemes)) return defaultState();
        return parsed;
    } catch (e) {
        global.logWarning(`[Nebula Theme Studio] 状态文件损坏，已重建: ${e.message}`);
        return defaultState();
    }
}

function writeState(statePath, state) {
    try {
        Fs.writeText(statePath, JSON.stringify(state, null, 4));
    } catch (e) {
        global.logWarning(`[Nebula Theme Studio] 状态文件写入失败: ${e.message}`);
    }
}

/**
 * 确保两个源主题都在 ~/.themes 下可用。
 * 返回 { installed: [...], existing: [...], missing: [...] }
 */
function ensureThemesInstalled(options) {
    const extensionDir = options.extensionDir;
    const homeDir = options.homeDir;
    const statePath = options.statePath;

    const state = readState(statePath);
    const installed = [];
    const existing = [];
    const missing = [];

    for (const variantId of Palette.VARIANT_IDS) {
        const sourceDir = `${extensionDir}/themes/${variantId}`;
        const targetDir = `${homeDir}/.themes/${variantId}`;

        if (Fs.isDirectory(targetDir)) {
            existing.push(variantId);
            continue;
        }

        if (!Fs.isDirectory(sourceDir)) {
            missing.push(variantId);
            global.logWarning(`[Nebula Theme Studio] 扩展内缺少主题源: ${variantId}`);
            continue;
        }

        try {
            Fs.copyTree(sourceDir, targetDir);
            installed.push(variantId);
            if (state.installedThemes.indexOf(variantId) < 0) {
                state.installedThemes.push(variantId);
            }
        } catch (e) {
            missing.push(variantId);
            global.logError(`[Nebula Theme Studio] 安装 ${variantId} 失败 - ${e.message}`);
        }
    }

    state.version = STATE_VERSION;
    writeState(statePath, state);

    return { installed, existing, missing };
}

/** 删除「由本扩展安装」的主题目录；用户自己装的不动 */
function removeInstalledThemes(options) {
    const homeDir = options.homeDir;
    const statePath = options.statePath;
    const state = readState(statePath);

    const removed = [];
    const kept = [];

    for (const variantId of state.installedThemes) {
        const targetDir = `${homeDir}/.themes/${variantId}`;
        if (!Fs.isDirectory(targetDir)) {
            kept.push(variantId);
            continue;
        }
        try {
            Fs.removeTree(targetDir);
            removed.push(variantId);
        } catch (e) {
            kept.push(variantId);
            global.logError(`[Nebula Theme Studio] 卸载 ${variantId} 失败 - ${e.message}`);
        }
    }

    state.installedThemes = kept;
    writeState(statePath, state);
    return { removed, kept };
}

/** 已安装的源主题是否齐备（缺一个就无法生成对应变体） */
function areSourcesReady(homeDir) {
    return Palette.VARIANT_IDS.every(id => Fs.isDirectory(`${homeDir}/.themes/${id}`));
}

function statePathFor(homeDir) {
    return imports.gi.GLib.build_filenamev(
        [imports.gi.GLib.get_user_config_dir(), 'nebula-theme-studio', 'state.json']);
}

module.exports = {
    ensureThemesInstalled,
    removeInstalledThemes,
    areSourcesReady,
    readState,
    writeState,
    statePathFor,
    defaultState
};