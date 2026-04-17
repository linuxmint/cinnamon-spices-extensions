/**
 * ColorPalette - Wallpaper color extraction and palette analysis
 *
 * Extracts dominant colors from image files using GdkPixbuf pixel sampling
 * and quantization. Provides color selection helpers for accent, background,
 * and secondary popup colors.
 *
 * Adapted from savjs/colorPalette.js for CSSPanels production architecture.
 * Removes disk cache, GNOME-specific logger, and background monitoring logic.
 *
 * @module colorPalette
 */

const { GdkPixbuf } = imports.gi;
const { ThemeUtils } = require('./themeUtils');
const { WALLPAPER_COLORS } = require('./constants');

/**
 * Color palette extractor with in-memory LRU cache
 */
class ColorPalette {
    /**
     * @param {object} extension - CSSPanels extension instance (for debugLog)
     */
    constructor(extension) {
        this.extension = extension;
        this._cache = new Map(); // In-memory only, max 5 entries (LRU)
        this._maxCacheSize = 5;
    }

    // ===== PUBLIC API =====

    /**
     * Extract dominant colors from an already-loaded GdkPixbuf.
     *
     * Pixbuf-accepting variant of extractColorsFromImage() — avoids a second
     * disk read when the caller already holds the pixbuf in memory.
     * The pixbuf is NOT disposed here; the caller owns its lifecycle.
     *
     * @param {GdkPixbuf.Pixbuf} pixbuf - Pre-loaded pixbuf
     * @param {number} [maxColors=8] - Maximum number of colors to return
     * @param {boolean} [preferLight=false] - If true, prefer light colors
     * @returns {Array<Array<number>>} Array of [r, g, b] color arrays sorted by frequency
     */
    extractFromPixbuf(pixbuf, maxColors = 8, preferLight = false) {
        if (!pixbuf) {
            return this.getDefaultPalette();
        }
        return this.analyzePixbuf(pixbuf, maxColors, preferLight);
    }

    /**
     * Compute dominant tone from an already-loaded GdkPixbuf.
     *
     * Pixbuf-accepting variant of extractDominantTone() — avoids a second
     * disk read when the caller already holds the pixbuf in memory.
     * The pixbuf is NOT disposed here; the caller owns its lifecycle.
     *
     * @param {GdkPixbuf.Pixbuf} pixbuf - Pre-loaded pixbuf
     * @param {boolean} [isDarkMode=false] - When true, skip very bright pixels
     * @returns {Array<number>} [r, g, b] weighted average color
     */
    analyzePixbufForTone(pixbuf, isDarkMode = false) {
        if (!pixbuf) {
            return isDarkMode ? [46, 52, 64] : [236, 239, 244];
        }

        try {
            const width = pixbuf.get_width();
            const height = pixbuf.get_height();
            const nChannels = pixbuf.get_n_channels();
            const rowstride = pixbuf.get_rowstride();
            const pixels = pixbuf.get_pixels();
            const hasAlpha = pixbuf.get_has_alpha();

            const gridStep = Math.max(1, Math.round(
                Math.sqrt((width * height) / WALLPAPER_COLORS.COLOR_ANALYSIS_TARGET_SAMPLES)
            ));

            const brightnessMin = isDarkMode ? 8  : 20;
            const brightnessMax = isDarkMode ? 210 : 240;

            let totalR = 0, totalG = 0, totalB = 0, count = 0;

            for (let y = 0; y < height; y += gridStep) {
                for (let x = 0; x < width; x += gridStep) {
                    const offset = y * rowstride + x * nChannels;
                    const r = pixels[offset];
                    const g = pixels[offset + 1];
                    const b = pixels[offset + 2];
                    const a = hasAlpha ? pixels[offset + 3] : 255;

                    if (a < 128) continue;

                    const brightness = ThemeUtils.getHSP(r, g, b);
                    if (brightness < brightnessMin || brightness > brightnessMax) continue;

                    totalR += r;
                    totalG += g;
                    totalB += b;
                    count++;
                }
            }

            if (count === 0) {
                this._debugLog(`analyzePixbufForTone: no valid pixels, using fallback`);
                return isDarkMode ? [46, 52, 64] : [220, 220, 220];
            }

            const result = [
                Math.round(totalR / count),
                Math.round(totalG / count),
                Math.round(totalB / count),
            ];

            this._debugLog(
                `Dominant tone (from pixbuf): rgb(${result.join(', ')}) from ${count} pixels ` +
                `(${isDarkMode ? 'dark' : 'light'} mode)`
            );

            return result;
        } catch (e) {
            this._debugLog(`analyzePixbufForTone error: ${e.message}`);
            return isDarkMode ? [46, 52, 64] : [236, 239, 244];
        }
    }

    /**
     * Extract dominant colors from an image file
     *
     * Accepts a plain file path (NOT a file:// URI). Loads the image scaled
     * to max dimension, analyzes pixels, and returns sorted color palette.
     * Results are cached per-path with LRU eviction (max 5 entries).
     *
     * @param {string} path - Plain file path to image (e.g. /home/user/wallpaper.jpg)
     * @param {number} [maxColors=8] - Maximum number of colors to return
     * @param {boolean} [preferLight=false] - If true, prefer light colors; if false, prefer dark
     * @returns {Array<Array<number>>} Array of [r, g, b] color arrays, sorted by frequency
     */
    extractColorsFromImage(path, maxColors = 8, preferLight = false) {
        const cacheKey = `${path}:${preferLight ? 'light' : 'dark'}`;

        // Return cached result if available (promote to most-recent)
        if (this._cache.has(cacheKey)) {
            const cached = this._cache.get(cacheKey);
            // LRU: re-insert to make it most-recent
            this._cache.delete(cacheKey);
            this._cache.set(cacheKey, cached);
            this._debugLog(`Cache hit for ${path}`);
            return cached;
        }

        try {
            const MAX_DIMENSION = WALLPAPER_COLORS.COLOR_ANALYSIS_MAX_DIMENSION;
            let pixbuf;

            try {
                pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(
                    path,
                    MAX_DIMENSION,
                    MAX_DIMENSION,
                    true // preserve aspect ratio
                );
            } catch (loadErr) {
                this._debugLog(`Failed to load image ${path}: ${loadErr.message}`);
                return this.getDefaultPalette();
            }

            if (!pixbuf) {
                this._debugLog(`Pixbuf is null for ${path}`);
                return this.getDefaultPalette();
            }

            const palette = this.analyzePixbuf(pixbuf, maxColors, preferLight);

            // LRU: evict oldest entry if cache is full
            if (this._cache.size >= this._maxCacheSize) {
                const oldestKey = this._cache.keys().next().value;
                this._cache.delete(oldestKey);
                this._debugLog(`Cache evicted oldest entry (${oldestKey})`);
            }

            this._cache.set(cacheKey, palette);
            this._debugLog(`Cached palette for ${path} (${palette.length} colors)`);

            return palette;
        } catch (e) {
            this._debugLog(`Error extracting colors from ${path}: ${e.message}`);
            return this.getDefaultPalette();
        }
    }

    /**
     * Analyze a GdkPixbuf to extract dominant colors via pixel sampling and quantization
     *
     * Disposes the pixbuf after analysis to prevent memory accumulation.
     * Returns colors sorted by pixel frequency (most dominant first).
     *
     * @param {GdkPixbuf.Pixbuf} pixbuf - Image pixbuf to analyze
     * @param {number} maxColors - Maximum number of colors to extract
     * @param {boolean} [preferLight=false] - If true, extract light tones; if false, dark tones
     * @returns {Array<Array<number>>} Array of [r, g, b] arrays sorted by frequency
     */
    analyzePixbuf(pixbuf, maxColors, preferLight = false) {
        // Track which pixbuf needs disposal after analysis
        let needsDispose = false;
        let pixbufToDispose = null;

        // Resize large images for better performance
        const MAX_DIMENSION = WALLPAPER_COLORS.COLOR_ANALYSIS_MAX_DIMENSION;
        if (pixbuf.get_width() > MAX_DIMENSION || pixbuf.get_height() > MAX_DIMENSION) {
            const scale = MAX_DIMENSION / Math.max(pixbuf.get_width(), pixbuf.get_height());
            const resizedPixbuf = pixbuf.scale_simple(
                Math.round(pixbuf.get_width() * scale),
                Math.round(pixbuf.get_height() * scale),
                GdkPixbuf.InterpType.BILINEAR
            );
            this._debugLog(`Resized image to ${resizedPixbuf.get_width()}x${resizedPixbuf.get_height()} for analysis`);

            // Dispose original full-size pixbuf immediately (can be 10-50MB uncompressed).
            // Prevents holding both full-size + resized in memory simultaneously.
            try {
                pixbuf.run_dispose();
            } catch (e) {
                this._debugLog(`Error disposing original pixbuf: ${e.message}`);
            }

            // Use resized pixbuf for analysis
            pixbuf = resizedPixbuf;
            pixbufToDispose = resizedPixbuf;
            needsDispose = true;
        } else {
            // No resize needed, but still dispose after analysis
            pixbufToDispose = pixbuf;
            needsDispose = true;
        }

        const width = pixbuf.get_width();
        const height = pixbuf.get_height();
        const nChannels = pixbuf.get_n_channels();
        const rowstride = pixbuf.get_rowstride(); // bytes per row (may include padding)
        const pixels = pixbuf.get_pixels();
        const hasAlpha = pixbuf.get_has_alpha();

        // Compute grid step so that total samples ≈ TARGET_SAMPLES across the image.
        // Using sqrt keeps step proportional to both dimensions (avoids skinny grids).
        const gridStep = Math.max(1, Math.round(Math.sqrt((width * height) / WALLPAPER_COLORS.COLOR_ANALYSIS_TARGET_SAMPLES)));
        const colorMap = new Map();

        let skippedTransparent = 0;
        let skippedBlackWhite = 0;
        let processedPixels = 0;

        // Brightness thresholds based on theme preference
        const thresholds = WALLPAPER_COLORS.BRIGHTNESS_THRESHOLDS[preferLight ? 'light' : 'dark'];
        const brightnessMin = thresholds.min;
        const brightnessMax = thresholds.max;

        for (let y = 0; y < height; y += gridStep) {
            for (let x = 0; x < width; x += gridStep) {
                // Use rowstride for correct byte offset — rowstride may differ from width * nChannels
                const offset = y * rowstride + x * nChannels;
                const r = pixels[offset];
                const g = pixels[offset + 1];
                const b = pixels[offset + 2];
                const a = hasAlpha ? pixels[offset + 3] : 255;

                // Skip transparent pixels (alpha < 128)
                if (a < 128) {
                    skippedTransparent++;
                    continue;
                }

                // Calculate perceived brightness and skip out-of-range tones
                const brightness = ThemeUtils.getHSP(r, g, b);
                if (brightness < brightnessMin || brightness > brightnessMax) {
                    skippedBlackWhite++;
                    continue;
                }

                // Skip grayscale/desaturated pixels
                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                const delta = max - min;
                if (delta < WALLPAPER_COLORS.COLOR_MIN_SATURATION_DELTA) {
                    skippedBlackWhite++;
                    continue;
                }

                // Quantize to cluster similar colors
                const colorKey = this.quantizeColor(r, g, b, WALLPAPER_COLORS.COLOR_QUANTIZATION_STEP);
                colorMap.set(colorKey, (colorMap.get(colorKey) || 0) + 1);
                processedPixels++;
            }
        }

        this._debugLog(
            `Analyzed ${processedPixels} pixels (${preferLight ? 'light' : 'dark'} mode), ` +
            `skipped ${skippedTransparent} transparent, ${skippedBlackWhite} out-of-range`
        );

        // Sort by frequency and extract top N colors
        const sortedColors = Array.from(colorMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxColors)
            .map(([colorKey]) => this.parseColorKey(colorKey));

        // Dispose pixbuf after analysis to prevent memory accumulation
        if (needsDispose && pixbufToDispose) {
            try {
                pixbufToDispose.run_dispose();
                this._debugLog(`Disposed pixbuf after analysis (${width}x${height})`);
            } catch (e) {
                this._debugLog(`Error disposing pixbuf: ${e.message}`);
            }
        }

        return sortedColors.length > 0 ? sortedColors : this.getDefaultPalette();
    }

    /**
     * Get the best accent color from a palette
     *
     * Scores colors by saturation (60%) and perceived brightness (40%).
     * Prefers vibrant colors at medium brightness.
     *
     * @param {Array<Array<number>>} palette - Array of [r, g, b] colors
     * @returns {Array<number>} Best [r, g, b] accent color
     */
    getBestAccentColor(palette) {
        if (!palette || palette.length === 0) {
            return [136, 192, 208]; // Nord frost fallback
        }

        let bestColor = null;
        let bestScore = -1;

        for (const color of palette) {
            const [r, g, b] = color;

            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const delta = max - min;
            const saturation = max === 0 ? 0 : delta / max;

            const brightness = ThemeUtils.getHSP(r, g, b);

            const brightnessScore = 1 - Math.abs(brightness - 140) / 140;
            const saturationScore = saturation;

            const score = saturationScore * 0.6 + brightnessScore * 0.4;

            if (score > bestScore) {
                bestScore = score;
                bestColor = color;
            }
        }

        // Minimum saturation threshold — if best score is too low the palette is
        // essentially greyscale (B&W wallpaper). Fall back to DEFAULT_ACCENT so
        // we don't apply a random near-grey as an accent color.
        const MIN_ACCENT_SCORE = 0.15;
        if (bestScore < MIN_ACCENT_SCORE || !bestColor) {
            this._debugLog(`Best accent score ${bestScore.toFixed(3)} below threshold — using DEFAULT_ACCENT fallback`);
            const { DEFAULT_COLORS } = require('./constants');
            const fa = DEFAULT_COLORS.DEFAULT_ACCENT;
            return [fa.r, fa.g, fa.b];
        }

        this._debugLog(`Best accent color: rgb(${bestColor.join(', ')}) score=${bestScore.toFixed(3)}`);
        return bestColor;
    }

    /**
     * Get the best background color from a palette
     *
     * Finds the color closest to the target brightness (60 for dark, 200 for light).
     *
     * @param {Array<Array<number>>} palette - Array of [r, g, b] colors
     * @param {boolean} [preferDark=false] - If true, target dark tones; if false, light tones
     * @returns {Array<number>} Best [r, g, b] background color
     */
    getBestBackgroundColor(palette, preferDark = false) {
        if (!palette || palette.length === 0) {
            return preferDark ? [46, 52, 64] : [236, 239, 244];
        }

        const targetBrightness = preferDark ? 60 : 200;
        let bestColor = palette[0];
        let bestDiff = Infinity;

        for (const color of palette) {
            const brightness = ThemeUtils.getHSP(...color);
            const diff = Math.abs(brightness - targetBrightness);

            if (diff < bestDiff) {
                bestDiff = diff;
                bestColor = color;
            }
        }

        this._debugLog(`Best background color: rgb(${bestColor.join(', ')}) (${preferDark ? 'dark' : 'light'} mode)`);
        return bestColor;
    }

    /**
     * Get secondary color for popup background with contrast validation
     *
     * Iterates the palette to find the first candidate that has (a) sufficient
     * contrast against the expected foreground (white/black) and (b) a minimum
     * visual distance from dominantColor so popup looks distinct from panel.
     * Falls back to a shaded dominant if no qualifying candidate is found.
     *
     * @param {Array<Array<number>>} palette - Array of [r, g, b] arrays from extractColorsFromImage
     * @param {Array<number>} dominantColor - [r, g, b] dominant (panel) color
     * @param {boolean} isDarkMode - Current theme mode
     * @returns {Array<number>} [r, g, b] secondary color suitable for popup background
     */
    getSecondaryColor(palette, dominantColor, isDarkMode) {
        const expectedFg = isDarkMode ? [255, 255, 255] : [0, 0, 0];
        const shadeFactor = isDarkMode
            ? WALLPAPER_COLORS.POPUP_SHADE_FALLBACK_DARK
            : WALLPAPER_COLORS.POPUP_SHADE_FALLBACK_LIGHT;

        // Minimum RGB distance from dominant to avoid near-duplicate popup color
        const MIN_DISTANCE = 30;

        for (const candidate of palette) {
            const ratio = ThemeUtils.contrastRatio(candidate, expectedFg);
            if (ratio < WALLPAPER_COLORS.POPUP_MIN_CONTRAST_RATIO) continue;

            // Reject if candidate is visually too close to the dominant (panel) color
            const dr = candidate[0] - dominantColor[0];
            const dg = candidate[1] - dominantColor[1];
            const db = candidate[2] - dominantColor[2];
            const distance = Math.sqrt(dr * dr + dg * dg + db * db);
            if (distance < MIN_DISTANCE) continue;

            this._debugLog(`Secondary color: contrast ${ratio.toFixed(2)} OK, dist ${distance.toFixed(0)}, shading candidate`);
            return ThemeUtils.colorShade(candidate, shadeFactor);
        }

        // No qualifying candidate found — shade dominant as fallback
        this._debugLog(`Secondary color: no qualifying candidate, shading dominant`);
        return ThemeUtils.colorShade(dominantColor, shadeFactor);
    }

    /**
     * Extract dominant tone from an image for use as panel background color.
     *
     * Unlike extractColorsFromImage(), this method does NOT filter out grayscale
     * or desaturated pixels. It samples the entire image and returns a weighted
     * average color that represents the true visual tone of the wallpaper —
     * dark grey for dark wallpapers, warm beige for warm ones, etc.
     *
     * Intended to replace getBestBackgroundColor() as the panel color source,
     * so that a near-black wallpaper gives a near-black panel instead of a
     * spurious saturated color leaked by the saturation filter.
     *
     * Uses the same grid-step sampling as analyzePixbuf() for performance
     * consistency. Skips fully transparent and pure white/black extremes to
     * avoid washing out the result.
     *
     * @param {string} path - Plain file path to image (e.g. /home/user/wallpaper.jpg)
     * @param {boolean} [isDarkMode=false] - When true, skip very bright pixels; when false, skip very dark ones
     * @returns {Array<number>} [r, g, b] weighted average color
     */
    extractDominantTone(path, isDarkMode = false) {
        const cacheKey = `${path}:tone:${isDarkMode ? 'dark' : 'light'}`;

        // Return cached result if available (LRU promote)
        if (this._cache.has(cacheKey)) {
            const cached = this._cache.get(cacheKey);
            this._cache.delete(cacheKey);
            this._cache.set(cacheKey, cached);
            this._debugLog(`Cache hit for dominant tone ${path}`);
            return cached;
        }

        try {
            const MAX_DIMENSION = WALLPAPER_COLORS.COLOR_ANALYSIS_MAX_DIMENSION;
            let pixbuf;

            try {
                pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(
                    path,
                    MAX_DIMENSION,
                    MAX_DIMENSION,
                    true
                );
            } catch (loadErr) {
                this._debugLog(`extractDominantTone: failed to load ${path}: ${loadErr.message}`);
                return isDarkMode ? [46, 52, 64] : [236, 239, 244];
            }

            if (!pixbuf) {
                return isDarkMode ? [46, 52, 64] : [236, 239, 244];
            }

            const width = pixbuf.get_width();
            const height = pixbuf.get_height();
            const nChannels = pixbuf.get_n_channels();
            const rowstride = pixbuf.get_rowstride();
            const pixels = pixbuf.get_pixels();
            const hasAlpha = pixbuf.get_has_alpha();

            // Same grid step as analyzePixbuf for consistent performance
            const gridStep = Math.max(1, Math.round(
                Math.sqrt((width * height) / WALLPAPER_COLORS.COLOR_ANALYSIS_TARGET_SAMPLES)
            ));

            // Brightness exclusion range — skip extreme black/white (pure noise)
            // Wider range than analyzePixbuf: include all mid-tones regardless of saturation
            const brightnessMin = isDarkMode ? 8  : 20;
            const brightnessMax = isDarkMode ? 210 : 240;

            // Collect samples for optional trimmed mean
            const samples = [];

            for (let y = 0; y < height; y += gridStep) {
                for (let x = 0; x < width; x += gridStep) {
                    const offset = y * rowstride + x * nChannels;
                    const r = pixels[offset];
                    const g = pixels[offset + 1];
                    const b = pixels[offset + 2];
                    const a = hasAlpha ? pixels[offset + 3] : 255;

                    // Skip transparent pixels
                    if (a < 128) continue;

                    // Skip extreme brightness outliers only
                    const brightness = ThemeUtils.getHSP(r, g, b);
                    if (brightness < brightnessMin || brightness > brightnessMax) continue;

                    // No saturation filter — include grey, neutral, and all mid-tone pixels
                    samples.push([r, g, b, brightness]);
                }
            }

            // Dispose pixbuf
            try { pixbuf.run_dispose(); } catch (e) { /* ignore */ }

            if (samples.length === 0) {
                // Fully black/white image — return safe fallback
                this._debugLog(`extractDominantTone: no valid pixels, using fallback`);
                return isDarkMode ? [46, 52, 64] : [220, 220, 220];
            }

            // Trimmed mean for dark mode: discard brightest 15% to prevent sky/highlight
            // pixels from pulling the average toward lighter values (FIX-8)
            let activeSamples = samples;
            if (isDarkMode && samples.length > 10) {
                samples.sort((a, b) => a[3] - b[3]);
                const trimCount = Math.floor(samples.length * 0.15);
                activeSamples = samples.slice(0, samples.length - trimCount);
                this._debugLog(`Trimmed mean: removed ${trimCount}/${samples.length} brightest samples`);
            }

            let totalR = 0, totalG = 0, totalB = 0;
            for (const [r, g, b] of activeSamples) {
                totalR += r; totalG += g; totalB += b;
            }
            const count = activeSamples.length;

            const result = [
                Math.round(totalR / count),
                Math.round(totalG / count),
                Math.round(totalB / count),
            ];

            this._debugLog(
                `Dominant tone: rgb(${result.join(', ')}) from ${count} pixels ` +
                `(${isDarkMode ? 'dark' : 'light'} mode)`
            );

            // Cache with LRU eviction
            if (this._cache.size >= this._maxCacheSize) {
                const oldestKey = this._cache.keys().next().value;
                this._cache.delete(oldestKey);
            }
            this._cache.set(cacheKey, result);

            return result;
        } catch (e) {
            this._debugLog(`extractDominantTone error: ${e.message}`);
            return isDarkMode ? [46, 52, 64] : [236, 239, 244];
        }
    }

    // ===== HELPERS =====

    /**
     * Quantize RGB color to reduce similar colors into clusters
     *
     * Clamps values to valid RGB range (0-255) to prevent overflow.
     *
     * @param {number} r - Red component (0-255)
     * @param {number} g - Green component (0-255)
     * @param {number} b - Blue component (0-255)
     * @param {number} [step=16] - Quantization step size
     * @returns {string} Quantized color key as "r,g,b"
     */
    quantizeColor(r, g, b, step = 16) {
        const qr = Math.min(255, Math.round(r / step) * step);
        const qg = Math.min(255, Math.round(g / step) * step);
        const qb = Math.min(255, Math.round(b / step) * step);
        return `${qr},${qg},${qb}`;
    }

    /**
     * Parse a quantized color key back to RGB array
     *
     * @param {string} key - Color key as "r,g,b"
     * @returns {Array<number>} [r, g, b] integer array
     */
    parseColorKey(key) {
        return key.split(',').map(n => parseInt(n));
    }

    /**
     * Get default color palette fallback (Nord theme colors)
     *
     * @returns {Array<Array<number>>} Array of [r, g, b] Nord polar night and frost colors
     */
    getDefaultPalette() {
        return [
            [46, 52, 64],    // Nord polar night
            [59, 66, 82],
            [67, 76, 94],
            [76, 86, 106],
            [136, 192, 208], // Nord frost
            [129, 161, 193],
        ];
    }

    // ===== PRIVATE =====

    /**
     * Log debug message via extension debug channel
     *
     * @param {string} message - Message to log
     */
    _debugLog(message) {
        if (this.extension && this.extension.debugLog) {
            this.extension.debugLog(`[ColorPalette] ${message}`);
        }
    }
}

module.exports = { ColorPalette };
