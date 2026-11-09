#!/usr/bin/env gjs
/* make-palette-preview.js — 生成 README 里的终端调色板预览图
 *
 *   gjs tools/make-palette-preview.js
 *
 * 排版在 lib/palettePreview.js、色值从 lib/terminal.js 读，改了配色重跑即同步。
 * SVG 落盘（自检拿它当基准逐字节比对），PNG 供 README 显示；栅格化需 librsvg 的
 * rsvg-convert。
 */

const GLib = imports.gi.GLib;
const System = imports.system;

const ROOT = GLib.path_get_dirname(GLib.path_get_dirname(GLib.get_prgname()));
const LIB = `${ROOT}/lib`;
const OUT_DIR = `${ROOT}/docs`;
const OUT_SVG = `${OUT_DIR}/terminal-palettes.svg`;
const OUT_PNG = `${OUT_DIR}/terminal-palettes.png`;
const SVG_TMP = `${GLib.get_tmp_dir()}/nts-palettes.svg`;

function readFile(path) {
    const [ok, bytes] = GLib.file_get_contents(path);
    if (!ok) throw new Error(`读取失败: ${path}`);
    return new TextDecoder('utf-8').decode(bytes);
}

function loadLib(name) {
    const module = { exports: {} };
    const source = readFile(`${LIB}/${name}.js`);
    const body = `'use strict';${source};return module.exports;`;
    const factory = new Function('require', 'exports', 'module',
        '__meta', '__dirname', '__filename', 'imports', 'global', body);
    factory.call(module.exports, () => ({}), module.exports, module,
        null, LIB, `${name}.js`, { gi: imports.gi },
        { log() {}, logWarning() {}, logError() {} });
    return module.exports;
}

const Terminal = loadLib('terminal');
const svg = loadLib('palettePreview').buildSvg(Terminal);

GLib.mkdir_with_parents(OUT_DIR, 0o755);

if (!GLib.file_set_contents(OUT_SVG, svg)) {
    throw new Error(`SVG 写入失败: ${OUT_SVG}`);
}

if (!GLib.file_set_contents(SVG_TMP, svg)) {
    throw new Error(`SVG 写入失败: ${SVG_TMP}`);
}

const spawn = GLib.spawn_command_line_sync(
    `rsvg-convert -o "${OUT_PNG}" "${SVG_TMP}"`);
const status = spawn[3];
GLib.unlink(SVG_TMP);

if (status !== 0) {
    print(`rsvg-convert 退出码 ${status}，PNG 未生成`);
    print('先装 librsvg（提供 rsvg-convert）再重试；SVG 已经写好了');
    System.exit(1);
}

print(`已生成 ${OUT_SVG}`);
print(`已生成 ${OUT_PNG}`);
System.exit(0);