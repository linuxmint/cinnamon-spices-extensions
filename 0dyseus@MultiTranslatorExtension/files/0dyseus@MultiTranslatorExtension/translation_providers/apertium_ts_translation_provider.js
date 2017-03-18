const $ = imports.extension.__init__;
const _ = $._;
const Lang = imports.lang;

const PROVIDER_NAME = "Apertium.TS";
const PROVIDER_LIMIT = 1400;
const PROVIDER_MAX_QUERIES = 3;
const PROVIDER_URL = "";
const PROVIDER_HEADERS = null;
const SENTENCES_REGEXP = /\n|([^\r\n.!?]+([.!?]+|\n|$))/gim;

function Translator(extension_object) {
    this._init(extension_object);
}

Translator.prototype = {
    __proto__: $.TranslationProviderBase.prototype,

    _init: function(extension_object) {
        $.TranslationProviderBase.prototype._init.call(
            this,
            PROVIDER_NAME,
            PROVIDER_LIMIT * PROVIDER_MAX_QUERIES,
            PROVIDER_URL,
            PROVIDER_HEADERS
        );
        this._results = [];
        this._extension_object = extension_object;
    },

    _split_text: function(text) {
        let sentences = text.match(SENTENCES_REGEXP);

        if (sentences === null)
            return false;

        let temp = "";
        let result = [];

        for (let i = 0; i < sentences.length; i++) {
            let sentence = sentences[i];

            if ($.is_blank(sentence)) {
                temp += "\n";
                continue;
            }

            if (sentence.length + temp.length > PROVIDER_LIMIT) {
                result.push(temp);
                temp = sentence;
            } else {
                temp += sentence;
                if (i == (sentences.length - 1))
                    result.push(temp);
            }
        }

        return result;
    },

    get_pairs: function(language) { // jshint ignore:line
        let temp = {};

        for (let key in $.LANGUAGES_LIST) {
            if (key === "auto")
                continue;

            temp[key] = $.LANGUAGES_LIST[key];
        }

        return temp;
    },

    parse_response: function(data) {
        let stuff = {
            "\x1B[1m": "<b>",
            "\x1B[22m": "</b>",
            "\x1B[4m": "<u>",
            "\x1B[24m": "</u>"
        };
        try {
            for (let hex in stuff) {
                data = $.replaceAll(data, hex, stuff[hex]);
            }
            return data;
        } catch (aErr) {
            return "%s: ".format(_("Error while parsing data")) + aErr;
        }
    },

    do_translation: function(source_lang, target_lang, text, callback) {
        var proxy = false;
        if ($.execSync("gsettings get org.gnome.system.proxy mode") == "manual") {
            proxy = $.execSync("gsettings get org.gnome.system.proxy.http host").slice(1, -1);
            proxy += ":";
            proxy += $.execSync("gsettings get org.gnome.system.proxy.http port");
        }

        let command = ["trans"];
        let options = [
            "-e", "apertium",
            "--show-languages", (source_lang === "auto" ? "y" : "n"),
            // If using these arguments with apertium, it gives blank translations.
            "--show-original", "n",
            // "--show-prompt-message", "n",
            // "--no-bidi",
        ];
        let subjects = [
            (source_lang === "auto" ? "" : source_lang) + ":" + target_lang,
            text
        ];

        if (proxy) {
            options.push("-x");
            options.push(proxy);
        }

        $.exec(command.concat(options).concat(subjects), Lang.bind(this, function(data) {
            if (!data)
                data = _("Error while translating, check your internet connection");
            else
                data = this.parse_response(data);

            callback({
                error: false,
                message: data
            });
        }));
    },

    translate: function(source_lang, target_lang, text, callback) {
        if ($.is_blank(text)) {
            callback(false);
            return;
        }

        let splitted = this._split_text(text);

        if (!splitted || splitted.length === 1) {
            if (splitted)
                text = splitted[0];

            this.do_translation(source_lang, target_lang, text, callback);
        } else {
            this._results = [];
            let _this = this;
            $.asyncLoop({
                length: splitted.length,
                functionToLoop: Lang.bind(this, function(loop, i) {
                    let text = splitted[i];
                    let data = _this.do_translation(source_lang, target_lang, text, function() {
                        this._results.push(data);
                        loop();
                    });
                }),
                callback: Lang.bind(this, function() {
                    callback(this._results.join(" "));
                })
            });
        }
    },
};
