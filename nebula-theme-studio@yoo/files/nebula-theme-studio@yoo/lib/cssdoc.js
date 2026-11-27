/* cssdoc.js — 轻量 CSS 解析器 + 规则级（selector-aware）变换引擎
 *
 * 主题里颜色/透明度全是字面量（无可用 CSS 变量），参数化只能文本替换；纯正则
 * 区分不了同值不同语义的位置，所以先切成「注释 / 规则 / at 规则」节点，按
 * (选择器, 属性) 精确改写声明值后原样拼回。未改节点保留 raw 文本（字节级往返
 * 一致），跳过注释/字符串/括号（url("a:b.svg") 不误切），@media 嵌套递归处理。
 */

const DECL_RE = /^(\s*)([-a-zA-Z_][-a-zA-Z0-9_-]*)(\s*:\s*)([\s\S]*?)(\s*)$/;

/* ---------------------------------------------------------------- 扫描工具 */

function skipComment(text, i) {
    const end = text.indexOf('*/', i + 2);
    return end < 0 ? text.length : end + 2;
}

function skipString(text, i) {
    const quote = text[i];
    let j = i + 1;
    while (j < text.length) {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === quote) return j + 1;
        j++;
    }
    return text.length;
}

function skipParens(text, i) {
    let depth = 0;
    let j = i;
    while (j < text.length) {
        const c = text[j];
        if (c === '/' && text[j + 1] === '*') { j = skipComment(text, j); continue; }
        if (c === '"' || c === "'") { j = skipString(text, j); continue; }
        if (c === '(') { depth++; j++; continue; }
        if (c === ')') { depth--; j++; if (depth === 0) return j; continue; }
        j++;
    }
    return text.length;
}

/** 从 from 开始，找到下一个位于括号/字符串/注释之外的 ch */
function indexOfTopLevel(text, from, ch) {
    let i = from;
    while (i < text.length) {
        const c = text[i];
        if (c === '/' && text[i + 1] === '*') { i = skipComment(text, i); continue; }
        if (c === '"' || c === "'") { i = skipString(text, i); continue; }
        if (c === '(') { i = skipParens(text, i); continue; }
        if (c === ch) return i;
        i++;
    }
    return -1;
}

/** openIdx 指向 '{'，返回配对 '}' 的下标 */
function matchBrace(text, openIdx) {
    let depth = 0;
    let i = openIdx;
    while (i < text.length) {
        const c = text[i];
        if (c === '/' && text[i + 1] === '*') { i = skipComment(text, i); continue; }
        if (c === '"' || c === "'") { i = skipString(text, i); continue; }
        if (c === '(') { i = skipParens(text, i); continue; }
        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) return i;
        }
        i++;
    }
    return -1;
}

/* ---------------------------------------------------------------- 解析 */

function parse(text) {
    const nodes = [];
    const n = text.length;
    let i = 0;
    let ws = '';

    while (i < n) {
        const c = text[i];

        if (/\s/.test(c)) { ws += c; i++; continue; }

        if (c === '/' && text[i + 1] === '*') {
            const stop = skipComment(text, i);
            nodes.push({ type: 'comment', raw: ws + text.slice(i, stop) });
            ws = ''; i = stop; continue;
        }

        if (c === '}') {
            nodes.push({ type: 'stray', raw: ws + c });
            ws = ''; i++; continue;
        }

        const braceIdx = indexOfTopLevel(text, i, '{');
        const semiIdx = indexOfTopLevel(text, i, ';');

        if (semiIdx >= 0 && (braceIdx < 0 || semiIdx < braceIdx)) {
            // @define-color / @import 之类以分号结束的 at 规则
            const atRaw = ws + text.slice(i, semiIdx + 1);
            const m = atRaw.match(/^(\s*@define-color\s+)([A-Za-z0-9_-]+)(\s+)([\s\S]*?)(;)(\s*)$/);
            nodes.push(m
                ? {
                    type: 'define',
                    raw: atRaw,
                    prefix: m[1],
                    name: m[2],
                    gap: m[3],
                    value: m[4],
                    suffix: m[5] + m[6],
                    dirty: false
                }
                : { type: 'at', raw: atRaw });
            ws = '';
            i = semiIdx + 1;
            continue;
        }

        if (braceIdx < 0) {
            nodes.push({ type: 'raw', raw: ws + text.slice(i) });
            ws = ''; i = n; break;
        }

        const close = matchBrace(text, braceIdx);
        const stop = close < 0 ? n : close + 1;
        const selectorRaw = text.slice(i, braceIdx);
        const body = text.slice(braceIdx + 1, close < 0 ? n : close);
        const node = {
            type: 'rule',
            ws,
            selectorRaw,
            selector: selectorRaw.trim(),
            body,
            dirty: false,
            raw: ws + text.slice(i, stop)
        };

        if (node.selector.charAt(0) === '@') {
            // 带嵌套的 at 规则（@media / @supports ...）
            node.type = 'atblock';
            node.children = parse(body);
        }

        nodes.push(node);
        ws = ''; i = stop;
    }

    // 文件末尾的空白/注释尾巴不能丢，否则序列化会少字节
    if (ws) nodes.push({ type: 'raw', raw: ws });

    return nodes;
}

function stringify(nodes) {
    let out = '';
    for (const node of nodes) out += node.raw;
    return out;
}

function touch(node) {
    node.dirty = true;
    node.raw = node.ws + node.selectorRaw + '{' + node.body + '}';
}

/** 改写 @define-color 的定义值；fn 返回 null 表示不改 */
function rewriteDefine(nodes, name, fn) {
    let changed = false;

    const walk = list => {
        for (const node of list) {
            if (node.type === 'atblock') {
                walk(node.children);
            } else if (node.type === 'define' && node.name === name && !node.dirty) {
                const next = fn(node.value);
                if (next === null || next === undefined || next === node.value) continue;
                node.value = next;
                node.raw = node.prefix + node.name + node.gap + next + node.suffix;
                node.dirty = true;
                changed = true;
            }
        }
    };

    walk(nodes);
    return changed;
}

/** 取出声明值里引用的所有 @变量名 */
function varRefs(value) {
    const out = [];
    const re = /@([A-Za-z0-9_-]+)/g;
    let m;
    while ((m = re.exec(value)) !== null) out.push(m[1]);
    return out;
}

/**
 * 统计每个 @变量被哪些规则的哪些属性引用：GTK 侧大量用 @变量中转颜色，
 * 按 (选择器, 属性) 定位会漏掉引用变量的规则，须先知道「变量被谁用」才能
 * 判断能否安全改它的定义值。
 *
 * 返回 Map<变量名, [{ node, prop, selector }]>
 */
function collectVarUsage(nodes, propFilter) {
    const usage = new Map();

    eachRule(nodes, node => {
        const body = node.body;
        const re = /([-a-zA-Z_][-a-zA-Z0-9_-]*)(\s*:\s*)([^;{}]*)/g;
        let m;
        while ((m = re.exec(body)) !== null) {
            const prop = m[1].toLowerCase();
            if (propFilter && propFilter.indexOf(prop) < 0) continue;
            for (const name of varRefs(m[3])) {
                if (!usage.has(name)) usage.set(name, []);
                usage.get(name).push({ node, prop, selector: node.selector });
            }
        }
    });

    return usage;
}

/* ---------------------------------------------------------------- 遍历 */

/** 对所有规则（含 @media 内嵌）调用 cb(node)；cb 返回 true 表示该节点已被改写 */
function eachRule(nodes, cb) {
    for (const node of nodes) {
        if (node.type === 'atblock') {
            eachRule(node.children, cb);
        } else if (node.type === 'rule') {
            cb(node);
        }
    }
}

/** 规则的逗号分隔选择器列表 */
function selectorList(node) {
    return node.selector.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

/** 任一选择器命中 patterns（字符串按精确匹配，正则按 test）即返回 true */
function selectorMatches(node, patterns) {
    if (!patterns || patterns.length === 0) return true;
    const list = selectorList(node);
    for (const pattern of patterns) {
        for (const sel of list) {
            if (pattern instanceof RegExp) {
                if (pattern.test(sel)) return true;
            } else if (sel === pattern) {
                return true;
            }
        }
    }
    return false;
}

/* ---------------------------------------------------------------- 声明改写 */

/**
 * 逐条改写声明值。
 * fn(prop, value) 返回新值字符串；返回 null/undefined 表示不改写。
 */
function mapDeclarations(body, fn) {
    if (body.indexOf(':') < 0) return body;

    let out = '';
    let chunkStart = 0;
    let i = 0;
    const n = body.length;

    while (i < n) {
        const c = body[i];
        if (c === '/' && body[i + 1] === '*') { i = skipComment(body, i); continue; }
        if (c === '"' || c === "'") { i = skipString(body, i); continue; }
        if (c === '(') { i = skipParens(body, i); continue; }
        if (c === ';') {
            out += rewriteChunk(body.slice(chunkStart, i), fn) + ';';
            i++;
            chunkStart = i;
            continue;
        }
        i++;
    }

    if (chunkStart < n) out += rewriteChunk(body.slice(chunkStart), fn);
    return out;
}

function rewriteChunk(chunk, fn) {
    const m = chunk.match(DECL_RE);
    if (!m) return chunk;
    const next = fn(m[2].toLowerCase(), m[4]);
    if (next === null || next === undefined) return chunk;
    return m[1] + m[2] + m[3] + next + m[5];
}

/**
 * 在符合 (选择器, 属性) 条件的规则里改写声明值。
 * 返回 {rules, values} 计数，用于生成报告与排错。
 */
function transformRules(nodes, options) {
    const selectors = options.selectors;
    const props = options.props;
    const exclude = options.exclude;
    const counters = { rules: 0, values: 0 };

    eachRule(nodes, node => {
        if (!selectorMatches(node, selectors)) return;
        if (exclude && selectorMatches(node, exclude)) return;

        const before = node.body;
        const after = mapDeclarations(before, (prop, value) => {
            if (props && props.indexOf(prop) < 0) return null;
            const next = options.fn(prop, value, node);
            if (next === null || next === undefined || next === value) return null;
            counters.values++;
            return next;
        });

        if (after !== before) {
            node.body = after;
            touch(node);
            counters.rules++;
        }
    });

    return counters;
}

/* ---------------------------------------------------------------- 颜色字面量 */

function byteToHex(n) {
    const v = Math.max(0, Math.min(255, Math.round(n)));
    return v.toString(16).padStart(2, '0');
}

/**
 * 全局把某 RGB 的所有写法（rgba() / rgb() / #rrggbb）换成新 RGB，alpha 原样保留。
 * 三种写法必须一起改：同一角色在主题里既有 rgba(88,166,255,.35) 也有 #58a6ff。
 */
function replaceRgbLiteral(text, from, to) {
    const fr = Math.round(from.r), fg = Math.round(from.g), fb = Math.round(from.b);
    const tr = Math.round(to.r), tg = Math.round(to.g), tb = Math.round(to.b);
    let count = 0;
    let out = text;

    // 分隔符与空白原样回填：换色后若 `rgba(88, 166, 255, 0.35)` 变成无空格写法，
    // diff 会很难读，也容易被误判成格式损坏。
    const rgbaRe = new RegExp(
        `rgba\\((\\s*)${fr}(\\s*,\\s*)${fg}(\\s*,\\s*)${fb}(\\s*,\\s*)([\\d.]+)(\\s*)\\)`, 'gi');
    out = out.replace(rgbaRe, (all, s1, s2, s3, s4, alpha, s5) => {
        count++;
        return `rgba(${s1}${tr}${s2}${tg}${s3}${tb}${s4}${alpha}${s5})`;
    });

    const rgbRe = new RegExp(`rgb\\((\\s*)${fr}(\\s*,\\s*)${fg}(\\s*,\\s*)${fb}(\\s*)\\)`, 'gi');
    out = out.replace(rgbRe, (all, s1, s2, s3, s4) => {
        count++;
        return `rgb(${s1}${tr}${s2}${tg}${s3}${tb}${s4})`;
    });

    const hexFrom = byteToHex(fr) + byteToHex(fg) + byteToHex(fb);
    const hexTo = byteToHex(tr) + byteToHex(tg) + byteToHex(tb);
    if (hexFrom !== hexTo) {
        const hexRe = new RegExp(`#${hexFrom}\\b`, 'gi');
        out = out.replace(hexRe, () => {
            count++;
            return '#' + hexTo;
        });
    }

    return { text: out, count };
}

/**
 * 主背景色的「背景语义」判定：变量名含 bg/base 且不含 fg 才算底色变量。
 * theme_selected_fg_color 这类「选中态前景」虽用背景同款字面量，语义是文字，
 * 绝不能跟着背景换色。
 */
function isBackgroundVarName(name) {
    const n = String(name).toLowerCase();
    return n.indexOf('fg') < 0 && (n.indexOf('bg') >= 0 || n.indexOf('base') >= 0);
}

/**
 * 只在 @define-color 的背景类变量定义里替换 RGB —— 区别于 replaceRgbLiteral
 * 的全局替换。@define-color 不是规则、解析器看不见，必须留在原始文本阶段处理；
 * 规则体内的替换走解析后的属性白名单（见 Palette.BG_PROPS）。
 */
function replaceBgDefineLiterals(text, from, to) {
    const hexFrom = byteToHex(from.r) + byteToHex(from.g) + byteToHex(from.b);
    const hexTo = byteToHex(to.r) + byteToHex(to.g) + byteToHex(to.b);
    if (hexFrom === hexTo) return { text, count: 0 };

    let count = 0;
    // head 里保留变量名与值之间的原始空隙，diff 才不会出现整行对齐被打乱
    const out = text.replace(/(@define-color\s+[\w-]+\s+)([^;]+);/g, (all, head, value) => {
        const name = /@define-color\s+([\w-]+)/.exec(head)[1];
        if (!isBackgroundVarName(name)) return all;
        const result = replaceRgbLiteral(value, from, to);
        count += result.count;
        return `${head}${result.text};`;
    });
    return { text: out, count };
}

/**
 * 只替换指定名字的 @define-color 变量定义里的 RGB。
 * 面板/菜单背景色用：变量定义没有选择器作用域，只能按变量名白名单认领
 * （名单见 Palette.SCOPED_BG_DEFINES）。
 */
function replaceNamedDefineLiterals(text, names, from, to) {
    const hexFrom = byteToHex(from.r) + byteToHex(from.g) + byteToHex(from.b);
    const hexTo = byteToHex(to.r) + byteToHex(to.g) + byteToHex(to.b);
    if (hexFrom === hexTo) return { text, count: 0 };

    let count = 0;
    const out = text.replace(/(@define-color\s+([\w-]+)\s+)([^;]+);/g, (all, head, name, value) => {
        if (names.indexOf(name) < 0) return all;
        const result = replaceRgbLiteral(value, from, to);
        count += result.count;
        return `${head}${result.text};`;
    });
    return { text: out, count };
}

function formatAlpha(value) {
    let a = value;
    if (a > 1) a = 1;
    if (a < 0) a = 0;
    a = Math.round(a * 100) / 100;
    return a.toFixed(2);
}

/**
 * 在声明值里按「参考档位 → 目标档位」的比例缩放指定色板的 rgba() alpha。
 * 用比例缩放保住源主题固有层次（同角色各处 alpha 本就不同）；参数 = 参考值时
 * 系数恰为 1，输出与源文件逐字节一致。alpha 为 0 的「故意透明」保持不变。
 */
function scaleAlphaInValue(value, rgbList, refAlpha, targetAlpha) {
    if (!rgbList || rgbList.length === 0) return value;
    if (!(refAlpha > 0)) return value;

    const factor = targetAlpha / refAlpha;
    if (!isFinite(factor) || Math.abs(factor - 1) < 1e-6) return value;

    return value.replace(
        /rgba\((\s*)(\d+)(\s*,\s*)(\d+)(\s*,\s*)(\d+)(\s*,\s*)([\d.]+)(\s*)\)/gi,
        (all, s1, r, s2, g, s3, b, s4, alphaRaw, s5) => {
            const alpha = parseFloat(alphaRaw);
            if (!(alpha > 0)) return all;

            const ri = parseInt(r, 10), gi = parseInt(g, 10), bi = parseInt(b, 10);
            let matched = false;
            for (const rgb of rgbList) {
                if (rgb[0] === ri && rgb[1] === gi && rgb[2] === bi) { matched = true; break; }
            }
            if (!matched) return all;

            let next = alpha * factor;
            if (next > 1) next = 1;
            if (next < 0) next = 0;

            const nextRaw = formatAlpha(next);
            if (Math.abs(parseFloat(nextRaw) - alpha) < 0.005) return all;

            return `rgba(${s1}${r}${s2}${g}${s3}${b}${s4}${nextRaw}${s5})`;
        });
}

/**
 * 只把「某个色板 + 某个特定 alpha」的 rgba() 改成新的 alpha（强调淡底浓度用），
 * 不连带改同色不同档位的强调描边、焦点环。
 */
function replaceAlphaForRgb(value, rgb, fromAlpha, toAlpha) {
    const target = formatAlpha(toAlpha);
    return value.replace(
        /rgba\((\s*)(\d+)(\s*,\s*)(\d+)(\s*,\s*)(\d+)(\s*,\s*)([\d.]+)(\s*)\)/gi,
        (all, s1, r, s2, g, s3, b, s4, alphaRaw, s5) => {
            if (parseInt(r, 10) !== rgb[0] ||
                parseInt(g, 10) !== rgb[1] ||
                parseInt(b, 10) !== rgb[2]) return all;
            if (Math.abs(parseFloat(alphaRaw) - fromAlpha) > 0.005) return all;
            if (Math.abs(parseFloat(target) - parseFloat(alphaRaw)) < 0.005) return all;
            return `rgba(${s1}${r}${s2}${g}${s3}${b}${s4}${target}${s5})`;
        });
}

/**
 * 把声明值里的圆角 px 档位按 refToken 比例换算成新档位，保留 `8px 0 0 8px` 复合写法。
 * 比例换算而非一刀切：源主题 8px/12px 是两档有意设计，默认值处系数为 1，
 * 不会在「什么都没改」时改变原主题观感。
 */
function replacePxTokens(value, tokens, refToken, newPx) {
    if (!(refToken > 0)) return null;
    let changed = false;

    const out = value.replace(/(-?[\d.]+)px\b/g, (all, num) => {
        const parsed = parseFloat(num);
        if (tokens.indexOf(parsed) < 0) return all;
        const scaled = Math.max(0, Math.round(newPx * parsed / refToken));
        if (scaled === parsed) return all;
        changed = true;
        return `${scaled}px`;
    });

    return changed ? out : null;
}

/** 按比例缩放 pt 字号（保留一位小数） */
function scalePtSize(value, factor) {
    return value.replace(/(-?[\d.]+)pt\b/g, (all, num) => {
        const parsed = parseFloat(num);
        const next = Math.round(parsed * factor * 10) / 10;
        return `${next}pt`;
    });
}

module.exports = {
    parse,
    stringify,
    eachRule,
    selectorList,
    selectorMatches,
    mapDeclarations,
    transformRules,
    rewriteDefine,
    varRefs,
    collectVarUsage,
    replaceRgbLiteral,
    replaceBgDefineLiterals,
    replaceNamedDefineLiterals,
    scaleAlphaInValue,
    replaceAlphaForRgb,
    replacePxTokens,
    scalePtSize,
    formatAlpha
};