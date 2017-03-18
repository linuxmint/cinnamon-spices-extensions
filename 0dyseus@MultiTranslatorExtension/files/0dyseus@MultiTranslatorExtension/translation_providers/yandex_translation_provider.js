const $ = imports.extension.__init__;
const _ = $._;
const Main = imports.ui.main;

const PROVIDER_NAME = "Yandex.Translate";
const PROVIDER_LIMIT = 9800;
const PROVIDER_URL = "https://translate.yandex.net/api/v1.5/tr.json/translate?key=%s&lang=%s&text=%s&format=plain&options=1";
const PROVIDER_HEADERS = {
    "user-agent": "Mozilla/5.0",
    "Referer": "https://translate.yandex.net/",
    "Content-Type": "application/x-www-form-urlencoded"
};

const LANGUAGE_PAIRS = [
    "auto-az",
    "auto-be",
    "auto-bg",
    "auto-ca",
    "auto-cs",
    "auto-da",
    "auto-de",
    "auto-el",
    "auto-en",
    "auto-es",
    "auto-et",
    "auto-fi",
    "auto-fr",
    "auto-hr",
    "auto-hu",
    "auto-hy",
    "auto-it",
    "auto-lt",
    "auto-lv",
    "auto-mk",
    "auto-nl",
    "auto-no",
    "auto-pl",
    "auto-pt",
    "auto-ro",
    "auto-sk",
    "auto-sl",
    "auto-sq",
    "auto-sr",
    "auto-sv",
    "auto-tr",
    "auto-uk",
    "az-ru",
    "be-bg",
    "be-cs",
    "be-de",
    "be-en",
    "be-es",
    "be-fr",
    "be-it",
    "be-pl",
    "be-ro",
    "be-ru",
    "be-sr",
    "be-tr",
    "bg-be",
    "bg-ru",
    "bg-uk",
    "ca-en",
    "ca-ru",
    "cs-be",
    "cs-en",
    "cs-ru",
    "cs-uk",
    "da-en",
    "da-ru",
    "de-be",
    "de-en",
    "de-es",
    "de-fr",
    "de-it",
    "de-ru",
    "de-tr",
    "de-uk",
    "el-en",
    "el-ru",
    "en-be",
    "en-ca",
    "en-cs",
    "en-da",
    "en-de",
    "en-el",
    "en-es",
    "en-et",
    "en-fi",
    "en-fr",
    "en-hu",
    "en-it",
    "en-lt",
    "en-lv",
    "en-mk",
    "en-nl",
    "en-no",
    "en-pt",
    "en-ru",
    "en-sk",
    "en-sl",
    "en-sq",
    "en-sv",
    "en-tr",
    "en-uk",
    "es-be",
    "es-de",
    "es-en",
    "es-ru",
    "es-uk",
    "et-en",
    "et-ru",
    "fi-en",
    "fi-ru",
    "fr-be",
    "fr-de",
    "fr-en",
    "fr-ru",
    "fr-uk",
    "hr-ru",
    "hu-en",
    "hu-ru",
    "hy-ru",
    "it-be",
    "it-de",
    "it-en",
    "it-ru",
    "it-uk",
    "lt-en",
    "lt-ru",
    "lv-en",
    "lv-ru",
    "mk-en",
    "mk-ru",
    "nl-en",
    "nl-ru",
    "no-en",
    "no-ru",
    "pl-be",
    "pl-ru",
    "pl-uk",
    "pt-en",
    "pt-ru",
    "ro-be",
    "ro-ru",
    "ro-uk",
    "ru-az",
    "ru-be",
    "ru-bg",
    "ru-ca",
    "ru-cs",
    "ru-da",
    "ru-de",
    "ru-el",
    "ru-en",
    "ru-es",
    "ru-et",
    "ru-fi",
    "ru-fr",
    "ru-hr",
    "ru-hu",
    "ru-hy",
    "ru-it",
    "ru-lt",
    "ru-lv",
    "ru-mk",
    "ru-nl",
    "ru-no",
    "ru-pl",
    "ru-pt",
    "ru-ro",
    "ru-sk",
    "ru-sl",
    "ru-sq",
    "ru-sr",
    "ru-sv",
    "ru-tr",
    "ru-uk",
    "sk-en",
    "sk-ru",
    "sl-en",
    "sl-ru",
    "sq-en",
    "sq-ru",
    "sr-be",
    "sr-ru",
    "sr-uk",
    "sv-en",
    "sv-ru",
    "tr-be",
    "tr-de",
    "tr-en",
    "tr-ru",
    "tr-uk",
    "uk-bg",
    "uk-cs",
    "uk-de",
    "uk-en",
    "uk-es",
    "uk-fr",
    "uk-it",
    "uk-pl",
    "uk-ro",
    "uk-ru",
    "uk-sr",
    "uk-tr"
];

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

    get_languages: function() {
        let temp = {};

        try {
            let i = 0,
                iLen = LANGUAGE_PAIRS.length;
            for (; i < iLen; i++) {
                let [lang_code, target_lang_code] = LANGUAGE_PAIRS[i].split("-"); // jshint ignore:line
                let lang_name = this.get_language_name(lang_code);

                if (temp[lang_code])
                    continue;

                temp[lang_code] = lang_name;
            }
        } finally {
            return temp;
        }
    },

    get_pairs: function(language) {
        let temp = {};

        try {
            let i = 0,
                iLen = LANGUAGE_PAIRS.length;
            for (; i < iLen; i++) {
                let [source_lang_code, target_lang_code] = LANGUAGE_PAIRS[i].split("-");

                if (source_lang_code.toLowerCase() == language.toLowerCase())
                    temp[target_lang_code] = $.LANGUAGES_LIST[target_lang_code];
            }
        } finally {
            return temp;
        }
    },

    parse_response: function(response_data) {
        let json;

        try {
            json = JSON.parse(response_data);
        } catch (aErr) {
            global.logError("%s %s: %s".format(
                this.name,
                _("Error"),
                JSON.stringify(aErr, null, "\t")
            ));
            return {
                error: true,
                message: _("Can't translate text, please try later.")
            };
        }

        let result = {};

        if (json.code == 200) {
            result = {
                error: false,
                message: $.escape_html(json.text.join(" "))
            };
        } else {
            let errorMessage;

            switch (json.code) {
                case 401:
                    errorMessage = _("API key is invalid");
                    break;
                case 402:
                    errorMessage = _("Blocked API key");
                    break;
                case 404:
                    errorMessage = _("Exceeded the daily limit on the amount of translated text");
                    break;
                case 413:
                    errorMessage = _("Exceeded the maximum text size");
                    break;
                case 422:
                    errorMessage = _("The text cannot be translated");
                    break;
                case 501:
                    errorMessage = _("The specified translation direction is not supported");
            }

            if (json.code === 401 || json.code === 402)
                global.logError("API key: " + this._APIKey);

            result = {
                error: true,
                message: errorMessage
            };
        }

        return result;
    },

    get YandexAPIKey() {
        let APIKeys = this._extension_object.settings.get_string($.P.YANDEX_API_KEYS).split("\n")
            .filter(function(aKey) { // Filter possible empty elements.
                if (aKey !== "")
                    return true;
                return false;
            });

        if (APIKeys.length === 0) {
            Main.criticalNotify(_("Multi Translator"), [
                _("No Yandex API keys were found!!!"),
                _("Check this extension help file for instructions.")
            ].join("\n"));
            return false;
        }

        this._APIKey = APIKeys[Math.floor(Math.random() * APIKeys.length - 1) + 1];

        return this._APIKey;
    }
};
