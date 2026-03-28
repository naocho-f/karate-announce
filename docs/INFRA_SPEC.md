# インフラ・デプロイ 仕様書

> **ステータス**: ドラフト
> **最終更新**: 2026-03-27
> **対象プロジェクト**: karate-announce
> **対象範囲**: 技術スタック・環境設定・デプロイ・外部サービス・DB構成

---

## 1. 技術スタック

| カテゴリ | 技術 | バージョン |
|---------|------|-----------|
| フレームワーク | Next.js (App Router) | 16.1.6 |
| ランタイム | React | 19.2.3 |
| 言語 | TypeScript (strict mode) | ^5 |
| CSS | Tailwind CSS (CSS-first, v4) | ^4 |
| DB/Auth | Supabase (PostgreSQL) | supabase-js ^2.99.1 |
| メール | Resend | ^6.9.4 |
| TTS | OpenAI TTS-1 | API 直接利用 |
| QRコード | qrcode | ^1.5.4 |
| Markdown | react-markdown + remark-gfm | ^10.1.0 / ^4.0.1 |
| デプロイ | Vercel | 自動（Git push） |

---

## 2. ディレクトリ構成

```
karate-announce/
├── app/                    # Next.js App Router
│   ├── api/                # API ルート（33エンドポイント）
│   │   ├── admin/          # 管理者用（認証必須）
│   │   ├── court/          # コート画面用（認証なし）
│   │   ├── public/         # 公開用（エントリーフォーム）
│   │   └── tts/            # TTS プロキシ
│   ├── admin/              # 管理画面 UI
│   ├── court/              # コート操作画面 UI
│   ├── entry/              # エントリーフォーム UI
│   └── live/               # ライブ表示 UI
├── components/             # 共通コンポーネント
├── lib/                    # ユーティリティ（14ファイル）
├── docs/                   # 仕様書
├── supabase/               # DBマイグレーション
│   └── migrations/         # 12マイグレーションファイル
├── public/                 # 静的アセット
├── CLAUDE.md               # 開発ルール
├── SPEC.md                 # プロジェクト仕様
├── next.config.ts          # Next.js 設定
├── tsconfig.json           # TypeScript 設定
├── postcss.config.mjs      # PostCSS 設定
├── proxy.ts                # 認証ミドルウェア
└── package.json            # 依存関係・スクリプト
```

---

## 3. 環境変数

### 3.1 公開（クライアント安全）
| 変数 | 説明 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名キー（RLS 制限付き） |
| `NEXT_PUBLIC_APP_MODE` | アプリモード。`development`: 不具合報告FAB・テストボタン・仕様書リンク表示。未設定 or `production`: 本番モード |

### 3.2 プライベート（サーバー専用）
| 変数 | 説明 | デフォルト |
|------|------|-----------|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase サービスロールキー（RLS バイパス） | ─ |
| `ADMIN_PASSWORD` | 管理画面パスワード | 未設定時は認証なし |
| `ADMIN_USERNAME` | 管理画面ユーザー名 | `admin` |
| `OPENAI_API_KEY` | OpenAI API キー（TTS 用） | ─ |
| `RESEND_API_KEY` | Resend メールサービス API キー | 未設定時はメール送信スキップ |
| `RESEND_FROM_EMAIL` | メール送信元アドレス | `参加受付 <onboarding@resend.dev>` |
| `NODE_ENV` | 実行環境 | development |

---

## 4. Supabase

### 4.1 クライアント構成

**パブリッククライアント** (`lib/supabase.ts`):
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- ブラウザ安全、RLS ポリシー適用

**管理クライアント** (`lib/supabase-admin.ts`):
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
- サーバーサイド専用、RLS バイパス
- Proxy パターンによる遅延初期化（ビルド時の環境変数未設定を許容）

### 4.2 テーブル一覧
| テーブル | 説明 |
|---------|------|
| `events` | 大会イベント |
| `entries` | 参加申込 |
| `entry_rules` | 申込↔ルール結合 |
| `fighters` | 選手マスタ |
| `tournaments` | トーナメント/ワンマッチ |
| `matches` | 個別試合 |
| `dojos` | 道場マスタ |
| `rules` | ルールマスタ |
| `event_rules` | イベント↔ルール結合 |
| `form_configs` | フォーム設定 |
| `form_field_configs` | フィールド表示設定 |
| `form_notices` | 注意書き |
| `form_notice_images` | 注意書き画像 |
| `custom_field_defs` | カスタムフィールド定義 |
| `settings` | アプリケーション設定 |
| `timer_presets` | タイマープリセット |
| `timer_logs` | タイマー操作ログ |

### 4.3 RLS
全テーブルで RLS **無効**（現状は単一組織利用）。マルチテナント化（他団体へのライセンス販売）が現実的に計画されており、その際に `tenant_id` ベースの RLS ポリシーを有効化する。実装時は常にマルチテナント化を意識し、団体固有のハードコードを避けること。

### 4.4 ストレージバケット
| バケット | 用途 | 制約 |
|---------|------|------|
| `form-notice-images` | フォーム注意書き画像・バナー・OGP | 最大5MB、JPEG/PNG/WebP |

パス規則:
- 注意書き画像: `{notice_id}/{timestamp}.{ext}`
- バナー画像: `event-banners/{event_id}/{timestamp}.{ext}`
- OGP画像: `event-ogp/{event_id}/{timestamp}.{ext}`

### 4.5 RPC
| 関数 | 用途 |
|------|------|
| `swap_match_positions` | 試合位置の原子的スワップ |

### 4.6 マイグレーション
`supabase/migrations/` に12ファイル（0001〜0012）。本番環境のスキーマ変更は Supabase Management API 経由で直接実行。

---

## 5. 認証

### 5.1 管理者認証
- パスワードベース（OAuth 不使用）
- ログイン: `POST /api/admin/login`（username + password）
- ログアウト: `DELETE /api/admin/login`

### 5.2 セッション管理
- Cookie 名: `admin_auth`
- 値: `SHA-256(password + "karate-announce-v1")`（ソルト付きハッシュ）
- 有効期限: 30日
- 属性: `httpOnly`, `sameSite: lax`, `secure: NODE_ENV === "production"`

### 5.3 ミドルウェア
`proxy.ts` が `/admin/*` ルートを保護:
- Cookie の SHA-256 ハッシュを検証
- 未認証 → `/admin/login` にリダイレクト
- `/admin/login` は常にアクセス可能
- `ADMIN_PASSWORD` 未設定時は認証なし（ローカル開発用）

### 5.4 コート画面
現状は認証なし（開発・テスト期間中の暫定措置）。本番では認証を追加予定。認証なしで公開するのはライブ速報ページ（`/live`）のみ。

---

## 6. 外部サービス

### 6.1 OpenAI TTS
- エンドポイント: `https://api.openai.com/v1/audio/speech`
- モデル: `tts-1`
- プロキシ: `/api/tts`（サーバーサイドで API キーを保持）
- 詳細: ANNOUNCE_SPEC.md を参照

### 6.2 Resend メール
- エントリー送信成功時に確認メール送信
- Fire-and-forget（送信失敗してもエントリーは成功）
- `RESEND_API_KEY` 未設定時はスキップ（グレースフルデグラデーション）
- BCC で管理者通知メール対応
- 詳細: ENTRY_FORM_SPEC.md セクション9を参照

---

## 7. デプロイ

### 7.1 Vercel
- Git push でトリガー（自動デプロイ）
- プロジェクト: `karate-announce`
- 環境変数: Vercel ダッシュボードで管理
- ビルド: `npm run build`（Next.js 標準）

### 7.2 ビルドスクリプト
```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start"
}
```

### 7.3 CI/CD
- GitHub Actions なし
- Husky/lint-staged なし
- Vercel の自動デプロイのみ

---

## 8. Next.js 設定

### 8.1 next.config.ts
```typescript
{
  images: {
    remotePatterns: [{
      protocol: "https",
      hostname: "*.supabase.co",
      pathname: "/storage/v1/object/public/**"
    }]
  }
}
```
- Supabase Storage の画像をNext.js Image最適化で使用するための設定

### 8.2 TypeScript (tsconfig.json)
- `strict: true`
- `target: ES2017`
- `module: esnext`
- パスエイリアス: `@/*` → プロジェクトルート

### 8.3 PostCSS
- `@tailwindcss/postcss@^4`
- カスタムプラグイン: `postcss-unwrap-layer.mjs`（Tailwind レイヤーのアンラップ）

---

## 9. API ルート概要

### 9.1 管理者用（`/api/admin/*`、認証必須）
| パス | メソッド | 機能 |
|------|---------|------|
| `/api/admin/login` | POST, DELETE | ログイン/ログアウト |
| `/api/admin/events` | GET, POST | イベント一覧・作成 |
| `/api/admin/events/[id]` | GET, PATCH, DELETE | イベント詳細・更新・削除 |
| `/api/admin/events/[id]/banner` | POST, DELETE | バナー画像アップロード・削除 |
| `/api/admin/events/[id]/ogp` | POST, DELETE | OGP画像アップロード・削除 |
| `/api/admin/entries` | POST | エントリー作成 |
| `/api/admin/entries/[id]` | PATCH, DELETE | エントリー更新・削除 |
| `/api/admin/entry-rules` | POST | エントリー↔ルール紐付け |
| `/api/admin/dojos` | POST | 道場マスタ作成 |
| `/api/admin/dojos/[id]` | PATCH, DELETE | 道場マスタ更新・削除 |
| `/api/admin/rules` | POST | ルールマスタ作成 |
| `/api/admin/rules/[id]` | PATCH, DELETE | ルールマスタ更新・削除 |
| `/api/admin/fighters` | POST | 選手マスタ作成 |
| `/api/admin/fighters/[id]` | PATCH, DELETE | 選手マスタ更新・削除 |
| `/api/admin/tournaments` | POST | トーナメント作成 |
| `/api/admin/tournaments/[id]` | PATCH, DELETE | トーナメント更新・削除 |
| `/api/admin/matches/[id]` | PATCH | 試合更新 |
| `/api/admin/matches/[id]/replace` | POST | 選手差替 |
| `/api/admin/matches/swap` | POST | 試合位置スワップ |
| `/api/admin/matches/batch` | POST | 試合ラベル一括更新 |
| `/api/admin/form-config` | GET, PUT, PATCH | フォーム設定管理 |
| `/api/admin/form-config/copy` | POST | 過去大会からのコピー |
| `/api/admin/form-config/notices` | POST | 注意書き作成 |
| `/api/admin/form-config/notices/[id]` | PATCH, DELETE | 注意書き更新・削除 |
| `/api/admin/form-config/custom-fields` | POST, DELETE | カスタムフィールド管理 |
| `/api/admin/form-config/custom-fields/duplicate` | POST | カスタムフィールド複製 |
| `/api/admin/form-config/image-upload` | POST, DELETE | 注意書き画像アップロード・削除 |
| `/api/admin/settings` | GET, PUT | アプリケーション設定 |
| `/api/admin/timer-presets` | GET, POST | タイマープリセット一覧・作成 |
| `/api/admin/timer-presets/[id]` | PATCH, DELETE | タイマープリセット更新・削除 |
| `/api/admin/timer-presets/[id]/duplicate` | POST | タイマープリセット複製 |
| `/api/admin/timer-presets/[id]/buzzer` | POST, DELETE | カスタムブザー音源アップロード・削除 |

### 9.2 コート用（`/api/court/*`、認証なし）
| パス | メソッド | 機能 |
|------|---------|------|
| `/api/court/matches/[id]` | PATCH | 試合操作（start, set_winner 等） |
| `/api/court/entries/[id]` | PATCH | 欠場切替 |

### 9.3 公開用（`/api/public/*`、認証なし）
| パス | メソッド | 機能 |
|------|---------|------|
| `/api/public/entry` | POST | エントリー送信 |
| `/api/public/form-config` | GET | フォーム設定取得 |

### 9.4 TTS（`/api/tts`、認証なし）
| パス | メソッド | 機能 |
|------|---------|------|
| `/api/tts` | POST | 音声合成 |

---

## 10. 決定済み事項

- [x] デプロイ: Vercel（Git push 自動デプロイ）
- [x] DB: Supabase（RLS 無効、サービスロールキーで全操作）
- [x] 認証: パスワード + Cookie SHA-256（単一組織向け）
- [x] コート画面: 認証なし（公開API）
- [x] メール: Resend（fire-and-forget、未設定時スキップ）
- [x] TTS: OpenAI TTS-1（サーバーサイドプロキシ）
- [x] CI/CD: Vercel のみ（GitHub Actions なし）
- [x] スキーマ変更: Supabase Management API 経由

## 11. 未決事項

- [ ] `/api/admin/entries` を `/api/admin/events/[id]/entries` にネストするリファクタ（エントリーは概念的にイベントに属するため）
