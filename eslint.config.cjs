const globals = require("globals");

/** @type {import("eslint").Linter.FlatConfig[]} */
module.exports = [
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
    rules: {
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "no-console": "warn"
    },
    ignores: [
      "node_modules/**",
      ".vercel/**",
      "coverage/**"
    ]
  }
];
