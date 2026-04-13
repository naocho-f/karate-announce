# karate-announce システム仕様書

> **このドキュメントについて**
> 開発の進捗に合わせて随時更新すること。新機能追加・仕様変更・廃止した機能は必ずこのドキュメントに反映する。
> 最終更新: 2026-04-13（テンプレート機能・交流会レイアウト・注意機能）

---

## 1. システム概要

空手大会の試合管理・AI アナウンスシステム。
試合の参加受付から対戦表作成、コート進行、結果配信までを一貫して管理する。

**技術スタック**（詳細は [INFRA_SPEC.md](docs/INFRA_SPEC.md) を参照）

- フレームワーク: Next.js 16 (App Router) + TypeScript
- スタイリング: Tailwind CSS 4
- データベース: Supabase (PostgreSQL)
- AI音声: OpenAI TTS (tts-1 モデル)
- デプロイ: Vercel（karate.naocho.net）
- レンダリング: 全ページ動的レンダリング（ルートレイアウトで `force-dynamic` 設定）

---

## 2. ユーザーとロール

| ロール                         | アクセス先                                     | 認証                         |
| ------------------------------ | ---------------------------------------------- | ---------------------------- |
| **参加者**                     | `/entry/[eventId]`                             | なし（URL 直アクセス）       |
| **観客**                       | `/`、`/live`                                   | なし                         |
| **運営スタッフ（コート担当）** | `/court/[court]`                               | なし（URL 直アクセス）       |
| **タイムキーパー**             | `/timer/[courtId]`, `/timer/[courtId]/control` | なし（URL 直アクセス）       |
| **管理者**                     | `/admin/*`                                     | Cookie 認証（ID/パスワード） |

---

## 3. 画面一覧

各画面の詳細仕様は `docs/` 内の個別仕様書を参照。

| 画面                     | パス                                   | 認証        | 詳細仕様                                                                                                                                                                                                                                      |
| ------------------------ | -------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ホームページ             | `/`                                    | なし        | —                                                                                                                                                                                                                                             |
| 参加申込フォーム         | `/entry/[eventId]`                     | なし        | [ENTRY_FORM_SPEC.md](docs/ENTRY_FORM_SPEC.md)                                                                                                                                                                                                 |
| ライブ速報               | `/live`                                | なし        | —                                                                                                                                                                                                                                             |
| コート画面               | `/court/[court]`                       | なし        | [COURT_SPEC.md](docs/COURT_SPEC.md)                                                                                                                                                                                                           |
| 統合コート画面           | `/court`                               | なし        | [COURT_SPEC.md](docs/COURT_SPEC.md)                                                                                                                                                                                                           |
| タイマー表示             | `/timer/[courtId]`                     | なし        | [TIMER_SPEC.md](docs/TIMER_SPEC.md)                                                                                                                                                                                                           |
| タイマー操作             | `/timer/[courtId]/control`             | なし        | [TIMER_SPEC.md](docs/TIMER_SPEC.md)                                                                                                                                                                                                           |
| ショートカット印刷       | `/timer/shortcuts`                     | なし        | [TIMER_SPEC.md](docs/TIMER_SPEC.md)                                                                                                                                                                                                           |
| ログイン                 | `/admin/login`                         | —           | —                                                                                                                                                                                                                                             |
| 管理画面ホーム           | `/admin`                               | Cookie      | [EVENT_ADMIN_SPEC.md](docs/EVENT_ADMIN_SPEC.md)                                                                                                                                                                                               |
| 試合詳細                 | `/admin/events/[id]`                   | Cookie      | [EVENT_ADMIN_SPEC.md](docs/EVENT_ADMIN_SPEC.md), [BRACKET_SPEC.md](docs/BRACKET_SPEC.md), [BRACKET_VIEW_SPEC.md](docs/BRACKET_VIEW_SPEC.md), [MATCH_LABEL_SPEC.md](docs/MATCH_LABEL_SPEC.md), [FORM_CONFIG_SPEC.md](docs/FORM_CONFIG_SPEC.md) |
| 参加者詳細               | `/admin/events/[id]/entries/[entryId]` | Cookie      | [EVENT_ADMIN_SPEC.md](docs/EVENT_ADMIN_SPEC.md)                                                                                                                                                                                               |
| タイマー管理             | `/admin/timer-presets`                 | Cookie      | [TIMER_SPEC.md](docs/TIMER_SPEC.md)                                                                                                                                                                                                           |
| 仕様書                   | `/admin/spec`                          | なし（dev） | —                                                                                                                                                                                                                                             |
| オフラインフォールバック | `/offline`                             | なし        | [OFFLINE_SPEC.md](docs/OFFLINE_SPEC.md)                                                                                                                                                                                                       |

---

## 4. データモデル

### 4.1 テーブル定義

```sql
-- テナント（マルチテナント Phase 1 準備）
tenants (
  id UUID PK,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  plan TEXT DEFAULT 'free',       -- 'free' | 'standard' | 'pro'
  custom_domain TEXT UNIQUE,
  settings JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  tts_usage_count INT DEFAULT 0,
  tts_usage_reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- 流派マスタ
dojos (
  id UUID PK,
  name TEXT NOT NULL UNIQUE,
  name_reading TEXT,        -- TTS 読み仮名
  deleted_at TIMESTAMPTZ,   -- 論理削除日時
  created_at TIMESTAMPTZ
)

-- 選手マスタ（試合用; エントリーから自動生成）
fighters (
  id UUID PK,
  name TEXT NOT NULL,         -- フルネーム
  name_reading TEXT,          -- TTS 用フルネーム読み
  family_name TEXT,
  given_name TEXT,
  family_name_reading TEXT,
  given_name_reading TEXT,
  dojo_id UUID → dojos,
  affiliation TEXT,           -- 「流派　道場」形式
  affiliation_reading TEXT,   -- TTS 用
  weight NUMERIC,
  height NUMERIC,
  age_info TEXT,
  experience TEXT,
  extra_fields JSONB DEFAULT '{}',  -- エントリーからコピー
  created_at TIMESTAMPTZ
)

-- 大会（イベント）
events (
  id UUID PK,
  name TEXT NOT NULL,
  event_date DATE,
  court_count INT,
  status TEXT,                -- 'preparing' | 'ongoing' | 'finished'
  is_active BOOLEAN,          -- トップページ表示フラグ
  max_weight_diff NUMERIC,    -- 体重差上限 (kg)
  max_height_diff NUMERIC,    -- 身長差上限 (cm)
  court_names TEXT[],         -- コートごとの表示名（例: ["Aコート", "Bコート"]）
  entry_closed BOOLEAN NOT NULL DEFAULT false,  -- エントリー受付締め切りフラグ
  entry_close_at TIMESTAMPTZ,                  -- 受付自動終了日時（NULLなら無効）
  banner_image_path TEXT,                      -- バナー画像 Supabase Storage パス
  ogp_image_path TEXT,                         -- OGP画像パス（未設定時はバナー画像にフォールバック）
  email_subject_template TEXT,                 -- 確認メール件名テンプレート
  email_body_template TEXT,                    -- 確認メール本文テンプレート
  venue_info TEXT,                             -- 会場情報（メールテンプレート変数）
  notification_emails TEXT[],                  -- 管理者通知メールアドレス
  deleted_at TIMESTAMPTZ,                      -- 論理削除日時（docs/SOFT_DELETE_SPEC.md参照）
  created_at TIMESTAMPTZ
)

-- ルール（部門・クラス）
rules (
  id UUID PK,
  name TEXT NOT NULL,
  name_reading TEXT,            -- TTS 読み仮名
  description TEXT,             -- ルールの説明・詳細（フォーム設定の注意書きにデフォルト挿入される）
  timer_preset_id UUID → timer_presets,  -- 紐付けタイマー（1タイマー:Nルール）
  deleted_at TIMESTAMPTZ,                -- 論理削除日時
  created_at TIMESTAMPTZ
)

-- トーナメント（コートごとの対戦表）
tournaments (
  id UUID PK,
  name TEXT NOT NULL,
  court TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'tournament',  -- 'tournament' | 'one_match'
  status TEXT,                -- 'preparing' | 'ongoing' | 'finished'
  event_id UUID → events,
  default_rules TEXT,
  max_weight_diff NUMERIC,
  max_height_diff NUMERIC,
  sort_order INT,             -- コート画面での表示順（小さい順）
  filter_min_weight NUMERIC,  -- 体重フィルタ下限
  filter_max_weight NUMERIC,  -- 体重フィルタ上限
  filter_min_age INT,         -- 年齢フィルタ下限
  filter_max_age INT,         -- 年齢フィルタ上限
  filter_sex TEXT,            -- 性別フィルタ ("male" | "female" | null)
  filter_experience TEXT,     -- 経験フィルタ
  filter_grade TEXT,          -- 年代区分フィルタ（レガシー、単一値）
  filter_min_grade TEXT,      -- 年代区分フィルタ下限
  filter_max_grade TEXT,      -- 年代区分フィルタ上限
  filter_min_height NUMERIC,  -- 身長フィルタ下限
  filter_max_height NUMERIC,  -- 身長フィルタ上限
  deleted_at TIMESTAMPTZ,     -- 論理削除日時
  created_at TIMESTAMPTZ
)

-- 対戦（マッチ）
matches (
  id UUID PK,
  tournament_id UUID → tournaments,
  round INT,                  -- 1=初戦, 2=2回戦, ...
  position INT,               -- ラウンド内の位置
  fighter1_id UUID → fighters,
  fighter2_id UUID → fighters,  -- NULL = 不戦勝
  winner_id UUID → fighters,
  status TEXT,                -- 'waiting' | 'ready' | 'ongoing' | 'done'
  match_label TEXT,           -- 「第1試合」など
  rules TEXT,                 -- このマッチのルール
  result_method TEXT,         -- 勝利方法（point/wazaari/ippon/foul/decision/draw 等）
  result_detail JSONB,        -- 詳細（ポイント数、技あり数、反則数等）
  created_at TIMESTAMPTZ,
  UNIQUE(tournament_id, round, position)
)

-- タイマー
timer_presets (
  id UUID PK,
  name TEXT NOT NULL,
  event_id UUID → events,     -- NULL = グローバル
  rule_id UUID → rules,       -- レガシー（廃止予定。rules.timer_preset_id に移行済み）
  match_duration INT DEFAULT 120,
  timer_direction TEXT DEFAULT 'countdown',
  newaza_direction TEXT DEFAULT 'countup',  -- 寝技カウント方向
  swap_sides BOOLEAN DEFAULT false,  -- レガシー（操作画面の試合一覧上部ボタンに移動）
  combined_ippon_wins BOOLEAN DEFAULT false,  -- 技あり2回で合わせ一本勝ち
  -- 延長・寝技・ポイント・反則・表示・テーマ・ブザー（全46+カラム）
  -- 詳細は docs/TIMER_SPEC.md §9.1 参照
  deleted_at TIMESTAMPTZ,     -- 論理削除日時
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- タイマー操作ログ
timer_logs (
  id UUID PK,
  match_id UUID → matches (ON DELETE CASCADE),
  action TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  elapsed_ms INT DEFAULT 0,
  created_at TIMESTAMPTZ
)

-- 振り分けルール（全自動対戦表作成用）
bracket_rules (
  id UUID PK,
  event_id UUID → events ON DELETE CASCADE,
  name TEXT NOT NULL,           -- 例: "小学生軽量級", "大人無差別"
  rule_id UUID → rules,        -- 対象の競技ルール（NULL=全ルール）
  min_age INT,                  -- 年齢下限（NULL=制限なし）
  max_age INT,                  -- 年齢上限
  min_weight NUMERIC,           -- 体重下限
  max_weight NUMERIC,           -- 体重上限
  min_height REAL,              -- 身長下限
  max_height REAL,              -- 身長上限
  min_grade TEXT,                -- 年代下限（例: "小1"、NULL=制限なし）
  max_grade TEXT,                -- 年代上限（例: "小4"、NULL=制限なし）
  max_grade_diff INT,           -- 最大学年差（小学生用、NULL=制限なし）
  max_weight_diff NUMERIC,      -- トーナメント内の最大体重差
  max_height_diff NUMERIC,      -- トーナメント内の最大身長差
  sex_filter TEXT,              -- "male" | "female" | NULL(両方)
  court_num INT,                -- 基本割り当てコート（NULL=自動）
  sort_order INT NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,     -- 論理削除日時
  created_at TIMESTAMPTZ
)

-- エントリー（参加申し込み）
entries (
  id UUID PK,
  event_id UUID → events,
  family_name TEXT NOT NULL,
  given_name TEXT,
  family_name_reading TEXT,
  given_name_reading TEXT,
  school_name TEXT,           -- 流派名
  school_name_reading TEXT,   -- 読み仮名
  dojo_name TEXT,             -- 道場名
  dojo_name_reading TEXT,     -- 読み仮名
  sex TEXT,                   -- "male" | "female"
  weight NUMERIC,
  height NUMERIC,
  birth_date DATE,
  age INT,
  grade TEXT,
  experience TEXT,
  is_withdrawn BOOLEAN NOT NULL DEFAULT false,  -- 欠場フラグ
  memo TEXT,                  -- 申込者の備考
  admin_memo TEXT,            -- 管理者メモ
  fighter_id UUID → fighters, -- 対戦表作成時に紐付け
  extra_fields JSONB DEFAULT '{}',  -- 項目プール拡張フィールド
  form_version INT,           -- 入力時のフォーム設定バージョン
  is_test BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,     -- 論理削除日時
  created_at TIMESTAMPTZ
)

-- イベント・ルール紐付け
event_rules (
  event_id UUID → events,
  rule_id UUID → rules
)

-- エントリー・ルール紐付け
entry_rules (
  entry_id UUID → entries,
  rule_id UUID → rules
)

-- フォーム設定（大会ごと）
form_configs (
  id UUID PK,
  event_id UUID → events UNIQUE,
  version INT DEFAULT 0,       -- 公開バージョン（0=未公開、1以降=公開済み）
  is_ready BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- フォームフィールド設定
form_field_configs (
  id UUID PK,
  form_config_id UUID → form_configs ON DELETE CASCADE,
  field_key TEXT NOT NULL,     -- FIELD_POOL の key
  visible BOOLEAN DEFAULT true,
  required BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  has_other_option BOOLEAN DEFAULT false,
  custom_choices JSONB,        -- [{label, value}]
  custom_label TEXT,            -- デフォルトラベルを上書き（NULLならFIELD_POOLのlabelを使用）
  UNIQUE(form_config_id, field_key)
)

-- 注意書き
form_notices (
  id UUID PK,
  form_config_id UUID → form_configs ON DELETE CASCADE,
  anchor_type TEXT NOT NULL,   -- 'form_start' | 'field' | 'form_end'
  anchor_field_key TEXT,       -- field の場合の対象項目 key
  sort_order INT DEFAULT 0,
  text_content TEXT,
  scrollable_text TEXT,
  link_url TEXT,
  link_label TEXT,
  require_consent BOOLEAN DEFAULT false,
  consent_label TEXT,
  deleted_at TIMESTAMPTZ,     -- 論理削除日時
  created_at TIMESTAMPTZ
)

-- カスタムフィールド定義（自由設問）
custom_field_defs (
  id UUID PK,
  form_config_id UUID → form_configs ON DELETE CASCADE,
  field_key TEXT NOT NULL,          -- "custom_{8桁hex}" 自動生成
  label TEXT NOT NULL,              -- 表示名
  field_type TEXT NOT NULL,         -- "text" | "number" | "select" | "checkbox" | "textarea"
  choices JSONB,                    -- select/checkbox用 [{label, value}]
  sort_order INT DEFAULT 0,
  deleted_at TIMESTAMPTZ,     -- 論理削除日時
  created_at TIMESTAMPTZ,
  UNIQUE(form_config_id, field_key)
)

-- 注意書き画像
form_notice_images (
  id UUID PK,
  notice_id UUID → form_notices ON DELETE CASCADE,
  storage_path TEXT NOT NULL,  -- Supabase Storage パス
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ
)
-- 不具合報告
bug_reports (
  id UUID PK,
  what_did TEXT NOT NULL,        -- 何をしていたか
  what_happened TEXT NOT NULL,   -- 何が起きたか
  what_expected TEXT,            -- 本来どうなるべきか
  page_url TEXT NOT NULL,        -- 報告元ページURL
  user_agent TEXT,               -- ブラウザ情報
  viewport TEXT,                 -- 画面サイズ
  app_version TEXT,              -- アプリバージョン
  status TEXT DEFAULT 'open',    -- 'open' | 'in_progress' | 'resolved' | 'wontfix'
  resolution TEXT,
  fixed_in_version TEXT,
  created_at TIMESTAMPTZ
)

-- 冪等性キー（重複リクエスト防止）
idempotency_keys (
  key TEXT PK,
  response_status INT NOT NULL,
  response_body JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
)

-- イベント・選手紐付け（対戦表作成時）
event_fighters (
  event_id UUID → events NOT NULL,
  fighter_id UUID → fighters NOT NULL,
  seed_number INT
)

-- イベント・選手・ルール紐付け
event_fighter_rules (
  event_id UUID → events NOT NULL,
  fighter_id UUID → fighters NOT NULL,
  rule_id UUID → rules NOT NULL
)

-- 全体設定（キーバリュー）
settings (
  key TEXT PK,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ
)
```

**Supabase Storage バケット**: `form-notice-images`（公開読み取り）

**論理削除（ソフトデリート）**: 9テーブル（events, rules, tournaments, timer_presets, bracket_rules, entries, form_notices, custom_field_defs, dojos）に `deleted_at` カラムを追加。詳細は [SOFT_DELETE_SPEC.md](docs/SOFT_DELETE_SPEC.md) を参照。

### 4.2 体格相性レベル

`lib/compatibility.ts` で定義。

| 記号       | 意味       | 判定条件           |
| ---------- | ---------- | ------------------ |
| ◎ ok       | 問題なし   | 差 ≤ 上限          |
| △ warn     | 注意       | 上限 < 差 ≤ 2×上限 |
| ✕ ng       | 危険       | 差 > 2×上限        |
| － unknown | データなし | 体重/身長未入力    |

---

## 5. API 仕様

### 5.1 管理者向け API（認証必須）

認証: `verifyAdminAuth()` による Cookie チェック

| メソッド     | パス                                           | 概要                                                                                           |
| ------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| POST/DELETE  | `/api/admin/login`                             | ログイン・ログアウト                                                                           |
| POST         | `/api/admin/events`                            | 大会作成（`copy_from_event_id` 指定で過去大会から複製。`copy_entries` で任意エントリーコピー） |
| PATCH        | `/api/admin/events/[id]`                       | 大会更新                                                                                       |
| DELETE       | `/api/admin/events/[id]`                       | 大会削除                                                                                       |
| POST         | `/api/admin/dojos`                             | 流派追加                                                                                       |
| PATCH/DELETE | `/api/admin/dojos/[id]`                        | 流派更新・削除                                                                                 |
| POST         | `/api/admin/fighters`                          | 選手追加                                                                                       |
| PATCH/DELETE | `/api/admin/fighters/[id]`                     | 選手更新・削除                                                                                 |
| POST         | `/api/admin/rules`                             | ルール追加（name, name_reading, description）                                                  |
| PATCH/DELETE | `/api/admin/rules/[id]`                        | ルール更新（name_reading, description）・削除                                                  |
| POST         | `/api/admin/entries`                           | エントリー追加（管理者）                                                                       |
| PATCH        | `/api/admin/entries/[id]`                      | エントリー更新                                                                                 |
| DELETE       | `/api/admin/entries/[id]`                      | エントリー削除                                                                                 |
| POST/DELETE  | `/api/admin/entry-rules`                       | ルール紐付け管理                                                                               |
| GET/POST     | `/api/admin/bracket-rules`                     | 振り分けルール一覧取得・作成                                                                   |
| PUT/DELETE   | `/api/admin/bracket-rules/[id]`                | 振り分けルール更新・削除                                                                       |
| POST         | `/api/admin/tournaments`                       | トーナメント作成・対戦表生成                                                                   |
| PUT          | `/api/admin/tournaments/[id]`                  | トーナメント更新（matches 再作成、id/sort_order/created_at 保持）                              |
| DELETE       | `/api/admin/tournaments/[id]`                  | トーナメント削除                                                                               |
| PATCH        | `/api/admin/matches/[id]`                      | マッチ更新（管理者）                                                                           |
| POST         | `/api/admin/matches/[id]/replace`              | マッチの選手差し替え（`{ slot, entry_id }`）                                                   |
| POST         | `/api/admin/matches/batch`                     | 試合ラベル一括更新                                                                             |
| POST         | `/api/admin/matches/swap`                      | 同一ラウンド内の隣接試合入替                                                                   |
| GET/PUT      | `/api/admin/settings`                          | 全体設定（体重差・身長差上限等）の取得・更新                                                   |
| POST/DELETE  | `/api/admin/events/[id]/banner`                | バナー画像アップロード/削除                                                                    |
| POST/DELETE  | `/api/admin/events/[id]/ogp`                   | OGP画像アップロード/削除                                                                       |
| GET/POST     | `/api/admin/timer-presets`                     | タイマー一覧取得・新規作成                                                                     |
| PATCH/DELETE | `/api/admin/timer-presets/[id]`                | タイマー更新・削除                                                                             |
| POST         | `/api/admin/timer-presets/[id]/duplicate`      | タイマー複製                                                                                   |
| POST/DELETE  | `/api/admin/timer-presets/[id]/buzzer`         | カスタムブザー音源アップロード/削除                                                            |
| PATCH        | `/api/admin/events/[id]/restore`               | イベント削除取消（論理削除から復元、24時間以内）                                               |
| PATCH        | `/api/admin/dojos/[id]/restore`                | 道場削除取消                                                                                   |
| PATCH        | `/api/admin/rules/[id]/restore`                | ルール削除取消                                                                                 |
| PATCH        | `/api/admin/entries/[id]/restore`              | エントリー削除取消                                                                             |
| PATCH        | `/api/admin/tournaments/[id]/restore`          | トーナメント削除取消                                                                           |
| PATCH        | `/api/admin/timer-presets/[id]/restore`        | タイマー削除取消                                                                               |
| PATCH        | `/api/admin/bracket-rules/[id]/restore`        | 振り分けルール削除取消                                                                         |
| PATCH        | `/api/admin/form-config/notices/[id]/restore`  | 注意書き削除取消                                                                               |
| PATCH        | `/api/admin/form-config/custom-fields/restore` | カスタムフィールド削除取消                                                                     |

### 5.2 コート用 API（認証必須）

| メソッド | パス                      | 概要                                           |
| -------- | ------------------------- | ---------------------------------------------- |
| PATCH    | `/api/court/matches/[id]` | 試合進行（開始・勝者確定・選手替え・順序入替） |
| PATCH    | `/api/court/entries/[id]` | 棄権フラグ更新（`{ is_withdrawn: boolean }`）  |

**`/api/court/matches/[id]` の action 一覧**

| action           | パラメータ                                                                                | 説明                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `start`          | `tournamentId`                                                                            | `status: "ongoing"` に変更。トーナメントも `ongoing` に                                                         |
| `set_winner`     | `winnerId`, `tournamentId`, `round`, `rounds`, `position`                                 | 勝者確定・次ラウンド進出。最終ラウンドならトーナメントを `finished` に                                          |
| `replace`        | `slot`, `newFighterId`                                                                    | 選手差し替え                                                                                                    |
| `edit`           | `matchLabel`, `rules`                                                                     | マッチラベル・ルール変更                                                                                        |
| `correct_winner` | `winnerId`, `tournamentId`, `round`, `rounds`, `position`                                 | 勝者訂正。次ラウンドが未進行なら選手を差し替え                                                                  |
| `swap_with`      | `otherMatchId`                                                                            | 試合順序入替（3ステップスワップで `UNIQUE` 制約を回避）                                                         |
| `finish_timer`   | `winnerId`, `tournamentId`, `round`, `rounds`, `position`, `resultMethod`, `resultDetail` | タイマーからの結果書き戻し。winner_id, status="done", result_method, result_detail を更新。次ラウンド進出も処理 |

### 5.3 公開 API（認証不要）

| メソッド | パス                                   | 概要                                                      |
| -------- | -------------------------------------- | --------------------------------------------------------- |
| POST     | `/api/public/entry`                    | エントリーフォーム送信（extra_fields, form_version 含む） |
| GET      | `/api/public/form-config?event_id=xxx` | フォーム設定取得（準備中なら `{ready:false}`）            |

### 5.4 フォーム設定管理 API（認証必須）

| メソッド | パス                                             | 概要                                                   |
| -------- | ------------------------------------------------ | ------------------------------------------------------ |
| GET      | `/api/admin/form-config?event_id=xxx`            | フォーム設定取得（なければデフォルトで自動作成）       |
| PUT      | `/api/admin/form-config`                         | フィールド設定一括更新                                 |
| PATCH    | `/api/admin/form-config`                         | バージョンインクリメント＆公開                         |
| POST     | `/api/admin/form-config/copy`                    | 過去の大会からフォーム設定コピー                       |
| POST     | `/api/admin/form-config/notices`                 | 注意書き作成                                           |
| PATCH    | `/api/admin/form-config/notices/[id]`            | 注意書き更新                                           |
| DELETE   | `/api/admin/form-config/notices/[id]`            | 注意書き削除（画像カスケード削除）                     |
| POST     | `/api/admin/form-config/image-upload`            | 注意書き画像アップロード（5MB制限、JPEG/PNG/WebP）     |
| DELETE   | `/api/admin/form-config/image-upload`            | 注意書き画像削除                                       |
| POST     | `/api/admin/form-config/custom-fields`           | 自由設問追加（custom_field_defs + form_field_configs） |
| DELETE   | `/api/admin/form-config/custom-fields`           | 自由設問削除                                           |
| POST     | `/api/admin/form-config/custom-fields/duplicate` | 自由設問複製                                           |

### 5.5 TTS API（認証必須）

| メソッド | パス       | 概要                                                                                                             |
| -------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| POST     | `/api/tts` | OpenAI TTS-1 で音声生成。`{ text, voice, speed }` を受け取り音声 blob を返す。コート画面の TTS prefetch でも使用 |

### 5.6 不具合報告 API

| メソッド | パス                    | 概要                               |
| -------- | ----------------------- | ---------------------------------- |
| POST     | `/api/bug-reports`      | 不具合報告の投稿（公開、認証不要） |
| GET      | `/api/bug-reports`      | 一覧取得（認証必須）               |
| PATCH    | `/api/bug-reports/[id]` | ステータス更新（認証必須）         |
| DELETE   | `/api/bug-reports/[id]` | 不具合報告削除（認証必須）         |

---

## 6. アナウンス機能仕様

> 詳細は [ANNOUNCE_SPEC.md](docs/ANNOUNCE_SPEC.md) を参照。

### 6.1 TTS 設定

LocalStorage に保存。

| 設定 | キー        | デフォルト |
| ---- | ----------- | ---------- |
| 音声 | `tts_voice` | nova       |
| 速度 | `tts_speed` | 1.0        |

**音声一覧**

| 値      | 説明         |
| ------- | ------------ |
| nova    | 女性・明瞭   |
| shimmer | 女性・柔らか |
| alloy   | 中性         |
| echo    | 男性・軽め   |
| fable   | 男性・物語風 |
| onyx    | 男性・重厚   |

### 6.2 アナウンステンプレート

LocalStorage（`announce_templates`）に保存。デフォルト値は `lib/speech.ts` に定義。

**デフォルトテンプレート**

```
試合開始:
「{{試合ラベル}}。ルール、{{ルール}}。{{選手1流派＋道場}}、所属、{{選手1名前}}選手。対。{{選手2流派＋道場}}、所属、{{選手2名前}}選手。これより試合を開始します。」

勝者発表:
「ただいまの試合は、{{勝者流派＋道場}}、所属、{{勝者名前}}選手の勝ちです。」
```

### 6.3 テンプレート変数

`{{変数名}}` 形式で変数を埋め込む。

**試合開始テンプレート用変数**

| 変数                  | 説明                              | サンプル値                       |
| --------------------- | --------------------------------- | -------------------------------- |
| `{{試合ラベル}}`      | 試合名またはラウンド名            | 準決勝                           |
| `{{ルール}}`          | ルール名のみ（未設定時は空）      | エキスパート                     |
| `{{選手1名前}}`       | 選手1の名前（読み仮名優先）       | ふくしまけんしん                 |
| `{{選手1流派＋道場}}` | 流派と道場を読点でつないだもの    | じゅうくうかい、ほんぶどうじょう |
| `{{選手1流派}}`       | 選手1の流派のみ                   | じゅうくうかい                   |
| `{{選手1道場}}`       | 選手1の道場名のみ（ない場合は空） | ほんぶどうじょう                 |
| `{{選手2名前}}`       | 選手2の名前（読み仮名優先）       | すずきいちろう                   |
| `{{選手2流派＋道場}}` | 流派と道場を読点でつないだもの    | せいどうかいかん                 |
| `{{選手2流派}}`       | 選手2の流派のみ                   | せいどうかいかん                 |
| `{{選手2道場}}`       | 選手2の道場名のみ（ない場合は空） | （空）                           |

**勝者発表テンプレート用変数**

| 変数                 | 説明                             | サンプル値                       |
| -------------------- | -------------------------------- | -------------------------------- |
| `{{勝者名前}}`       | 勝者の名前（読み仮名優先）       | ふくしまけんしん                 |
| `{{勝者流派＋道場}}` | 流派と道場を読点でつないだもの   | じゅうくうかい、ほんぶどうじょう |
| `{{勝者流派}}`       | 勝者の流派のみ                   | じゅうくうかい                   |
| `{{勝者道場}}`       | 勝者の道場名のみ（ない場合は空） | ほんぶどうじょう                 |

**アフィリエーション変換ルール**

- DB 保存形式: 「柔空会　本部道場」（全角スペース区切り）
- TTS 向け変換: 「柔空会、本部道場」（読点区切りで自然な間を作る）

---

## 7. セキュリティ仕様

- **管理者認証**: ユーザー名（`ADMIN_USERNAME`）＋パスワード（`ADMIN_PASSWORD`）の両方を検証。SHA256(password + SALT) を Cookie に保存（HttpOnly, Secure, 30日有効）
- **SALT**: `"karate-announce-v1"` にハードコード（環境変数ではない）
- **管理 API**: 全エンドポイントで `verifyAdminAuth()` によるCookieチェック
- **エントリー API**: 認証不要（URL がわかれば誰でも送信可能）
- **Supabase RLS**: 無効化（個人利用を前提とした設計）
- **ローカル開発**: `ADMIN_PASSWORD` 未設定の場合は認証スキップ

---

## 8. 非機能要件

| 項目              | 仕様                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| レスポンシブ      | スマホ対応必須（参加申込フォーム・コート画面）                                                                                                                                                                                                                                                                                                                                              |
| 横幅統一          | 基本 `max-w-5xl`。参加申込フォーム本体のみ `max-w-md`（入力フォームのため例外）。ライブ速報 `/live` は `max-w-lg`（スマホ最適化のため例外）                                                                                                                                                                                                                                                 |
| リアルタイム更新  | ライブ速報: Supabase Realtime（matches テーブル購読）で即時反映 + 5秒ポーリング（フォールバック）。コート画面: 3秒ポーリング、ホーム: 5秒ポーリング。全画面で `visibilitychange` イベントによるタブ復帰時即時リロード対応（モバイルブラウザの `setInterval` 停止対策）                                                                                                                      |
| ブラウザ互換性    | PostCSS プラグイン `postcss-unwrap-layer.mjs` で Tailwind CSS 4 の `@layer` を除去し Chrome < 99 でもユーティリティクラスが動作。`browserslist` 設定（Chrome >= 80）で `color-mix()` を HEX fallback + `@supports` 段階的強化に自動変換。`globals.css` の CSS 変数フォールバックも安全策として維持。`lang="ja"` + 日本語システムフォント明示指定で CJK 混在テキストのフォント切り替え安定化 |
| カスタムカラー    | メイン背景色 `--color-main-bg: #101828`（gray-900 相当）。Tailwind の `bg-main-bg` で全ページ共通使用。カード背景は `bg-gray-800`、ボーダーは `border-gray-700`（参加申込フォームの入力欄は `border-gray-600`）。注意書きは外枠線なし・左ボーダーのみ（`border-l-2 border-yellow-600/40`）で項目の補足情報として表示                                                                        |
| LocalStorage 利用 | TTS設定、アナウンステンプレート（試合順序は DB 管理に移行）                                                                                                                                                                                                                                                                                                                                 |
| オフライン対応    | PWA（Serwist による Service Worker）。App Shell キャッシュ + API リクエストキューイング + 楽観的更新。詳細は [OFFLINE_SPEC.md](docs/OFFLINE_SPEC.md)                                                                                                                                                                                                                                        |
| デプロイ          | Vercel（karate.naocho.net）                                                                                                                                                                                                                                                                                                                                                                 |
| セキュリティ      | ESLint セキュリティプラグイン + Semgrep + gitleaks + osv-scanner + CodeQL。pre-commit と CI の両方で自動チェック。詳細は [SECURITY.md](docs/SECURITY.md)                                                                                                                                                                                                                                    |

---

## 9. 開発上の決定事項・設計方針

ユーザーからの要望に基づく仕様決定の履歴。

- **最終整合性修正（2026-04-07）**: 未実装機能の統合（cacheData/offlineMode/UnifiedStatusBar）、dead export削除、仕様書のステータス更新、各画面仕様書にオフライン参照追加、CLAUDE.mdにエクスポート確認チェックリスト追加
- **レビュー指摘修正: dead code削除・enqueue追加・テスト補完（2026-04-07）**: ConnectionStatusBanner削除、court-index-clientにenqueue追加、resilient-fetchにofflineModeテスト、offline-queueに401/ネットワークエラーテスト追加
- **E2Eテスト修正（2026-04-07）**: entry-form-autosaveテストをテストイベント作成方式に修正、SWテストに開発環境スキップ追加
- **操作説明にオフラインモードセクション追加（2026-04-08）**: ステータスバーの見方、切替手順、WiFiなし会場での運用手順を操作説明ガイドに追加
- **E2Eテスト修正・全通過（2026-04-08）**: court-index-clientフック順序修正、home-and-courtテストテキスト修正・flaky安定化。100 passed / 0 failed
- **E2Eテストデータクリーンアップ修正（2026-04-08）**: bug-reports DELETE API追加、E2Eテストで作成したデータを確実に削除するよう修正
- **UXポリシー準拠修正（2026-04-08）**: shortcuts印刷ページダークテーマ化、entry detailスピナー追加、生年月日label紐付け
- **UXポリシー策定（2026-04-08）**: ローディング・エラー区別・テーマ統一・オフライン・a11yの5項目をCLAUDE.mdに記録。Step 4チェックリストに追加
- **レビュー修正4件（2026-04-08）**: タイマー操作画面オフライン対応統合、コート画面DBエラー表示改善、エントリーフォームエラー/準備中区別、タイマー空コート表示改善
- **レビュー修正6件（2026-04-08）**: Realtimeオフライン対応、onReconnect+flush統合、ローディングスピナー追加、offlineページダークテーマ化、CLAUDE.md Step4自動化明記・E2E説明統合
- **スキーマ網羅チェック完了（2026-04-08）**: matches.updated_atをスキーマ+型定義に追記。全20テーブル・全カラムの照合完了
- **スキーマ乖離の再発防止ルール追加（2026-04-08）**: CLAUDE.mdにsupabase_schema.sql同時更新必須を明記
- **レビュー修正3件（2026-04-08）**: supabase_schema.sqlカラム追記、SW APIキャッシュをNetworkOnlyに修正、matchesRule混合学年比較実装+テスト4件
- **データ整合性修正8件（2026-04-08）**: flush()呼出追加、409キュー全消失防止、is_activeアトミック化RPC、フォーム楽観ロック、README更新、依存脆弱性修正、CI audit追加
- **品質改善4件（2026-04-08）**: DBエラー漏洩修正（dbErrorヘルパー導入・全33ルート適用）、POST応答をid返却に統一、エントリーフォームa11y改善、supabase-admin型安全性改善
- **ライブ速報N+1クエリ修正（2026-04-08）**: /live のポーリングをバッチクエリに変更（17逐次→3クエリ）
- **総合レビュー・ブラッシュアップ（2026-04-08）**: court-index-clientのquality修正、SPEC.md Section 4テーブル追記、Section 9をCHANGELOGに移動、CLAUDE.md冗長ルール削除、ベースライン修正
- **品質チェック3層役割分担（2026-04-08）**: pre-commit(静的+tsc+vitest)→CI(+build)→Vercel(build)。pre-commitからbuild除去で高速化
- **GitHub Actions CI 静的整合性チェック追加・Node 22対応（2026-04-08）**: pre-commit hook の静的チェックをCIにも実装。hook 未インストールでもプッシュ後に検出
- **pre-commit hook基盤整備（2026-04-08）**: 自動インストール（prepare）、Phase分離（静的→警告→動的）、警告ベースライン導入
- **pre-commit hook品質チェック完全版（2026-04-08）**: 画面逆方向・リンク切れ・認証チェック・環境変数・コンポーネントテスト存在を追加
- **pre-commit hook網羅的チェック追加（2026-04-08）**: 全不変条件の機械的検証を完了。API逆方向・ページ一覧・hook同期チェック追加
- **pre-commit hookにbuild追加（2026-04-08）**: npm run buildをコミット前に実行。ビルド壊れたコードの混入を防止
- **complexity+max-depth+no-restricted-imports追加（2026-04-10）**: 循環複雑度120上限、ネスト深さ7上限、API routeでのanon client使用禁止を追加。既存違反0件
- **max-lines追加（2026-04-10）**: ファイル行数1600行上限を追加。既存コードの自然な構造を尊重しつつ肥大化を防止
- **max-lines-per-function追加+大規模関数分割（2026-04-10）**: 500行超の関数を禁止。8件の巨大コンポーネントを分割（EntryPage, TimerControlPage, CourtPage, EventDetailPage, GroupSection, TournamentEditor, GuidePanel, TimerPresetsPanel）。テスト・カスタムhookは除外
- **consistent-type-imports追加（2026-04-10）**: @typescript-eslint/consistent-type-importsをwarnで追加。58件を自動修正（import type化）
- **no-console追加（2026-04-10）**: no-consoleをerrorで追加（console.error/warnは許可）。既存違反0件
- **no-misused-promises追加（2026-04-10）**: @typescript-eslint/no-misused-promisesをerrorで追加。95件のPromise誤用（async onClick等）を修正
- **no-floating-promises追加（2026-04-10）**: @typescript-eslint/no-floating-promisesをerrorで追加。24ファイル64件のawait忘れPromiseを修正
- **Prettier導入+eslint-disable全廃止（2026-04-10）**: Prettier導入（.prettierrc.json）、全170ファイルをフォーマット。eslint-disable コメント22件を全削除し根本原因を修正。pre-commit hookでeslint-disable使用をブロック。CLAUDE.mdにeslint-disable禁止・返事ルールを追記
- **ESLint pre-commit/CI強制（2026-04-10）**: pre-commit hookとGitHub Actions CIにESLintチェックを追加。--max-warnings 0で警告も0件必須。エラー・警告があるとコミット・CIが失敗する
- **ESLint導入（2026-04-09）**: eslint-config-next + @typescript-eslint + import ルールを導入。全212件の警告・エラーを修正（no-non-null-assertion 133件、no-unused-vars 45件、set-state-in-effect 12件、import/order 13件、no-img-element 7件、no-explicit-any 6件等）。npm run lint / lint:fix コマンド追加
- **トーナメントAPIテスト補強（2026-04-09）**: ラウンド構造検証（1/3/8ペア）、不戦勝の次ラウンド進出・done設定検証、複数不戦勝の独立処理検証を追加。デッドコード削除で失われたカバレッジを本番コードのテストで回復
- **テスト専用エクスポート整理（2026-04-09）**: アプリ未使用のエクスポートを削除（tournament.ts: generateFirstRound/BracketSlot/BracketMatch, pairing.ts: filterDuplicatePairs, compatibility.ts: worstCompatibility）。pairing.ts: nextPowerOf2を非exportに。該当テスト28件を削除
- **entry-service抽出（2026-04-09）**: public/entry/route.tsのビジネスロジック（締切チェック、年齢計算、道場upsert、エントリーINSERT、ルール紐付け、メール送信）をlib/services/entry-service.tsに分離。route.tsはレート制限+リクエスト解析のみの薄いコントローラーに
- **デッドコード除去: lib/bracket.ts削除+テスト移植（2026-04-09）**: アプリ未使用のlib/bracket.tsとbracket.test.tsを削除。テストケースをAPI routeテスト（admin-media-tournaments.test.ts）に移植し、本番コードのカバレッジを強化
- **マルチテナント準備: DB基盤（2026-04-09）**: tenants テーブル作成、11テーブルに tenant_id カラム追加、子テーブル用トリガー・インデックス追加。lib/errors.ts（共通エラー型）・lib/types.ts（Tenant型）追加。既存機能への影響なし
- **pre-commit hookにlib/テスト存在チェック追加（2026-04-08）**: lib/\*.tsに対応するテストファイルがなければ警告
- **pre-commit hookにAPI一覧完全性チェック追加（2026-04-08）**: route.tsのURLパスがSPEC.mdに記載されていなければブロック
- **pre-commit hookにvitest追加（2026-04-08）**: テスト失敗時のコミットをブロック。テスト追加が実効性を持つ前提条件
- **レビュー恒久対策プロセス確立（2026-04-08）**: 指摘→テストorHookに変換。仕様書参照・APIテスト存在チェックをhook追加。Step 5簡素化
- **impact-check導入・Step 1/5強化（2026-04-08）**: 変更ファイルの影響範囲を自動列挙するスクリプト追加。Step 1で事前把握、Step 5で関連ファイル確認を必須化
- **pre-commit hook 整合性チェック追加（2026-04-08）**: SPEC.md日付・RPCマイグレーション存在確認を自動化。scripts/pre-commitとして管理
- **set_match_winner RPCマイグレーション記録（2026-04-08）**: 本番DBに存在するがマイグレーション未記録だったRPC関数をファイル化
- **テストカバレッジ補完（2026-04-08）**: 画像アップロードAPI 3件・アナウンスコア関数・BracketView純粋関数のテスト追加（864→911テスト）
- **SPEC.md整合性修正（2026-04-07）**: ANNOUNCE_SPEC.md・INFRA_SPEC.md・OFFLINE_SPEC.mdへの参照追加、非機能要件にオフライン/PWA記載追加
- **Phase 4-6: 端末事前準備チェックリスト（2026-04-07）**: 管理画面ホームにSW登録+キャッシュ構築状況の確認セクション追加
- **Phase 4-4: swap_withトランザクション化（2026-04-07）**: Supabase RPC swap_match_positionsでアトミック実行。3ステップ非アトミック更新を廃止
- **OFFLINE_SPEC全体更新（2026-04-07）**: Phase 1〜3+S実施済みを反映。ステータス・受け入れ基準・スケジュールを更新。Phase 4を4-4/4-6確定・他不要に整理
- **オフライン対応 Phase 3b: TTSプリキャッシュ（2026-04-07）**: prefetchTtsをCache APIベースに拡張。speak関数もキャッシュ優先に変更。オフラインでも再生可能
- **オフライン対応 Phase 3a: 控えめな楽観的更新（2026-04-07）**: set_winner/finish_timer操作時の「確定待ち」表示。未送信キューがある試合の次ラウンド開始をブロック
- **CLAUDE.md状態管理チェックリスト追加（2026-04-07）**: Step 4に状態遷移・リソース解放・永続/揮発整合性の確認項目を追加
- **レビュー指摘修正（2026-04-07）**: enabledオフ→オン時のバックオフカウンタリセット、backoff abort リスナー解除、sequenceCounterリロード対策
- **オフライン対応 Phase 2d: 各画面へのキュー統合（2026-04-07）**: court/live/timerのConnectionStatusBannerを統合ステータスバーに置き換え。操作失敗時のキュー保存、データキャッシュフォールバック、オフラインモード連携
- **オフライン対応 Phase 2c: オフラインモード+統合ステータスバー（2026-04-07）**: オンライン/オフラインモード切替、localStorage永続化、統合ステータスバー、useConnectionStatusにenabled追加
- **オフライン対応 Phase 2b: キュー再送+タブ間排他（2026-04-07）**: FIFO順序のflushロジック、Web Locks排他、Idempotency-Key自動付与、409/401/5xxエラー処理、onQueueFallback統合
- **オフライン対応 Phase 2a: 操作キュー基盤+データキャッシュ（2026-04-07）**: IndexedDB（idb-keyval）による操作キュー・ポーリングデータキャッシュを追加
- **OFFLINE_SPEC計画書更新（2026-04-07）**: 完全オフラインモード対応を追加。2つの運用モード定義、1ラウンド制限の明記、Phase 2/3を確定実施に変更
- **オフライン対応 Phase S-4: set_winner/finish_timerトランザクション化（2026-04-07）**: Supabase RPCでmatch更新+次ラウンド配置をアトミック実行。途中クラッシュ時のデータ不整合を防止
- **オフライン対応 Phase S-2: 楽観ロック全アクション拡張（2026-04-07）**: court APIのstart/replace/correct_winner + admin matches APIにmatchUpdatedAtチェックを追加。全7アクション+admin更新で楽観ロック有効
- **オフライン対応 Phase S-1: 冪等性キー（2026-04-07）**: idempotency_keysテーブル追加。court matches APIでIdempotency-Keyヘッダによる重複実行防止
- **オフライン対応 Phase 1e: エントリーフォーム自動保存（2026-04-07）**: sessionStorageによるフォーム入力の自動保存/復元。リロード時に入力内容が復元される。送信成功後にクリア
- **オフライン対応 Phase 1d: resilient-fetch全画面適用（2026-04-07）**: court/court-index/timer操作の全fetch呼び出しをresilient-fetchに置き換え。リトライ+エラートースト追加
- **オフライン対応 Phase 1c: 接続状態3段階化+Realtime再接続（2026-04-07）**: 接続状態を正常/不安定/オフラインの3段階に拡張。ポーリングの指数バックオフ、onReconnectコールバック、Supabase Realtime再接続対応を追加
- **オフライン対応 Phase 1b: リトライ付きfetchラッパー（2026-04-07）**: lib/resilient-fetch.ts を追加。指数バックオフ+ジッター、AbortSignal対応、5xx/ネットワークエラーのみリトライ
- **レビュー指摘の全問題修正（2026-04-11）**: court/page.tsx のAPI多重実行修正（deps ref化）、admin events の依存配列なしuseEffect修正、E2Eテストの条件付きテストをassertionに変更、テスト未作成7件解消
- **CLAUDE.md: 問題報告義務・先送り禁止ルール追加（2026-04-11）**: レビューで見つけた問題は全て修正してからコミット。問題・警告・懸念は全てユーザーに報告し、自己判断で省略しない
- **管理画面の無限ループ+パフォーマンス修正（2026-04-11）**: useEventLoader/useEventActions の deps オブジェクト参照不安定による無限リクエストループ・毎レンダー callback 再生成を修正。ref パターンで安定化
- **ESLint厳格化: 残13件リファクタリング完了（2026-04-11）**: entry/page.tsx・live/page.tsx・\_group-section.tsx・\_tournament-editor.tsxのmax-lines-per-function/complexity/set-state-in-effect警告をすべて解消。カスタムフック抽出・サブコンポーネント分割・lookup map化で0 warnings達成
- **オフライン対応 Phase 1a: Service Worker + PWA + offlineページ（2026-04-07）**: Serwist によるApp Shellキャッシュ、PWAマニフェスト、オフラインフォールバックページを追加。画面一覧に /offline を追記
- **出場希望ルール「どれでもOK」選択肢（2026-04-11）**: custom_choicesに**any**マーカーを追加し、全ルールにマッチする「どちらでも良い」選択肢を実現。ラベルカスタマイズ可能。extra_fields.rule_anyで全選択との区別
- **テスト参加者の「どちらでもOK」対応（2026-04-12）**: テスト参加者生成で**any**選択肢が有効な場合、一定確率でrule_any=trueの参加者を生成するよう修正
- **メール設定プレースホルダー修正（2026-04-12）**: textarea placeholder の &#10; が JSX で改行として解釈されず文字列表示されていた問題を修正
- **実装完了フロー改善（2026-04-12）**: 8→7ステップに統合。Step 3にformat:check+ESLint+npm ci追加（hook手戻り防止）。Step 4+5をレビューに統合。壊れ方の検証6観点（異常系・波及・N+1・境界値・部分失敗・順序依存）を全回答必須で追加
- **イベント複製の完全化（2026-04-12）**: バナー・OGP画像・メールテンプレート・会場情報・通知メール・締切日時・振り分けルールを常時コピー対象に追加。参加者コピー時はトーナメント・対戦者・試合もコピー（結果はリセット）
- **package-lock.json再生成（2026-04-12）**: Dependabot PRマージで発生した@swc/helpers欠落を修正。CI npm ci失敗の原因
- **Dependabot PR全件対応+メジャー依存更新（2026-04-12）**: @types/node 20→25、TypeScript 5→6のメジャー更新を検証・マージ。supabase-js型変更に伴うテストモック修正（toJSON, success追加）
- **セキュリティチェック体制導入（2026-04-12）**: ESLintセキュリティプラグイン（eslint-plugin-security, eslint-plugin-no-unsanitized）、Semgrep、gitleaks、osv-scanner、CodeQLを導入。pre-commitとCIの両方で自動チェック。husky+lint-stagedでステージファイルのみlint。Dependabotによる依存更新自動化
- **寝技タイマー累積モード（2026-04-12）**: 解除しても経過時間を保持し再開時は続きからカウントする累積モードを追加。タイムアップはブザー通知のみでメインは継続。回数制限との併用可能
- **セキュリティ・品質レビュー修正（2026-04-12）**: 認証のタイミング攻撃対策(timingSafeEqual)、セッション有効期限8時間化、クエリインジェクション防止、全APIハンドラーのRPC/DBエラーチェック追加、fetch res.okチェック漏れ修正、sequential awaitのPromise.all化、UXポリシー準拠(テーマ統一・エラー区別)、テスト追加(tournaments PATCH/DELETE, RPCエラー, UUID検証)
- **Prettier全ファイル適用+ESLint上限調整（2026-04-12）**: Prettier未適用の61ファイルをフォーマット。max-lines-per-function 100→200、max-lines 1600→2100に引き上げ（Prettier展開後の実態に合わせる）。useFormConfig・EntryPageの関数分割リファクタリング。SPEC.md bug_reportsテーブル定義更新、supabase_schema.sqlにbracket_rules/idempotency_keys/event_fighters/event_fighter_rules追加
- **管理画面ハイドレーションエラー修正（2026-04-12）**: AdminPageとSettingsPanelのuseState初期値でwindow.location.searchを参照していたためSSR/クライアント間で不一致が発生。useSearchParamsに移行して修正
- **コード整形・a11y・CLAUDE.md整理（2026-04-12）**: Prettier一括フォーマット反映、htmlFor/aria-label追加、CLAUDE.md簡潔化とCLAUDE_BAK.md分離
- CLAUDE.md修正
- **論理削除（ソフトデリート）導入（2026-04-12）**: 9テーブルにdeleted_atカラム追加。削除操作を物理削除から論理削除に変更。24時間以内は画面から削除取消可能、24時間経過で非表示
- **論理削除UI対応 Phase 2（2026-04-12）**: 管理画面の全一覧でdeleted_atフィルタ追加、削除済みアイテムのグレーアウト表示と削除取消ボタン実装。公開画面では削除済みを完全非表示
- **論理削除 子エンティティUI完了（2026-04-12）**: tournaments/entries/bracket_rulesのグレーアウト+削除取消。form_notices/custom_field_defsのAPIフィルタ。Supabase本番DBマイグレーション適用
- **テンプレート機能・交流会レイアウト・注意機能（2026-04-13）**: タイマープリセット新規作成時にテンプレート選択可能（交流会テンプレート追加）。timer_with_newaza行タイプ（タイマー+寝技横並び）、scoreCenterMode（スコア中央に試合番号表示）追加。注意(caution)機能追加（反則の前段階、黄橙色表示、キーバインドD/K）
- **Vercel重複デプロイ修正（2026-04-13）**: .vercel/project.jsonを削除しCLI経由の重複デプロイを解消。Step 7のvercel lsにスコープ指定追加
