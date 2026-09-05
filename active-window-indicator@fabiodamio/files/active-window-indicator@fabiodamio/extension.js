const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Meta = imports.gi.Meta;
const Main = imports.ui.main;
const Settings = imports.ui.settings;
const Cairo = imports.cairo;
const Mainloop = imports.mainloop;

let focusSignal = null;
let sizeSignal = null;
let positionSignal = null;
let stateSignal = null;
let workspaceSignal = null;
let overviewOpenId = null;
let overviewCloseId = null;

let currentWindow = null;
let indicator = null;
let canvas = null;
let settings = null;

let animLoopId = null;
let animProgress = 0.0;
let animDirection = 1;

function cleanupWindowSignals() {
    if (currentWindow) {
        if (sizeSignal) {
            currentWindow.disconnect(sizeSignal);
            sizeSignal = null;
        }
        if (positionSignal) {
            currentWindow.disconnect(positionSignal);
            positionSignal = null;
        }
        if (stateSignal) {
            currentWindow.disconnect(stateSignal);
            stateSignal = null;
        }
        currentWindow = null;
    }
}

function parseColorRGB(colorStr) {
    if (colorStr.startsWith('rgb')) {
        let matches = colorStr.match(/\d+/g);
        if (matches && matches.length >= 3) {
            return [parseInt(matches[0]) / 255, parseInt(matches[1]) / 255, parseInt(matches[2]) / 255];
        }
    }
    if (colorStr.startsWith('#')) {
        let hex = colorStr.replace('#', '');
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }
        let r = (parseInt(hex.substring(0, 2), 16) || 0) / 255;
        let g = (parseInt(hex.substring(2, 4), 16) || 0) / 255;
        let b = (parseInt(hex.substring(4, 6), 16) || 0) / 255;
        return [r, g, b];
    }
    return [0, 0.8, 1];
}

function interpolateColor(c1, c2, factor) {
    return [
        c1[0] + (c2[0] - c1[0]) * factor,
        c1[1] + (c2[1] - c1[1]) * factor,
        c1[2] + (c2[2] - c1[2]) * factor
    ];
}

function startAnimLoop() {
    if (animLoopId) return;
    
    animLoopId = Mainloop.timeout_add(33, () => {
        let animSpeed = 5;
        if (settings) {
            try { animSpeed = settings.getValue('anim-speed'); } catch (e) {}
        }

        let step = (animSpeed * 0.005);
        animProgress += step * animDirection;

        if (animProgress >= 1.0) {
            animProgress = 1.0;
            animDirection = -1;
        } else if (animProgress <= 0.0) {
            animProgress = 0.0;
            animDirection = 1;
        }

        if (canvas && indicator && indicator.visible) {
            canvas.invalidate();
        }

        return true;
    });
}

function stopAnimLoop() {
    if (animLoopId) {
        Mainloop.source_remove(animLoopId);
        animLoopId = null;
    }
}

function drawTrapezoid(canvasActor, cr, width, height) {
    cr.save();
    cr.setOperator(Cairo.Operator.CLEAR);
    cr.paint();
    cr.restore();

    if (width <= 0 || height <= 0) return;

    let slantPixels = 10;
    let alphaPercent = 80;
    let rawColorStart = 'rgb(0, 210, 255)';
    let rawColorEnd = 'rgb(58, 123, 213)';

    if (settings) {
        try { slantPixels = settings.getValue('slant-percent'); } catch (e) {}
        try { alphaPercent = settings.getValue('alpha-percent'); } catch (e) {}
        try { rawColorStart = settings.getValue('color-start'); } catch (e) {}
        try { rawColorEnd = settings.getValue('color-end'); } catch (e) {}
    }

    let alpha = alphaPercent / 100.0;
    let slant = Math.min(slantPixels, width / 2);

    cr.moveTo(0, 0);                    
    cr.lineTo(width, 0);                    
    cr.lineTo(width - slant, height); 
    cr.lineTo(slant, height);         
    cr.closePath();

    let pattern = new Cairo.LinearGradient(0, 0, width, 0);
    let cStart = parseColorRGB(rawColorStart);
    let cEnd = parseColorRGB(rawColorEnd);

    let currentStart = interpolateColor(cStart, cEnd, animProgress);
    let currentEnd = interpolateColor(cEnd, cStart, animProgress);

    pattern.addColorStopRGBA(0, currentStart[0], currentStart[1], currentStart[2], alpha);
    pattern.addColorStopRGBA(1, currentEnd[0], currentEnd[1], currentEnd[2], alpha);

    cr.setSource(pattern);
    cr.fill();
}

function updateIndicator() {
    if (Main.overview && Main.overview.visible) {
        if (indicator && indicator.visible) {
            indicator.ease({
                opacity: 0,
                duration: 100,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => { indicator.hide(); }
            });
        }
        return;
    }

    let focusWindow = global.display.focus_window;
    let activeWorkspace = global.workspace_manager.get_active_workspace();

    if (!focusWindow || 
        focusWindow.is_override_redirect() || 
        focusWindow.is_fullscreen() ||
        focusWindow.minimized ||
        focusWindow.window_type !== Meta.WindowType.NORMAL ||
        !focusWindow.located_on_workspace(activeWorkspace)) {
        
        if (indicator && indicator.visible) {
            indicator.ease({
                opacity: 0,
                duration: 100,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => { indicator.hide(); }
            });
        }
        return;
    }
    
    let rect = focusWindow.get_frame_rect();

    let lineHeight = 6;
    let widthPercent = 80;

    if (settings) {
        try { lineHeight = settings.getValue('line-height'); } catch (e) {}
        try { widthPercent = settings.getValue('width-percent'); } catch (e) {}
    }

    let barWidth = Math.round((rect.width * widthPercent) / 100);
    let offsetX = Math.round((rect.width - barWidth) / 2);

    // Coordinate esatte occupate dalla barra sul monitor
    let barX1 = rect.x + offsetX;
    let barX2 = rect.x + offsetX + barWidth;
    let barY = rect.y;

    // Controlla se c'è un'altra finestra normale che copre specificamente la nostra barra
    let windows = global.get_window_actors().map(w => w.meta_window);
    let isCovered = false;
    
    let ourIndex = windows.indexOf(focusWindow);
    if (ourIndex !== -1) {
        for (let i = ourIndex + 1; i < windows.length; i++) {
            let win = windows[i];
            if (win.minimized || win.is_override_redirect() || win.window_type !== Meta.WindowType.NORMAL) {
                continue;
            }
            if (win.located_on_workspace(activeWorkspace)) {
                let winRect = win.get_frame_rect();
                
                // Una finestra copre la barra se:
                // 1. Si sovrappone orizzontalmente alla barra [barX1, barX2]
                // 2. Si estende verticalmente coprendo la coordinata della barra (barY si trova tra la cima e il fondo della finestra sopra)
                let overlapsX = (winRect.x < barX2) && (winRect.x + winRect.width > barX1);
                // Espandiamo leggermente il controllo verticale per includere interamente lo spessore della barra
                let overlapsY = (winRect.y <= barY + lineHeight) && (winRect.y + winRect.height >= barY);

                if (overlapsX && overlapsY) {
                    isCovered = true;
                    break;
                }
            }
        }
    }

    // Se la finestra è coperta, nascondiamo la barra e pianifichiamo un controllo a breve 
    // per intercettare il momento in cui sale in primo piano dopo il clic (fondamentale per sloppy).
    if (isCovered) {
        if (indicator && indicator.visible) {
            indicator.ease({
                opacity: 0,
                duration: 100,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => { indicator.hide(); }
            });
        }
        
        Mainloop.timeout_add(200, () => {
            updateIndicator();
            return false;
        });
        
        return;
    }

    if (!canvas) {
        canvas = new Clutter.Canvas();
        canvas.connect('draw', drawTrapezoid);
    }
    
    // Assegnazione forzata delle dimensioni aggiornate al canvas e all'indicatore
    canvas.set_size(barWidth, lineHeight);

    if (!indicator) {
        indicator = new St.Widget({
            name: 'ActiveWindowIndicator',
            reactive: false,
            opacity: 0
        });
        indicator.set_content(canvas);
        Main.uiGroup.add_actor(indicator);
    }

    indicator.set_position(rect.x + offsetX, rect.y);
    indicator.set_size(barWidth, lineHeight);
    
    canvas.invalidate();
    
    indicator.show();
    indicator.raise_top();
    indicator.ease({
        opacity: 255,
        duration: 150,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD
    });
}

function onFocusChanged() {
    cleanupWindowSignals();

    let focusWindow = global.display.focus_window;
    if (focusWindow && focusWindow.window_type === Meta.WindowType.NORMAL) {
        currentWindow = focusWindow;
        positionSignal = currentWindow.connect('position-changed', updateIndicator);
        sizeSignal = currentWindow.connect('size-changed', updateIndicator);
        
        try {
            stateSignal = currentWindow.connect('window-state-changed', () => {
                updateIndicator();
            });
        } catch (e) {}
    }

    updateIndicator();
}

function init(metadata) {
}

function enable() {
    try {
        settings = new Settings.ExtensionSettings(this, 'active-window-indicator@fabiodamio', 'active-window-indicator@fabiodamio');
        settings.bind('line-height', 'lineHeight', updateIndicator);
        settings.bind('width-percent', 'widthPercent', updateIndicator);
        settings.bind('slant-percent', 'slantPercent', updateIndicator);
        settings.bind('alpha-percent', 'alphaPercent', updateIndicator);
        settings.bind('anim-speed', 'animSpeed', updateIndicator);
        settings.bind('color-start', 'colorStart', updateIndicator);
        settings.bind('color-end', 'colorEnd', updateIndicator);
    } catch (e) {
        global.logError('Errore nell\'inizializzazione delle impostazioni:', e);
    }

    focusSignal = global.display.connect('notify::focus-window', onFocusChanged);
    workspaceSignal = global.workspace_manager.connect('active-workspace-changed', updateIndicator);
    
    if (Main.overview) {
        overviewOpenId = Main.overview.connect('showing', () => {
            if (indicator && indicator.visible) {
                indicator.ease({
                    opacity: 0,
                    duration: 100,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    onComplete: () => { indicator.hide(); }
                });
            }
        });
        overviewCloseId = Main.overview.connect('hidden', () => {
            Mainloop.timeout_add(50, () => {
                updateIndicator();
                return false;
            });
        });
    }

    startAnimLoop();
    onFocusChanged();
}

function disable() {
    stopAnimLoop();

    if (focusSignal) {
        global.display.disconnect(focusSignal);
        focusSignal = null;
    }
    
    if (workspaceSignal) {
        global.workspace_manager.disconnect(workspaceSignal);
        workspaceSignal = null;
    }

    if (Main.overview) {
        if (overviewOpenId) {
            Main.overview.disconnect(overviewOpenId);
            overviewOpenId = null;
        }
        if (overviewCloseId) {
            Main.overview.disconnect(overviewCloseId);
            overviewCloseId = null;
        }
    }

    cleanupWindowSignals();

    if (indicator) {
        indicator.destroy();
        indicator = null;
    }
    
    canvas = null;
    settings = null;
}
