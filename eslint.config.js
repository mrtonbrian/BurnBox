import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/", "public/assets/", ".wrangler/", "dist/", "**/*.config.js"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["src/frontend/**/*.ts"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ["src/worker/**/*.ts", "src/shared/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      globals: { ...globals.serviceworker, ...globals.node },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
];
