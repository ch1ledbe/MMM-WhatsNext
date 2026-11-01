import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import globals from "globals";

export default [
	{
		ignores: ["node_modules/**", "data/**", "dev/data/**"]
	},
	js.configs.recommended,
	{
		files: ["**/*.js"],
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "commonjs",
			globals: {
				...globals.browser,
				...globals.node
			}
		},
		plugins: { "@stylistic": stylistic },
		rules: {
			"@stylistic/indent": ["error", "tab"],
			"@stylistic/quotes": ["error", "double", { avoidEscape: true }],
			"@stylistic/semi": ["error", "always"],
			"@stylistic/comma-dangle": ["error", "never"],
			"@stylistic/space-before-function-paren": ["error", "always"],
			"@stylistic/brace-style": ["error", "1tbs", { allowSingleLine: true }],
			"@stylistic/no-trailing-spaces": "error",
			"@stylistic/eol-last": "error",
			"no-unused-vars": ["error", { caughtErrors: "none" }],
			"prefer-const": "error",
			eqeqeq: "error"
		}
	},
	{
		files: ["MMM-WhatsNext.js", "public/**/*.js"],
		languageOptions: {
			sourceType: "script",
			globals: {
				Module: "readonly",
				Log: "readonly",
				WhatsNextCore: "readonly",
				config: "readonly"
			}
		}
	},
	{
		files: ["**/*.mjs"],
		languageOptions: { sourceType: "module" }
	}
];
