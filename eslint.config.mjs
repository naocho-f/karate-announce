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
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", disallowTypeAnnotations: false },
      ],
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
      // 関数の行数制限（500行超の巨大関数をブロック。段階的に閾値を下げる）
      "max-lines-per-function": ["warn", { max: 500, skipBlankLines: true, skipComments: true }],
      // ファイルの行数制限（現在の最大を超えるファイルの増加を防止）
      "max-lines": ["warn", { max: 1600, skipBlankLines: true, skipComments: true }],
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
  // テストファイル・カスタムフックの関数行数制限を緩和
  {
    files: ["__tests__/**/*.ts", "__tests__/**/*.tsx", "**/_use-*.ts", "**/_use-*.tsx"],
    rules: {
      "max-lines-per-function": "off",
      "max-lines": "off",
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
