const $ = imports.extension.__init__;
const _ = $._;

const PROVIDER_NAME = "Transltr";
const PROVIDER_LIMIT = 4200;
const PROVIDER_URL = "http://transltr.org/api/translate?text=%s&to=%s%s";
const PROVIDER_HEADERS = {
    "user-agent": "Mozilla/5.0",
    "Referer": "http://transltr.org/",
    "Accept": "application/json",
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
            detectedLang;

        try {
            json = JSON.parse(response_data);

            if (this._current_source_lang === "auto")
                detectedLang = json.from;
            else
                detectedLang = this._current_source_lang;

            result = {
                error: false,
                detectedLang: detectedLang,
                message: json.translationText
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
