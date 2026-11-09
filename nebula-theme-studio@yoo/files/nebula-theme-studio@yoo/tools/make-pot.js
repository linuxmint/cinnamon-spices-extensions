#!/usr/bin/env gjs
/* make-pot.js — 从源文件里抽出所有面向用户的字符串，生成 po/<uuid>.pot
 *
 *   gjs tools/make-pot.js
 *
 * xgettext 看不见 settings-schema.json 里的文案（藏在 layout / description /
 * tooltip / options 结构里，而设置界面恰恰渲染这些字段）。条目按 schema 顺序输出、
 * 注释带完整路径，译者才能对上号。改过文案后重跑；已有 .po 用 msgmerge 并入。
 */

const GLib = imports.gi.GLib;
const System = imports.system;

const ROOT = GLib.path_get_dirname(GLib.path_get_dirname(GLib.get_prgname()));
const UUID = 'nebula-theme-studio@yoo';
const PO_DIR = `${ROOT}/po`;
const POT_PATH = `${PO_DIR}/${UUID}.pot`;

/* ------------------------------------------------------------------ 工具 */

function readText(path) {
    const [ok, bytes] = GLib.file_get_contents(path);
    if (!ok) throw new Error(`读取失败: ${path}`);
    return new TextDecoder('utf-8').decode(bytes);
}

/** po 文件里的字符串转义：反斜杠、双引号、换行 */
function poEscape(text) {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\t/g, '\\t')
        .replace(/\n/g, '\\n');
}

/** msgid 里的换行要写成 msgid "" 之后接一串续行 */
function poBlock(keyword, text, indent = '') {
    if (text.indexOf('\n') < 0) return `${indent}${keyword} "${poEscape(text)}"\n`;
    const parts = text.split('\n');
    let out = `${indent}${keyword} ""\n`;
    parts.forEach((line, i) => {
        const tail = i < parts.length - 1 ? '\\n' : '';
        out += `${indent}"${poEscape(line)}${tail}"\n`;
    });
    return out;
}

/* ------------------------------------------------------------------ 抽取 */

/** 收集条目；同一文案出现在多处时合并成一条，注释列出全部引用（与 xgettext 一致）。 */
function collect() {
    const entries = new Map();

    const add = (ref, text) => {
        if (typeof text !== 'string') return;
        const value = text.trim();
        if (!value) return;
        if (!entries.has(value)) entries.set(value, { text: value, refs: [] });
        const entry = entries.get(value);
        if (entry.refs.indexOf(ref) < 0) entry.refs.push(ref);
    };

    // —— metadata.json：扩展浏览器里显示的名字和描述 ——
    const meta = JSON.parse(readText(`${ROOT}/metadata.json`));
    add('metadata.json->name', meta.name);
    add('metadata.json->description', meta.description);

    // —— settings-schema.json：设置面板的全部文案 ——
    const schema = JSON.parse(readText(`${ROOT}/settings-schema.json`));

    for (const key of Object.keys(schema)) {
        if (key === 'layout') continue;
        const item = schema[key];
        if (!item || typeof item !== 'object') continue;
        add(`settings-schema.json->${key}->description`, item.description);
        add(`settings-schema.json->${key}->tooltip`, item.tooltip);

        // 下拉框的选项名也是给用户看的，必须能翻
        if (item.options && typeof item.options === 'object') {
            for (const label of Object.keys(item.options)) {
                add(`settings-schema.json->${key}->options->${label}`, label);
            }
        }
    }

    for (const name of Object.keys(schema.layout || {})) {
        const node = schema.layout[name];
        if (!node || typeof node !== 'object') continue;
        add(`settings-schema.json->layout->${name}->title`, node.title);
    }

    return Array.from(entries.values());
}

/* ------------------------------------------------------------------ 生成 */

function renderPOT(entries) {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 16);

    // po 的头部每一行都得写成 "KEY: value\n" —— 反斜杠 n 是字面量，不是换行。
    // 混用单双引号很容易在这里翻车，统一从一个数组里出。
    const header = [
        `Project-Id-Version: ${UUID}`,
        'Report-Msgid-Bugs-To:',
        `POT-Creation-Date: ${now}`,
        'PO-Revision-Date: YEAR-MO-DA HO:MI+ZONE',
        'Last-Translator: FULL NAME <EMAIL@ADDRESS>',
        'Language-Team: LANGUAGE <LL@li.org>',
        'Language: ',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit'
    ];

    let out = '';
    out += '# Nebula Theme Studio — 面向用户的字符串模板\n';
    out += '# 由 tools/make-pot.js 生成，请勿手工编辑。\n';
    out += '# 改完 settings-schema.json 或 metadata.json 后重跑该脚本。\n';
    out += '#\n';
    out += '#, fuzzy\n';
    out += 'msgid ""\n';
    out += 'msgstr ""\n';
    for (const line of header) out += `"${poEscape(line)}\\n"` + '\n';
    out += '\n';

    for (const entry of entries) {
        for (const ref of entry.refs) out += `#. ${ref}\n`;
        out += poBlock('msgid', entry.text);
        out += 'msgstr ""\n\n';
    }

    return out;
}

/* ------------------------------------------------------------------ 主流程 */

GLib.mkdir_with_parents(PO_DIR, 0o755);

const entries = collect();
if (entries.length === 0) throw new Error('一条字符串都没抽到，检查 settings-schema.json 是否还能解析');

GLib.file_set_contents(POT_PATH, renderPOT(entries));
print(`已生成 ${POT_PATH}（${entries.length} 条）`);

// 已有的翻译并进来：新增条目以未翻译状态出现，删掉的条目转成 #~ 存档
const merged = [];
for (const name of ['en', 'zh_CN']) {
    const poPath = `${PO_DIR}/${name}.po`;
    if (!GLib.file_test(poPath, GLib.FileTest.EXISTS)) continue;

    // --no-wrap：默认 msgmerge 按 79 列折行会让一条 msgid 断成几截，diff 和自检
    // 都没法按整条比对，宁可不折行。spawn_command_line_sync 的退出码在下标 3，
    // 取错会拿到 stdout 字节数组。
    const spawn = GLib.spawn_command_line_sync(
        `msgmerge --quiet --no-wrap --update --backup=none "${poPath}" "${POT_PATH}"`);
    const status = spawn[3];
    merged.push(`${name}.po:${status === 0 ? '已并入' : `msgmerge 退出码 ${status}`}`);
}
if (merged.length > 0) print(`翻译文件：${merged.join('  ')}`);

System.exit(0);