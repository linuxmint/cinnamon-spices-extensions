// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

function norm(s) {
    return String(s === null || s === undefined ? '' : s).trim().toLowerCase();
}

// Keys that name the same application in an X11 session and in a Wayland session, so that a window saved in one is found in
// the other. A native Wayland window has its app id as class and instance, while the X11 window of the same application
// often has another class or instance. Each group is one application; a key in a group matches the other keys of it.
// A group lists the keys the application's windows report in each session (started natively and with GDK_BACKEND=x11),
// or keys that follow from the same naming (the KDE applications) or from the application's desktop id and the class its X11
// window reports; a wrong guess only means that the place is not carried across.
// Many applications need no group because both sessions give them the same key (Nautilus, Mousepad, Thunar and others).
// Not here: the properties window of Nemo (`nemo|file_properties` on X11, `nemo|nemo` on Wayland): it would share the key
// of Nemo's main windows.
var KEY_GROUPS = [
    ['gnome-terminal|gnome-terminal-server', 'gnome-terminal-server|gnome-terminal-server'],
    ['kate|kate-bin', 'kate|kate', 'org.kde.kate|org.kde.kate'],
    ['dolphin|dolphin', 'org.kde.dolphin|org.kde.dolphin'],
    ['konqueror|konqueror', 'org.kde.konqueror|org.kde.konqueror'],
    ['bleachbit|org.bleachbit.bleachbit', 'org.bleachbit.bleachbit|org.bleachbit.bleachbit'],
    ['com.mitchellh.ghostty|ghostty', 'com.mitchellh.ghostty|com.mitchellh.ghostty'],
    ['discover|plasma-discover', 'org.kde.discover|org.kde.discover'],
    ['firefox|navigator', 'firefox|firefox'],
    ['thunderbird|mail', 'thunderbird|thunderbird'],
    ['meld|org.gnome.meld', 'org.gnome.meld|org.gnome.meld'],
    ['drawing|com.github.maoschanz.drawing', 'com.github.maoschanz.drawing|com.github.maoschanz.drawing'],
    // Every LibreOffice program has the instance "libreoffice" on X11 and its own name as app id on Wayland.
    ['libreoffice-writer|libreoffice', 'libreoffice-writer|libreoffice-writer'],
    ['libreoffice-calc|libreoffice', 'libreoffice-calc|libreoffice-calc'],
    ['libreoffice-impress|libreoffice', 'libreoffice-impress|libreoffice-impress'],
    ['libreoffice-draw|libreoffice', 'libreoffice-draw|libreoffice-draw'],
    ['libreoffice-math|libreoffice', 'libreoffice-math|libreoffice-math'],
    ['libreoffice-base|libreoffice', 'libreoffice-base|libreoffice-base'],
    ['okular|okular', 'org.kde.okular|org.kde.okular'],
    ['konsole|konsole', 'org.kde.konsole|org.kde.konsole'],
    ['kwrite|kwrite', 'org.kde.kwrite|org.kde.kwrite'],
    ['ark|ark', 'org.kde.ark|org.kde.ark'],
    ['gwenview|gwenview', 'org.kde.gwenview|org.kde.gwenview'],
    ['kcalc|kcalc', 'org.kde.kcalc|org.kde.kcalc'],
];

// The key first, then the other keys of its application, or just the key when it is in no group. [] for no key.
function equivalentKeys(key) {
    if (key === null || key === undefined) return [];
    const group = KEY_GROUPS.find(g => g.includes(key));
    return group ? [key].concat(group.filter(k => k !== key)) : [key];
}

// Learned mapping: the entries that the same application (its desktop file id) saved as the other kind of client, 'wayland' for
// a native Wayland window and 'x11' for an X11 or XWayland window. Used only when no entry has the window's own key or an alias.
// An entry with no client was saved before the field existed, by an X11 window. A window and entries of the same kind of client
// never match here, so a session with X11 windows only (an X11 desktop) is never affected.
function learnedCandidates(entries, appId, client) {
    if (typeof appId !== 'string' || appId === '') return [];
    return entries.filter(e => e.appId === appId && (e.client || 'x11') !== client);
}

// The role is left out on purpose: some applications put a per-launch value in it (Xed uses
// xed-window-<timestamp>-<pid>-..., gnome-terminal a UUID), so a key that included it would never
// match the next launch. The role is still stored on each entry, for information only.
function windowKey(info) {
    const cls = norm(info.wmClass);
    if (cls === '') return null;
    return [cls, norm(info.instance)].join('|');
}

// Brave and Chrome give their pop-up windows the role 'pop-up' and the class and instance of the normal windows,
// so a pop-up would take over a normal window's saved place. Pop-ups are never remembered or restored.
const POPUP_ROLE = 'pop-up';

function isEligible(info, settings) {
    if (windowKey(info) === null) return false;
    if (info.role === POPUP_ROLE) return false;
    const typeOk = info.type === 'normal' || (info.type === 'dialog' && !!settings.includeDialogs);
    if (!typeOk) return false;
    const cls = norm(info.wmClass);
    return !(settings.excludedApps || []).some(p => {
        const pattern = norm(p);
        return pattern !== '' && cls.indexOf(pattern) !== -1;
    });
}

// ctx.role, when given, makes a free candidate saved with the same role win over the others. A role that changes
// on every launch (xed, gnome-terminal) never matches, so those windows fall through to the steps after it.
// The last step prefers a candidate that is not minimized over a minimized one, so that when an application had two
// windows saved, one of them opens visible; the first (newest) of the candidates left is returned. The role and the
// exact title outrank that preference. ctx.minimizedMatters === false turns the preference off (the remember-minimized
// switch is off: a saved minimized state is then no reason to pass over an entry); a call that omits it keeps it on.
// Pop-ups ('pop-up') are not eligible and never get here.
// ctx.type, when given ('normal' or 'dialog'), keeps only the entries saved for that kind of window, because a dialog
// and the main window of an application share their key. An entry saved before the type was recorded counts as normal.
function pickEntry(candidates, ctx) {
    let free = (candidates || []).filter(e => !ctx.claimed.has(e.id) &&
        (ctx.type === undefined || (e.type || 'normal') === ctx.type));
    if (free.length === 0) return null;
    if (typeof ctx.role === 'string') {
        const sameRole = free.filter(e => e.role === ctx.role);
        if (sameRole.length > 0) free = sameRole;
    }
    if (ctx.matchByTitle) {
        const title = norm(ctx.title);
        if (title !== '') {
            const exact = free.find(e => norm(e.title) === title);
            if (exact) return exact;
        }
    }
    if (ctx.minimizedMatters !== false) {
        const notMinimized = free.filter(e => e.minimized !== true);
        if (notMinimized.length > 0) free = notMinimized;
    }
    return free[0];
}
