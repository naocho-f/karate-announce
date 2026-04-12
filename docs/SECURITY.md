# セキュリティチェック体制

> **最終更新**: 2026-04-12
> **対象プロジェクト**: karate-announce

---

## 1. ツール一覧

| ツール                       | 目的                                                | 実行場所                        |
| ---------------------------- | --------------------------------------------------- | ------------------------------- |
| eslint-plugin-security       | eval/child_process/非リテラルfs等の危険パターン検出 | pre-commit + CI                 |
| eslint-plugin-no-unsanitized | innerHTML/insertAdjacentHTML等のXSSリスク検出       | pre-commit + CI                 |
| react/no-danger              | dangerouslySetInnerHTML使用禁止                     | pre-commit + CI                 |
| Semgrep                      | OWASP Top 10/secrets等のセキュリティスキャン        | pre-commit(staged) + CI(全体)   |
| gitleaks                     | シークレット漏洩検出                                | pre-commit(staged) + CI(全履歴) |
| osv-scanner                  | 依存パッケージの脆弱性検出                          | CI + 手動                       |
| npm audit                    | npm依存の脆弱性検出                                 | CI                              |
| CodeQL                       | GitHubによる高度なセマンティック分析                | CI                              |
| Dependabot                   | 依存パッケージの自動更新PR                          | GitHub                          |

---

## 2. ローカルセットアップ

初回のみ:

```bash
brew install semgrep gitleaks osv-scanner
```

`npm install` で husky が自動セットアップされ、pre-commit hook が有効になります。

---

## 3. 実行コマンド

| コマンド                 | 内容                                           |
| ------------------------ | ---------------------------------------------- |
| `npm run security:check` | 全チェック（ESLint + tsc + 外部ツール）        |
| `npm run security:lint`  | ESLint + tsc のみ                              |
| `npm run security:scan`  | 外部ツール（semgrep + gitleaks + osv-scanner） |

---

## 4. false positive 抑制方法

### ESLint

eslint.config.mjs でルール設定を変更する。**ソースコード内の eslint-disable は禁止**（CLAUDE.md ルール）。

### Semgrep

ソースコード内に `// nosemgrep: <rule-id>` コメントを追加する。nosemgrep は semgrep 固有の抑制機構であり、eslint-disable とは別ツール。

### gitleaks

`.gitleaks.toml` の allowlist にパス or 正規表現パターンを追加する。

---

## 5. 既知の制限

- **detect-object-injection は globally off**: 23箇所の安全な動的キーアクセス（DB結果・ローカル変数のRecord<string,T>）が構文のみの判定では区別不可能なため。eslint-community/eslint-plugin-security#21 参照
- **pre-commit の lint-staged は .mjs ファイル非対象**: eslint.config.mjs 等の設定ファイルは CI でカバー
- **semgrep は初回実行時にルールのダウンロードが必要**: キャッシュ後はオフライン実行可能
