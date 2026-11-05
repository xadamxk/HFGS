// @ts-check
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      "dist/",
      "coverage/",
      "node_modules/",
      ".chrome-for-testing/",
      ".browser-profile/",
      // The MV2 extension being replaced; removed once the rewrite reaches parity
      "js/",
      "fixtures/",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions },
    },
  },
  {
    files: [
      "config/**/*.ts",
      "scripts/**/*.js",
      "*.{js,mjs,ts}",
      "**/*.test.ts",
    ],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
  },
  {
    // Node scripts (webpack config, icon script, jest config) use CommonJS requires
    files: ["config/**/*.ts", "scripts/**/*.js", "jest.config.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // Runs inside HF's page (pasted into DevTools or evaluated by probe.js)
    files: ["scripts/phase0-probe.js"],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
  // Formatting is Prettier's job; turn off rules that conflict with it
  prettier
);
