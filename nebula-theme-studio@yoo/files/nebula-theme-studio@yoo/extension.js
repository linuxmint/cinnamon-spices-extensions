/* Nebula Theme Studio — Cinnamon 扩展入口
 * 启用时安装内置源主题、把设置参数接到 themeBuilder 生成 ~/.themes/Nebula-*-Studio
 * 并经 gsettings 即时应用，提供重置 / 恢复 / 预设管理。
 * 设置面板 type:"button" 的 callback 在 enable() 返回的对象上查找 —— 回调都挂在这个 return 对象上。
 */

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Settings = imports.ui.settings;

const Fs = require('./lib/fsutil');
const Palette = require('./lib/palette');
const Params = require('./lib/params');
const ThemeBuilder = require('./lib/themeBuilder');
const Installer = require('./lib/installer');
const Applier = require('./lib/applier');
const Presets = require('./lib/presets');
const Terminal = require('./lib/terminal');

const LOG_PREFIX = 'Nebula Theme Studio';
const APPLY_DEBOUNCE_MS = 350;

/** 参与自动应用的参数（拖动滑块/换颜色时触发重生成） */
const AUTO_APPLY_KEYS = Params.PARAM_KEYS.filter(key => key !== 'preset-name');

let _meta = null;
let _extensionDir = null;
let _holder = null;
let _settings = null;
let _signalIds = [];
let _applyTimer = 0;
let _installReport = null;
let _currentVariant = null;
let _themeWatchIds = [];
let _completingSwitch = false;   // 补全过程中抑制自身的信号，避免自激

/* ============================================================ 生命周期 */

function init(metadata) {
    _meta = metadata;
    _extensionDir = metadata.path;
}

function enable() {
    _holder = {};
    _settings = new Settings.ExtensionSettings(_holder, _meta.uuid);
    _signalIds = [];
    _applyTimer = 0;
    _currentVariant = Params.readVariant(_settings);

    _installReport = _safeRun('安装内置主题', () => {
        return Installer.ensureThemesInstalled({
            extensionDir: _extensionDir,
            homeDir: GLib.get_home_dir(),
            statePath: Installer.statePathFor(GLib.get_home_dir())
        });
    }, null);

    if (_installReport && _installReport.installed.length > 0) {
        Applier.reportOk(
            `${LOG_PREFIX}：主题已安装`,
            `已安装到 ~/.themes：${_installReport.installed.join('、')}`);
    }

    _connectSettings();
    _connectThemeWatchers();

    return {
        onApplyNow: () => _safeRun('应用设置', () => applyCurrent(), null),
        onResetTheme: () => _safeRun('重置主题', () => resetCurrentTheme(), null),
        onRestoreOriginal: () => _safeRun('恢复原主题', () => restoreOriginalTheme(), null),
        onSavePreset: () => _safeRun('保存方案', () => saveCurrentPreset(), null),
        onLoadPreset: () => _safeRun('载入方案', () => loadPresetByName(), null),
        onDeletePreset: () => _safeRun('删除方案', () => deletePresetByName(), null),
        onOpenPresetsFolder: () => _safeRun('打开方案目录', () => openPresetsFolder(), null),
        onUninstallThemes: () => _safeRun('卸载内置主题', () => uninstallBundledThemes(), null)
    };
}

function disable() {
    _cancelPendingApply();
    _disconnectThemeWatchers();

    if (_settings) {
        for (const id of _signalIds) {
            try { _settings.disconnect(id); } catch (e) { /* 已断开 */ }
        }
        _signalIds = [];
        try { _settings.finalize(); } catch (e) { /* 忽略 */ }
        _settings = null;
        _holder = null;
    }

    // 生成的主题目录与用户参数一律保留：禁用后用户可能还想继续用这套配色。
    _installReport = null;
}

/* ============================================================ 设置监听 */

function _connectSettings() {
    for (const key of AUTO_APPLY_KEYS) {
        const callback = key === 'variant' ? _onVariantChanged : _onParamChanged;
        try {
            _signalIds.push(_settings.connect(`changed::${key}`, callback));
        } catch (e) {
            global.logError(`${LOG_PREFIX}: 监听设置 ${key} 失败 - ${e.message}`);
        }
    }
}

function _onVariantChanged() {
    const previous = _ensureVariant();
    const next = Params.readVariant(_settings);
    if (previous !== next) {
        _currentVariant = next;
        // 两变体参数各自独立：切走前存档，切回时整个恢复；无存档（首次切换）才走默认值迁移。
        // 存档前对账参数归属（paramsBelongTo）：扩展离线期间 variant 可能被设置窗
        // 拨走而参数没跟上，桌面主题才是参数归属的见证——归属不明就丢弃存档，
        // 宁可丢一次定制也不把参数写进错误的变体名下（存档交叉污染）。
        if (_paramsBelongToApplied(previous)) {
            Params.saveVariantParams(previous, Params.snapshotParams(_settings));
        } else {
            global.log(`${LOG_PREFIX}: 检测到 ${previous} 的参数归属与桌面主题不符` +
                `（扩展离线期间变体被切换过），跳过存档以防交叉污染`);
        }
        const stored = Params.loadVariantParams(next);
        if (stored) {
            // 先铺目标变体默认值再盖存档：存档缺键（后加的参数）落到默认值，
            // 不把上一个变体的颜色原样带过来。
            const merged = Object.assign({}, Params.defaultsFor(next), stored);
            const result = Params.applyPresetToSettings(_settings, { params: merged });
            global.log(`${LOG_PREFIX}: 切换到 ${next}，恢复该变体上次的参数: ${result.applied.join(', ')}`);
        } else {
            const migrated = Params.migrateVariantDefaults(_settings, previous, next);
            if (migrated.length > 0) {
                global.log(`${LOG_PREFIX}: 切换到 ${next}，已迁移默认色: ${migrated.join(', ')}`);
            }
        }
    }
    _scheduleApply();
}

/** 桌面正在应用的主题见证了参数归属：取 shell 主题名与生成主题 marker 的变体做对账 */
function _paramsBelongToApplied(variantId) {
    const homeDir = GLib.get_home_dir();
    let shellTheme = null;
    try {
        shellTheme = new Gio.Settings({ schema_id: 'org.cinnamon.theme' }).get_string('name');
    } catch (e) {
        return false;   // 读不到见证就无法确认归属，保守跳过存档
    }
    const markerVariant = ThemeBuilder.isGeneratedTheme(shellTheme, homeDir)
        ? (ThemeBuilder.readMarker(shellTheme, homeDir) || {}).variant || null
        : null;
    return Params.paramsBelongTo(shellTheme, markerVariant, variantId);
}

function _onParamChanged() {
    if (!isAutoApplyEnabled()) return;
    _scheduleApply();
}

function isAutoApplyEnabled() {
    try {
        return _settings.getValue('auto-apply') === true;
    } catch (e) {
        return false;
    }
}

function _scheduleApply() {
    _cancelPendingApply();
    _applyTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, APPLY_DEBOUNCE_MS, () => {
        _applyTimer = 0;
        _safeRun('自动应用', () => applyCurrent(true), null);
        return GLib.SOURCE_REMOVE;
    });
}

function _cancelPendingApply() {
    if (_applyTimer) {
        GLib.Source.remove(_applyTimer);
        _applyTimer = 0;
    }
}

/* ============================================================ 外部主题切换监听 */

/**
 * 系统设置主题页的 GTK / Cinnamon chooser 各写各的键、metacity 谁都不管，
 * 在那边点一下常是「半截切换」。这里监听这两个键，发现切换目标是本扩展生成的
 * 主题（靠标记文件判定）就把其余目标一次补齐；第三方主题与自定义搭配一律不碰。
 */
function _connectThemeWatchers() {
    _disconnectThemeWatchers();

    const watches = [
        { schema: 'org.cinnamon.theme', key: 'name' },
        { schema: 'org.cinnamon.desktop.interface', key: 'gtk-theme' }
    ];

    for (const watch of watches) {
        try {
            const settings = new Gio.Settings({ schema_id: watch.schema });
            const id = settings.connect(`changed::${watch.key}`, () => {
                _onExternalThemeChange(settings.get_string(watch.key));
            });
            _themeWatchIds.push({ settings, id });
        } catch (e) {
            global.logWarning(`${LOG_PREFIX}: 监听 ${watch.schema} ${watch.key} 失败 - ${e.message}`);
        }
    }
}

function _disconnectThemeWatchers() {
    for (const entry of _themeWatchIds) {
        try { entry.settings.disconnect(entry.id); } catch (e) { /* 已断开 */ }
    }
    _themeWatchIds = [];
}

function _onExternalThemeChange(themeName) {
    if (_completingSwitch) return;
    if (!themeName) return;

    const home = GLib.get_home_dir();
    if (!ThemeBuilder.isGeneratedTheme(themeName, home)) return;

    _completingSwitch = true;
    try {
        Applier.completeThemeSwitch(themeName);

        // 只补全主题名不够：用户可能在系统设置里直接选生成主题，扩展这边 variant
        // 还停在旧值。对齐会触发 changed::variant，顺带迁移默认值并重建，相当于自愈。
        const marker = ThemeBuilder.readMarker(themeName, home);
        const markerVariant = marker && marker.variant;
        if (markerVariant && Params.isValidVariantId(markerVariant)) {
            const current = _ensureVariant();
            if (markerVariant !== current) {
                _settings.setValue('variant', markerVariant);
                global.log(
                    `${LOG_PREFIX}: 外部切换到 ${themeName}，变体对齐 ${current} -> ${markerVariant}`);
            }
        }
    } finally {
        _completingSwitch = false;
    }
}

/* ============================================================ 核心动作 */

function _ensureVariant() {
    if (_currentVariant === null) _currentVariant = Params.readVariant(_settings);
    return _currentVariant;
}

function applyCurrent(isAuto) {
    _ensureVariant();
    const variantId = _currentVariant;
    const params = Params.readParams(_settings, variantId);

    const result = ThemeBuilder.build({
        extensionDir: _extensionDir,
        homeDir: GLib.get_home_dir(),
        variantId,
        params
    });

    const changed = Applier.applyTheme(result.name, {
        // 中转值用源主题：它一定存在，且和生成主题几乎一样，闪一下看不出来。
        // 作用是让同名主题重新生成后，已打开的 GTK 应用也能收到变化通知。
        refreshFrom: Palette.sourceName(variantId)
    });

    const terminalNote = applyTerminalPalette();

    const detail = [
        `变体：${Palette.getVariant(variantId).label}`,
        `主题：${result.name}`,
        `颜色替换 ${result.stats.colorSwaps} 处 / 透明度 ${result.stats.alphaValues} 处 / 尺寸 ${result.stats.sizeRules} 处`,
        changed === 0 ? '主题名与当前一致，已强制重新加载面板与 GTK 应用样式' : '',
        terminalNote,
        applyTerminalTransparency()
    ].filter(Boolean).join('\n');

    global.log(`${LOG_PREFIX}: 已生成并应用 ${result.name}\n${detail}`);

    if (!isAuto) {
        Applier.reportOk(
            `${LOG_PREFIX}：已应用 ${result.name}`,
            `${detail}\n提示：已运行的 GTK 应用（如文件管理器）通常会自动跟随；若未刷新，重开该应用即可。`);
    }

    return result;
}

/**
 * 写终端 ANSI 16 色。终端不吃 GTK 主题，只能落到 gnome-terminal 自己的 profile 上；
 * 没装 gnome-terminal 或选「跟随系统」时静默跳过。
 */
function applyTerminalPalette() {
    const schemeId = _settings.getValue('terminal-palette') || 'system';

    if (!Terminal.isSchemeId(schemeId)) {
        return `终端配色：未知方案 ${schemeId}，已跳过`;
    }

    let result;
    try {
        result = Terminal.applyScheme(schemeId, {
            statePath: Installer.statePathFor(GLib.get_home_dir())
        });
    } catch (e) {
        return `终端配色：写入失败 - ${e.message}`;
    }

    if (!result.ok) return `终端配色：${result.reason}`;

    if (schemeId === 'system') {
        return result.restored > 0
            ? `终端配色：已还原 ${result.restored} 个档案`
            : '';
    }

    const scheme = Terminal.getScheme(schemeId);
    const parts = [`终端配色：${scheme.label}，已写入 ${result.applied} 个档案`];
    if (result.skipped > 0) parts.push(`${result.skipped} 个档案失败`);
    parts.push('已打开的终端窗口不受影响，新开一个即可看到');
    return parts.join('，');
}

/**
 * 终端输入区不透明度：100（默认）= 交还给用户，不写任何 gsettings；
 * 低于 100 才写，并在首次覆盖前把原值记进状态文件，回到 100 时原样还回去。
 */
function applyTerminalTransparency() {
    const raw = Number(_settings.getValue('terminal-opacity'));
    const opacity = Number.isFinite(raw) ? Math.min(100, Math.max(20, raw)) : 100;

    let result;
    try {
        result = Terminal.applyTransparency(opacity, {
            statePath: Installer.statePathFor(GLib.get_home_dir())
        });
    } catch (e) {
        return `终端透明度：写入失败 - ${e.message}`;
    }

    if (!result.ok) return `终端透明度：${result.reason}`;
    if (opacity >= 100) {
        return result.restored > 0
            ? `终端透明度：已还原 ${result.restored} 个档案的原始设置`
            : '';
    }

    const parts = [`终端透明度：${opacity}%（已写入 ${result.applied} 个档案）`];
    if (result.skipped > 0) parts.push(`${result.skipped} 个档案失败`);
    parts.push('新开的终端窗口才能看到');
    return parts.join('，');
}

function resetCurrentTheme() {
    _ensureVariant();
    const variantId = _currentVariant;
    const changed = Params.resetParams(_settings, variantId);

    const generated = Palette.generatedName(variantId);
    const removed = Fs.removeTree(`${GLib.get_home_dir()}/.themes/${generated}`);
    const source = Palette.sourceName(variantId);
    Applier.applyTheme(source);

    Applier.reportOk(
        `${LOG_PREFIX}：已重置 ${Palette.getVariant(variantId).label}`,
        [
            `恢复默认参数 ${changed.length} 项`,
            removed ? `已删除生成主题 ${generated}` : `未发现生成主题 ${generated}`,
            `当前主题：${source}`
        ].join('\n'));
}

function restoreOriginalTheme() {
    const home = GLib.get_home_dir();
    const removed = [];

    for (const variantId of Palette.VARIANT_IDS) {
        const generated = Palette.generatedName(variantId);
        if (Fs.removeTree(`${home}/.themes/${generated}`)) removed.push(generated);
    }

    _ensureVariant();
    const source = Palette.sourceName(_currentVariant);
    Applier.applyTheme(source);

    // 输入区透明度的滑杆顶到 100 就是「强制不透明」，不再兼作「不干预」，
    // 所以「恢复原始」必须把当初备份的终端设置还回去，否则用户回不到原样。
    const notes = [];
    try {
        const alpha = Terminal.restoreTransparency({
            statePath: Installer.statePathFor(GLib.get_home_dir())
        });
        if (alpha.restored > 0) notes.push(`终端输入区透明度：已还原 ${alpha.restored} 个档案`);
    } catch (e) {
        notes.push(`终端输入区透明度：还原失败 - ${e.message}`);
    }

    Applier.reportOk(
        `${LOG_PREFIX}：已恢复原始主题`,
        [
            `当前主题：${source}`,
            removed.length > 0 ? `已删除：${removed.join('、')}` : '没有需要删除的生成主题'
        ].concat(notes).join('\n'));
}

function saveCurrentPreset() {
    _ensureVariant();
    const variantId = _currentVariant;
    const name = String(_settings.getValue('preset-name') || '').trim();

    if (!name) {
        Applier.reportError(`${LOG_PREFIX}：请先填写方案名`,
            '方案名会成为主题目录名的一部分，例如「深海」会生成 ~/.themes/Nebula-Dark-深海');
        return;
    }

    // 方案名 → 主题目录名。和源主题、工作主题撞名时直接拒绝，别把用户的原主题覆盖掉。
    const themeName = Palette.namedTheme(variantId, name);
    if (!themeName) {
        Applier.reportError(
            `${LOG_PREFIX}：方案名不可用`,
            `「${name}」清洗后为空，或与 ${Palette.sourceName(variantId)} / ` +
            `${Palette.generatedName(variantId)} 撞名。请换一个名字。`);
        return;
    }

    const params = Params.paramsForPreset(_settings, variantId);

    // 先落盘主题再写 JSON：主题生成失败时不会留下一个指向空目录的方案
    let built;
    try {
        built = ThemeBuilder.build({
            extensionDir: _extensionDir,
            homeDir: GLib.get_home_dir(),
            variantId,
            params,
            targetName: themeName,
            presetName: name
        });
    } catch (e) {
        Applier.reportError(`${LOG_PREFIX}：生成方案主题失败`, e.message);
        return;
    }

    const saved = Presets.save(name, variantId, params, { themeName });
    if (!saved.ok) {
        Applier.reportError(`${LOG_PREFIX}：保存方案失败`, saved.error);
        return;
    }

    const others = Presets.list().filter(p => p.name !== name);

    Applier.reportOk(
        `${LOG_PREFIX}：方案已保存`,
        [
            `「${name}」`,
            `主题：${built.name}  →  ${built.dir}`,
            '可在「系统设置 → 主题」里直接选用，和普通主题一样。',
            others.length > 0 ? `其他方案：${others.map(p => p.name).join('、')}` : ''
        ].filter(Boolean).join('\n'));
}

function loadPresetByName() {
    const name = String(_settings.getValue('preset-name') || '').trim();
    if (!name) {
        const available = Presets.listNames();
        Applier.reportError(
            `${LOG_PREFIX}：请先填写方案名`,
            available.length > 0
                ? `已有方案：${available.join('、')}`
                : '还没有任何已保存的方案。');
        return;
    }

    const preset = Presets.load(name);
    if (!preset) {
        Applier.reportError(
            `${LOG_PREFIX}：载入失败`,
            `找不到方案「${name}」。已有方案：${Presets.listNames().join('、') || '（无）'}`);
        return;
    }

    if (Palette.isValidVariant(preset.variant)) {
        _settings.setValue('variant', preset.variant);
        _currentVariant = preset.variant;
    }

    const { applied, skipped } = Params.applyPresetToSettings(_settings, preset);
    const result = applyCurrent(true);

    Applier.reportOk(
        `${LOG_PREFIX}：方案已载入并应用`,
        [
            `「${preset.name}」→ 工作主题 ${result.name}`,
            `恢复参数 ${applied.length} 项`,
            preset.themeName
                ? `该方案另有存档主题 ${preset.themeName}，可在系统设置里直接选用`
                : '',
            skipped.length > 0 ? `跳过无法识别的参数：${skipped.join('、')}` : ''
        ].filter(Boolean).join('\n'));
}

function deletePresetByName() {
    const name = String(_settings.getValue('preset-name') || '').trim();
    const all = Presets.list();
    const available = all.map(p => p.name);

    // 先看方案存不存在，把可选项一次性列出来（名字打错是最常见的情况）
    const target = all.find(p => p.name === name);
    if (!target) {
        Applier.reportError(`${LOG_PREFIX}：删除方案失败`,
            `找不到方案「${name}」。\n已有方案：${available.join('、') || '（无）'}`);
        return;
    }

    const result = Presets.remove(name);
    if (!result.ok) {
        Applier.reportError(`${LOG_PREFIX}：删除方案失败`,
            `${result.error}\n已有方案：${available.join('、') || '（无）'}`);
        return;
    }

    // 方案的主题目录一起清掉，否则会在系统设置里留下一个「孤儿主题」
    const home = GLib.get_home_dir();
    let themeNote = '';
    if (target.themeName) {
        const inUse = Applier.isThemeActive(target.themeName);
        const removed = ThemeBuilder.removeGeneratedTheme(target.themeName, home);
        if (inUse) {
            const fallback = Palette.sourceName(target.variant || _ensureVariant());
            Applier.applyTheme(fallback);
            themeNote = `主题 ${target.themeName} 正在使用中，已切回 ${fallback}`;
        } else {
            themeNote = removed
                ? `已删除主题 ${target.themeName}`
                : `未找到主题目录 ${target.themeName}（可能已被手动删除）`;
        }
    }

    Applier.reportOk(
        `${LOG_PREFIX}：方案已删除`,
        [
            `「${result.name}」`,
            themeNote,
            `剩余方案：${available.filter(n => n !== result.name).join('、') || '（无）'}`
        ].filter(Boolean).join('\n'));
}

function openPresetsFolder() {
    const dir = Presets.presetsDir();
    Fs.ensureDirectory(dir);
    // 不拼 shell 命令：用户名含空格/引号时 xdg-open 字符串拼接会断裂甚至注入，
    // 走 file:// URI + GIO 默认处理器，路径由 GLib 负责转义
    Gio.AppInfo.launch_default_for_uri(GLib.filename_to_uri(dir, null), null);
}

function uninstallBundledThemes() {
    const home = GLib.get_home_dir();
    const report = Installer.removeInstalledThemes({
        homeDir: home,
        statePath: Installer.statePathFor(home)
    });

    // 源主题刚被删掉，如果正挂在系统上必须先挪走，否则面板会退回默认样式
    const inUse = Palette.VARIANT_IDS
        .map(id => Palette.sourceName(id))
        .filter(name => Applier.isThemeActive(name));

    let fallbackNote = '';
    if (inUse.length > 0) {
        const candidates = ['Mint-Y', 'Mint-X-Dark', 'Mint-Y-Dark', 'Adwaita', 'Default'];
        const fallback = candidates.find(name => Fs.isDirectory(`${home}/.themes/${name}`) || Fs.isDirectory(`/usr/share/themes/${name}`));
        if (fallback) {
            Applier.applyTheme(fallback);
            fallbackNote = `原主题正在使用中，已切换到 ${fallback}`;
        } else {
            fallbackNote = '原主题正在使用中，但找不到可切换的主题，请手动在系统设置里换一个';
        }
    }

    Applier.reportOk(
        `${LOG_PREFIX}：内置主题已卸载`,
        [
            report.removed.length > 0 ? `已删除：${report.removed.join('、')}` : '没有由本扩展安装的主题',
            report.kept.length > 0 ? `删除失败：${report.kept.join('、')}` : '',
            fallbackNote
        ].filter(Boolean).join('\n'));
}

/* ============================================================ 工具 */

function _safeRun(what, fn, fallback) {
    try {
        return fn();
    } catch (e) {
        Applier.reportError(`${LOG_PREFIX}：${what}失败`, e.message);
        return fallback;
    }
}