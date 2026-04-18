# テナント追加手順書

> **ステータス**: 運用中
> **最終更新**: 2026-04-18
> **対象プロジェクト**: karate-announce
> **対象範囲**: 新テナント（団体）の追加手順

---

## 1. 概要

本システムは方式A（テナントごとに別Vercelプロジェクト + 別Supabaseプロジェクト）でマルチテナント運用する。
同一コードベースから、環境変数の差し替えだけでテナントを切り替える。

ドメイン体系: `{テナント名}.budo-taikai.com`（Cloudflare DNS管理）

---

## 2. テナント追加時に変更が必要な環境変数

Vercelの Environment Variables に設定する。

| 環境変数                        | 説明                                     | 例（柔空会テナント）                       |
| ------------------------------- | ---------------------------------------- | ------------------------------------------ |
| `NEXT_PUBLIC_APP_DOMAIN`        | サイトドメイン                           | `ju-ku.budo-taikai.com`                    |
| `NEXT_PUBLIC_ORG_NAME`          | 団体名（タイトル・ログイン画面等に表示） | `柔空会`                                   |
| `NEXT_PUBLIC_SUPABASE_URL`      | テナント別Supabase URL                   | `https://xxx.supabase.co`                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase匿名キー                         | テナントごとに異なる                       |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabaseサービスロールキー               | テナントごとに異なる                       |
| `ADMIN_USERNAME`                | 管理画面ログインユーザー名               | テナントごとに設定                         |
| `ADMIN_PASSWORD`                | 管理画面ログインパスワード               | テナントごとに設定                         |
| `OPENAI_API_KEY`                | TTS用APIキー                             | 共通でも可                                 |
| `RESEND_API_KEY`                | メール送信APIキー                        | 共通でも可                                 |
| `RESEND_FROM_EMAIL`             | メール送信元                             | `参加受付 <noreply@ju-ku.budo-taikai.com>` |
| `NEXT_PUBLIC_APP_MODE`          | アプリモード                             | `production`                               |

---

## 3. 手順

### Step 1: Supabaseプロジェクト作成

1. Supabaseダッシュボードで新プロジェクトを作成
2. マイグレーションを実行: `supabase db push --linked`
3. URL・ANON_KEY・SERVICE_ROLE_KEY を控える

### Step 2: Vercelプロジェクト作成

1. Vercelダッシュボードで「Add New」→「Project」
2. 同一GitHubリポジトリを選択（同じコードベース）
3. Environment Variables に上記の全環境変数を設定
4. デプロイ

### Step 3: ドメイン設定

1. **Vercel**: Settings → Domains で `{テナント名}.budo-taikai.com` を追加
2. **Cloudflare**: DNS Records で CNAME レコードを追加
   - Type: `CNAME`
   - Name: `{テナント名}`
   - Target: Vercelが指定する値（プロジェクト固有）
   - Proxy status: **DNS only（灰色雲）**
3. SSL証明書がVercelで自動発行されるのを確認

### Step 4: アイコン差し替え（任意）

テナント固有のファビコン・PWAアイコンが必要な場合：

- `app/icon.png` — ファビコン
- `public/icon-192.png` — PWAアイコン（192x192）
- `public/icon-512.png` — PWAアイコン（512x512）

※ 同一リポジトリから複数テナントをデプロイする場合、アイコンはコードに含まれるため共通になる。テナント固有アイコンが必要な場合はブランチ分離またはビルド時差し替えの仕組みが必要。

### Step 5: 動作確認

- `https://{テナント名}.budo-taikai.com/` にアクセスしてサイトタイトルが正しいか確認
- 管理画面にログインできるか確認
- メール送信テスト
