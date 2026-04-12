import nextConfig from "eslint-config-next";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import pluginSecurity from "eslint-plugin-security";
import noUnsanitized from "eslint-plugin-no-unsanitized";
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
      // 関数の行数制限
      "max-lines-per-function": ["warn", { max: 100, skipBlankLines: true, skipComments: true }],
      // ファイルの行数制限（現在の最大を超えるファイルの増加を防止）
      "max-lines": ["warn", { max: 1600, skipBlankLines: true, skipComments: true }],
      // 循環複雑度
      complexity: ["warn", 15],
      // ネストの深さ
      "max-depth": ["warn", 4],
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
  // API route で anon client 使用禁止
  {
    files: ["app/api/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase",
              message: "API route では supabaseAdmin (@/lib/supabase-admin) を使用してください",
            },
          ],
        },
      ],
    },
  },
  // セキュリティプラグイン
  pluginSecurity.configs.recommended,
  noUnsanitized.configs.recommended,
  {
    rules: {
      // eslint-plugin-security: recommended は warn なので error に昇格
      "security/detect-buffer-noassert": "error",
      "security/detect-child-process": "error",
      "security/detect-disable-mustache-escape": "error",
      "security/detect-eval-with-expression": "error",
      "security/detect-new-buffer": "error",
      "security/detect-no-csrf-before-method-override": "error",
      "security/detect-non-literal-fs-filename": "error",
      "security/detect-non-literal-regexp": "error",
      "security/detect-non-literal-require": "error",
      "security/detect-possible-timing-attacks": "error",
      "security/detect-pseudoRandomBytes": "error",
      "security/detect-unsafe-regex": "error",
      "security/detect-bidi-characters": "error",
      // detect-object-injection: off
      // 理由: Record<string,T>の動的キーアクセスが23箇所あり全て安全。
      // このルールはデータフロー追跡せず構文のみで判定するため、
      // 安全なパターンを区別不可能。eslint-community/eslint-plugin-security#21 参照。
      // eslint.config.mjs でのルール設定であり、ソースコード内の eslint-disable ではない。
      "security/detect-object-injection": "off",
      // eslint-plugin-no-unsanitized: recommended が error でない場合に備え明示
      "no-unsanitized/method": "error",
      "no-unsanitized/property": "error",
      // react: dangerouslySetInnerHTML 予防（現在使用0件、追加パッケージ不要）
      "react/no-danger": "error",
    },
  },
  // テストファイル・カスタムフックの関数行数制限・セキュリティルールを緩和
  {
    files: ["__tests__/**/*.ts", "__tests__/**/*.tsx", "**/_use-*.ts", "**/_use-*.tsx"],
    rules: {
      "max-lines-per-function": "off",
      "max-lines": "off",
      "security/detect-non-literal-fs-filename": "off",
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
