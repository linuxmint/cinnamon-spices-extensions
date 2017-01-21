const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const ModalDialog = imports.ui.modalDialog;

function injectToFunction(aParent, aName, aFunc) {
    let origin = aParent[aName];
    aParent[aName] = function() {
        let ret;
        ret = origin.apply(this, arguments);
        if (ret === undefined)
            ret = aFunc.apply(this, arguments);
        return ret;
    };
    return origin;
}

function removeInjection(aStorage, aInjection, aName) {
    if (aInjection[aName] === undefined)
        delete aStorage[aName];
    else
        aStorage[aName] = aInjection[aName];
}

function ConfirmationDialog() {
    this._init.apply(this, arguments);
}

ConfirmationDialog.prototype = {
    __proto__: ModalDialog.ModalDialog.prototype,

    // Passing the OK and Cancel buttons labels as arguments to avoid initializing
    // the "translation functions" inside this file (extensionModules.js).
    _init: function(aCallback, aDialogLabel, aDialogMessage, aOKBtnLbl, aCancelBtnLbl) {
        ModalDialog.ModalDialog.prototype._init.call(this, {
            styleClass: null
        });

        let mainContentBox = new St.BoxLayout({
            style_class: 'polkit-dialog-main-layout',
            vertical: false
        });
        this.contentLayout.add(mainContentBox, {
            x_fill: true,
            y_fill: true
        });

        let messageBox = new St.BoxLayout({
            style_class: 'polkit-dialog-message-layout',
            vertical: true
        });
        mainContentBox.add(messageBox, {
            y_align: St.Align.START
        });

        this._subjectLabel = new St.Label({
            style_class: 'polkit-dialog-headline',
            text: aDialogLabel
        });

        messageBox.add(this._subjectLabel, {
            y_fill: false,
            y_align: St.Align.START
        });

        this._descriptionLabel = new St.Label({
            style_class: 'polkit-dialog-description',
            text: aDialogMessage
        });

        messageBox.add(this._descriptionLabel, {
            y_fill: true,
            y_align: St.Align.START
        });

        this.setButtons([{
            label: aCancelBtnLbl,
            action: Lang.bind(this, function() {
                this.close();
            }),
            key: Clutter.Escape
        }, {
            label: aOKBtnLbl,
            action: Lang.bind(this, function() {
                this.close();
                aCallback();
            })
        }]);
    }
};

/**
 * Compares two software version numbers (e.g. "1.7.1" or "1.2b").
 *
 * This function was born in http://stackoverflow.com/a/6832721.
 *
 * @param {string} v1 The first version to be compared.
 * @param {string} v2 The second version to be compared.
 * @param {object} [options] Optional flags that affect comparison behavior:
 * <ul>
 *     <li>
 *         <tt>lexicographical: true</tt> compares each part of the version strings lexicographically instead of
 *         naturally; this allows suffixes such as "b" or "dev" but will cause "1.10" to be considered smaller than
 *         "1.2".
 *     </li>
 *     <li>
 *         <tt>zeroExtend: true</tt> changes the result if one version string has less parts than the other. In
 *         this case the shorter string will be padded with "zero" parts instead of being considered smaller.
 *     </li>
 * </ul>
 * @returns {number|NaN}
 * <ul>
 *    <li>0 if the versions are equal</li>
 *    <li>a negative integer iff v1 < v2</li>
 *    <li>a positive integer iff v1 > v2</li>
 *    <li>NaN if either version string is in the wrong format</li>
 * </ul>
 *
 * @copyright by Jon Papaioannou (["john", "papaioannou"].join(".") + "@gmail.com")
 * @license This function is in the public domain. Do what you want with it, no strings attached.
 */
function versionCompare(v1, v2, options) {
    var lexicographical = options && options.lexicographical,
        zeroExtend = options && options.zeroExtend,
        v1parts = v1.split('.'),
        v2parts = v2.split('.');

    function isValidPart(x) {
        return (lexicographical ? /^\d+[A-Za-z]*$/ : /^\d+$/).test(x);
    }

    if (!v1parts.every(isValidPart) || !v2parts.every(isValidPart)) {
        return NaN;
    }

    if (zeroExtend) {
        while (v1parts.length < v2parts.length) v1parts.push("0");
        while (v2parts.length < v1parts.length) v2parts.push("0");
    }

    if (!lexicographical) {
        v1parts = v1parts.map(Number);
        v2parts = v2parts.map(Number);
    }

    for (var i = 0; i < v1parts.length; ++i) {
        if (v2parts.length == i) {
            return 1;
        }

        if (v1parts[i] == v2parts[i]) {
            continue;
        } else if (v1parts[i] > v2parts[i]) {
            return 1;
        } else {
            return -1;
        }
    }

    if (v1parts.length != v2parts.length) {
        return -1;
    }

    return 0;
}
