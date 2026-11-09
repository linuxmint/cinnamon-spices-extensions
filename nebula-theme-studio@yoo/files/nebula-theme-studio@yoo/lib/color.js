/* color.js — 颜色解析 / 格式化 / 派生
 *
 * 设置面板 colorchooser 存的是 Gdk.RGBA.to_string()：alpha==1 时 "rgb(r,g,b)"，
 * 否则 "rgba(r,g,b,a)"。因此所有入口都必须同时接受 rgb() / rgba() / #rgb / #rrggbb。
 */

const RGBA_RE = /rgba\(\s*([+-]?[\d.]+)\s*,\s*([+-]?[\d.]+)\s*,\s*([+-]?[\d.]+)\s*(?:,\s*([+-]?[\d.]+)\s*)?\)/i;
const RGB_RE = /rgb\(\s*([+-]?[\d.]+)\s*,\s*([+-]?[\d.]+)\s*,\s*([+-]?[\d.]+)\s*\)/i;
const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function clamp(value, min, max) {
    return value < min ? min : (value > max ? max : value);
}

function clampByte(value) {
    return Math.round(clamp(value, 0, 255));
}

/** 把任意受支持的颜色字符串解析为 {r,g,b,a}（a 缺省为 1）；失败返回 null */
function parse(str) {
    if (typeof str !== 'string') return null;
    const text = str.trim();
    if (!text) return null;

    let m = text.match(RGBA_RE);
    if (m) {
        return {
            r: clampByte(parseFloat(m[1])),
            g: clampByte(parseFloat(m[2])),
            b: clampByte(parseFloat(m[3])),
            a: m[4] === undefined ? 1 : clamp(parseFloat(m[4]), 0, 1)
        };
    }

    m = text.match(RGB_RE);
    if (m) {
        return {
            r: clampByte(parseFloat(m[1])),
            g: clampByte(parseFloat(m[2])),
            b: clampByte(parseFloat(m[3])),
            a: 1
        };
    }

    m = text.match(HEX_RE);
    if (m) {
        let hex = m[1];
        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        return {
            r: parseInt(hex.substr(0, 2), 16),
            g: parseInt(hex.substr(2, 2), 16),
            b: parseInt(hex.substr(4, 2), 16),
            a: 1
        };
    }

    return null;
}

/** 解析失败时退回 fallback（fallback 允许是 {r,g,b} 或颜色字符串） */
function parseOr(str, fallback) {
    const parsed = parse(str);
    if (parsed) return parsed;
    const fb = typeof fallback === 'string' ? parse(fallback) : fallback;
    return fb ? { r: fb.r, g: fb.g, b: fb.b, a: fb.a === undefined ? 1 : fb.a } : null;
}

function toHex(color) {
    if (!color) return '#000000';
    const hex = n => clampByte(n).toString(16).padStart(2, '0');
    return '#' + hex(color.r) + hex(color.g) + hex(color.b);
}

/** 与 colorchooser 一致的存储格式 */
function toRgbString(color) {
    if (!color) return 'rgb(0,0,0)';
    if (color.a !== undefined && color.a < 1) {
        return `rgba(${clampByte(color.r)},${clampByte(color.g)},${clampByte(color.b)},${round(color.a, 2)})`;
    }
    return `rgb(${clampByte(color.r)},${clampByte(color.g)},${clampByte(color.b)})`;
}

function equals(a, b, tolerance) {
    if (!a || !b) return false;
    const t = tolerance === undefined ? 0 : tolerance;
    return Math.abs(a.r - b.r) <= t &&
           Math.abs(a.g - b.g) <= t &&
           Math.abs(a.b - b.b) <= t;
}

function round(value, digits) {
    const f = Math.pow(10, digits === undefined ? 2 : digits);
    return Math.round(value * f) / f;
}

function mix(from, to, ratio) {
    const t = clamp(ratio, 0, 1);
    return {
        r: clampByte(from.r + (to.r - from.r) * t),
        g: clampByte(from.g + (to.g - from.g) * t),
        b: clampByte(from.b + (to.b - from.b) * t),
        a: 1
    };
}

/**
 * 朝白色提亮（amount > 0）或朝黑色压暗（amount < 0）
 */
function shade(color, amount) {
    const target = amount >= 0 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
    return mix(color, target, Math.abs(amount));
}

module.exports = {
    parse,
    parseOr,
    toHex,
    toRgbString,
    equals,
    round,
    mix,
    shade,
    clamp,
    clampByte
};