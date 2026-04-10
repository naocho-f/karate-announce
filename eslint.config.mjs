import nextConfig from "eslint-config-next";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";

const eslintConfig = [
  ...nextConfig,
  // TypeScript ルール
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { "@typescript-eslint": tsPlugin },
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: "./tsconfig.json" },
    },
    rules: {
      // --- 修正完了後に error に昇格 ---
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // --- 修正完了後に error に昇格 ---
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
  // React / Next.js ルール調整
  {
    rules: {
      // --- 修正完了後に error に昇格 ---
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "@next/next/no-img-element": "warn",
      // console.log 禁止（error/warn は許可）
      "no-console": ["error", { allow: ["error", "warn"] }],
      // exhaustive-deps は eslint-config-next で既に warn
    },
  },
  // import ルール
  {
    rules: {
      "import/no-cycle": "warn",
      "import/order": [
        "warn",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
        },
      ],
      "import/newline-after-import": "warn",
    },
  },
  // Prettier との競合回避（末尾に配置）
  prettierConfig,
  // 除外
  {
    ignores: ["node_modules/", ".next/", "out/", "public/", "coverage/"],
  },
];

export default eslintConfig;
