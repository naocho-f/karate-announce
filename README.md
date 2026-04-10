# karate-announce

武道大会の試合管理・AI アナウンス・リアルタイム速報システム。
参加受付から対戦表作成、コート進行、結果配信までを一貫して管理する。

## 技術スタック

| カテゴリ       | 技術                                 |
| -------------- | ------------------------------------ |
| フレームワーク | Next.js 16 (App Router) + TypeScript |
| スタイリング   | Tailwind CSS 4                       |
| データベース   | Supabase (PostgreSQL)                |
| AI 音声        | OpenAI TTS (tts-1)                   |
| メール送信     | Resend                               |
| テスト         | Vitest / Playwright                  |
| デプロイ       | Vercel                               |

## セットアップ

```bash
git clone <repository-url>
cd karate-announce
npm install
```

`.env.local` を作成し、以下の環境変数を設定する:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
ADMIN_USERNAME=
ADMIN_PASSWORD=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
NEXT_PUBLIC_APP_MODE=
```

開発サーバーを起動:

```bash
npm run dev
```

http://localhost:3000 でアクセスできる。

## 開発コマンド

| コマンド              | 用途                                   |
| --------------------- | -------------------------------------- |
| `npm run dev`         | 開発サーバー起動                       |
| `npm run build`       | プロダクションビルド（型チェック含む） |
| `npx vitest run`      | 全テスト実行（unit + API）             |
| `npm run test:unit`   | ユニットテストのみ                     |
| `npm run test:api`    | API テストのみ                         |
| `npx playwright test` | E2E テスト                             |
| `npx tsc --noEmit`    | 型チェックのみ                         |

## ディレクトリ構成

```
app/          Next.js App Router（ページ・API ルート・レイアウト）
lib/          共通ロジック（DB クライアント、ユーティリティ、型定義）
components/   共通 UI コンポーネント
docs/         機能別の詳細仕様書
__tests__/    テスト（api/ unit/ e2e/）
scripts/      Git hook 等の開発支援スクリプト
public/       静的ファイル
supabase/     Supabase 関連設定
```

## デプロイ

Vercel と GitHub の連携による自動デプロイ。
`main` ブランチへの push で本番環境（karate.naocho.net）に自動反映される。
