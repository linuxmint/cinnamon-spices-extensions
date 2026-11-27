/* palettePreview.js — 把终端调色板渲染成一张 SVG 色卡图
 *
 * 纯字符串拼接，不碰 Gio / Cairo / Cinnamon。离线自检用同一函数重画并与仓库里的
 * SVG 逐字节比对 —— 改了 lib/terminal.js 的配色必须重跑 tools/make-palette-preview.js。
 */

module.exports = {
    buildSvg,
    ORDER: ['nebula-dark', 'nebula-light', 'neutral'],
};

/* ---------- 排版常量 ---------- */

const SWATCH = 30;
const GAP = 4;
const ROW_H = 46;
const LABEL_W = 132;
const PAD = 16;
const HEADER_H = 34;

/**
 * @param {{getScheme: (id: string) => {label: string, colors: string[]}|null}} Terminal
 * @returns {string}
 */
function buildSvg(Terminal) {
    const rows = module.exports.ORDER
        .map(id => Terminal.getScheme(id))
        .filter(Boolean);

    const cols = 16;
    const innerW = LABEL_W + cols * SWATCH + (cols - 1) * GAP;
    const width = innerW + PAD * 2;
    const height = HEADER_H + rows.length * ROW_H + PAD;

    let out = '';
    out += `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
        `viewBox="0 0 ${width} ${height}" font-family="Noto Sans CJK SC,DejaVu Sans,sans-serif">`;
    out += `<rect width="${width}" height="${height}" rx="10" fill="#161b22"/>`;
    out += `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="9.5" ` +
        `fill="none" stroke="#30363d"/>`;

    out += `<text x="${PAD}" y="${HEADER_H - 12}" fill="#8b949e" font-size="12">` +
        `ANSI 16 色 · 0–7 常态 / 8–15 高亮</text>`;

    rows.forEach((scheme, rowIndex) => {
        const top = HEADER_H + rowIndex * ROW_H;

        out += `<text x="${PAD}" y="${top + 24}" fill="#e6edf3" font-size="13">` +
            `${scheme.label}</text>`;

        for (let i = 0; i < cols; i++) {
            const sx = PAD + LABEL_W + i * (SWATCH + GAP);
            out += `<rect x="${sx}" y="${top + 2}" width="${SWATCH}" height="${SWATCH}" ` +
                `rx="6" fill="${scheme.colors[i]}" stroke="#30363d" stroke-width="1"/>`;
            out += `<text x="${sx + SWATCH / 2}" y="${top + 42}" fill="#6e7681" ` +
                `font-size="9" text-anchor="middle">${i}</text>`;
        }
    });

    out += '</svg>';
    return out;
}