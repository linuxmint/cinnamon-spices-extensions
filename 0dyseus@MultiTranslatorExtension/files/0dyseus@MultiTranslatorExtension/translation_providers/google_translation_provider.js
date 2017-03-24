const $ = imports.extension.__init__;
const _ = $._;

const PROVIDER_NAME = "Google.Translate";
const PROVIDER_LIMIT = 4200;
const PROVIDER_URL = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=%s&tl=%s&dt=t&q=%s";
const PROVIDER_HEADERS = {
    "user-agent": "Mozilla/5.0",
    "Referer": "https://translate.google.com/",
    "Content-Type": "application/x-www-form-urlencoded"
};

function Translator(extension_object) {
    this._init(extension_object);
}

Translator.prototype = {
    __proto__: $.TranslationProviderBase.prototype,

    _init: function(extension_object) {
        $.TranslationProviderBase.prototype._init.call(
            this,
            PROVIDER_NAME,
            PROVIDER_LIMIT,
            PROVIDER_URL,
            PROVIDER_HEADERS
        );
        this._extension_object = extension_object;
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

    parse_response: function(response_data) {
        let result = {},
            json,
            transText,
            detectedLang;

        try {
            json = JSON.parse(response_data.replace(/,+/g, ","));

            if (json[0].length > 1) {
                let i = 0,
                    iLen = json[0].length;
                for (; i < iLen; i++) {
                    transText += (json[0][i][0]).trim() + " ";
                }
            } else {
                transText = json[0][0][0];
            }

            if (this._current_source_lang === "auto")
                detectedLang = result[1] ? result[1] : "?";
            else
                detectedLang = this._current_source_lang;

            result = {
                error: false,
                detectedLang: detectedLang,
                message: transText
            };
        } catch (aErr) {
            global.logError("%s %s: %s".format(
                this.name,
                _("Error"),
                JSON.stringify(aErr, null, "\t")
            ));
            result = {
                error: true,
                message: _("Can't translate text, please try later.")
            };
        }

        return result;
    }
};
