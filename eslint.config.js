import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**", "**/*.d.ts"],
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [eslint.configs.recommended],
  },
  {
    files: ["**/*.ts"],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-console": "error",
      "no-warning-comments": ["error", { terms: ["TODO", "FIXME"], location: "start" }],
      "padding-line-between-statements": [
        "error",
        {
          blankLine: "always",
          prev: "const",
          next: ["if", "switch", "for", "while", "try", "return"],
        },
        {
          blankLine: "always",
          prev: "let",
          next: ["if", "switch", "for", "while", "try", "return"],
        },
        {
          blankLine: "always",
          prev: "expression",
          next: ["if", "switch", "for", "while", "try"],
        },
        { blankLine: "always", prev: ["if", "switch", "for", "while", "try"], next: "*" },
        { blankLine: "always", prev: "*", next: "return" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description", "ts-ignore": true },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
  prettier,
);
