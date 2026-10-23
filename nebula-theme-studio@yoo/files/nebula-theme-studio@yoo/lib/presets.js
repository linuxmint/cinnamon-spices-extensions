/* presets.js — 「本次设置方案」的保存 / 载入 / 删除
 *
 * 存于 ~/.config/nebula-theme-studio/presets/<方案名>.json，每个文件自带
 * name / variant / created / params —— 自描述，换机器、换 Cinnamon 版本也能直接读回。
 */

const Fs = require('./lib/fsutil');

function glib() {
    return imports.gi.GLib;
}

function configDir() {
    return glib().build_filenamev([glib().get_user_config_dir(), 'nebula-theme-studio']);
}

function presetsDir() {
    return glib().build_filenamev([configDir(), 'presets']);
}

function ensureDir() {
    Fs.ensureDirectory(presetsDir());
}

/** 文件名安全化：去掉路径分隔符与控制字符，中文名保留 */
function safeFileName(name) {
    const cleaned = String(name || '')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/[\x00-\x1f\x7f]/g, '_')
        .replace(/^\.+/, '_')
        .replace(/[. ]+$/, '')
        .trim();
    return cleaned.length > 0 ? cleaned.slice(0, 80) : '未命名';
}

function presetPath(name) {
    return `${presetsDir()}/${safeFileName(name)}.json`;
}

function list() {
    ensureDir();
    const out = [];
    for (const entry of Fs.listChildren(presetsDir())) {
        if (!entry.name.endsWith('.json')) continue;
        const path = `${presetsDir()}/${entry.name}`;
        try {
            const data = JSON.parse(Fs.readText(path));
            if (!data || typeof data !== 'object') continue;
            out.push({
                name: data.name || entry.name.replace(/\.json$/, ''),
                file: entry.name,
                variant: data.variant || '',
                themeName: data.themeName || '',
                created: data.created || '',
                params: data.params || {}
            });
        } catch (e) {
            global.logWarning(`[Nebula Theme Studio] 预设 ${entry.name} 解析失败，已忽略 - ${e.message}`);
        }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

function listNames() {
    return list().map(p => p.name);
}

/**
 * 保存方案。
 *
 * @param meta.themeName 这个方案对应的生成主题目录名；系统设置里就是靠它来切换的
 */
function save(name, variant, params, meta) {
    const clean = String(name || '').trim();
    if (!clean) return { ok: false, error: '方案名为空' };

    ensureDir();
    const payload = {
        name: clean,
        variant,
        themeName: (meta && meta.themeName) || '',
        created: new Date().toISOString(),
        params
    };

    try {
        Fs.writeText(presetPath(clean), JSON.stringify(payload, null, 4));
        return { ok: true, name: clean, path: presetPath(clean) };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

function load(name) {
    const clean = String(name || '').trim();
    if (!clean) return null;
    const path = presetPath(clean);
    if (!Fs.exists(path)) return null;

    try {
        const data = JSON.parse(Fs.readText(path));
        if (!data || typeof data.params !== 'object') return null;
        return data;
    } catch (e) {
        global.logError(`[Nebula Theme Studio] 读取预设 ${clean} 失败 - ${e.message}`);
        return null;
    }
}

function remove(name) {
    const clean = String(name || '').trim();
    if (!clean) return { ok: false, error: '方案名为空' };

    const path = presetPath(clean);
    if (!Fs.exists(path)) return { ok: false, error: `找不到方案「${clean}」` };

    try {
        Fs.removeTree(path);
        return { ok: true, name: clean };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

module.exports = {
    configDir,
    presetsDir,
    safeFileName,
    list,
    listNames,
    save,
    load,
    remove
};