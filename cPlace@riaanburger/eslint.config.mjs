import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
    { ignores: ["build/", "node_modules/"] },
    js.configs.recommended,
    tseslint.configs.recommended,
    {
        // One rule that reads types across files: a cast that changes
        // nothing, as newer typings can leave behind. It needs the program's
        // type information, which costs the lint a fraction of a second.
        files: ["src/**/*.ts", "tests/**/*.ts"],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            "@typescript-eslint/no-unnecessary-type-assertion": "warn",
        },
    },
    {
        files: ["src/**/*.ts"],
        rules: {
            // Readability limits, reported rather than gating. max-lines
            // settled at 250 once the first version showed most files
            // stopping under 175; the function limits stand as first set.
            complexity: ["warn", 10],
            "max-depth": ["warn", 3],
            "max-lines": ["warn", 250],
            "max-lines-per-function": ["warn", 40],
            "max-params": ["warn", 4],
            "max-statements": ["warn", 20],
            // Every export is named, so every use is greppable.
            "no-restricted-exports": [
                "warn",
                {
                    restrictDefaultExports: {
                        direct: true,
                        named: true,
                        defaultFrom: true,
                        namedFrom: true,
                        namespaceFrom: true,
                    },
                },
            ],
        },
    },
    {
        // Words reach the user through _() or ngettext(), so a translator
        // can reach them. Each selector is a place the chooser shows text
        // from, given a string with a letter in it: a label, a heading, a
        // row, a hint, a page's or a variable's name, a caption's parts.
        // The development handle shows nothing to users.
        files: ["src/**/*.ts"],
        ignores: ["src/dev-handle.ts"],
        rules: {
            "no-restricted-syntax": [
                "error",
                ...[
                    "Property[key.name=/^(text|label|accessible_name|name|note|place|windows)$/] > %",
                    "PropertyDefinition[key.name='name'] > %",
                    "CallExpression[callee.name=/^(heading|listed)$/] > %",
                    "CallExpression[callee.property.name=/^(set_text|set_label|addTickRow|tickBox)$/] > %:first-child",
                    "CallExpression[callee.property.name='addButton'] > %:nth-child(2)",
                    "NewExpression[callee.property.name='CheckBox'] > %:first-child",
                    "MethodDefinition[key.name='hint'] ReturnStatement > %",
                    "MethodDefinition[key.name='hint'] ReturnStatement > BinaryExpression > %",
                ].flatMap((place) =>
                    [
                        "Literal[value=/[A-Za-z]/]",
                        "TemplateLiteral:has(TemplateElement[value.raw=/[A-Za-z]/])",
                    ].map((text) => ({
                        selector: place.replace("%", text),
                        message:
                            "Words the user reads go through _() or ngettext(), from src/i18n.ts.",
                    })),
                ),
            ],
        },
    },
);
