# karate-announce システム仕様書

> **このドキュメントについて**
> 開発の進捗に合わせて随時更新すること。新機能追加・仕様変更・廃止した機能は必ずこのドキュメントに反映する。
> 最終更新: 2026-04-08（テストカバレッジ補完・整合性レビュー修正）

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

| ロール | アクセス先 | 認証 |
|--------|-----------|------|
| **参加者** | `/entry/[eventId]` | なし（URL 直アクセス） |
| **観客** | `/`、`/live` | なし |
| **運営スタッフ（コート担当）** | `/court/[court]` | なし（URL 直アクセス） |
| **タイムキーパー** | `/timer/[courtId]`, `/timer/[courtId]/control` | なし（URL 直アクセス） |
| **管理者** | `/admin/*` | Cookie 認証（ID/パスワード） |

---

## 3. 画面一覧

各画面の詳細仕様は `docs/` 内の個別仕様書を参照。

| 画面 | パス | 認証 | 詳細仕様 |
|------|------|------|----------|
| ホームページ | `/` | なし | — |
| 参加申込フォーム | `/entry/[eventId]` | なし | [ENTRY_FORM_SPEC.md](docs/ENTRY_FORM_SPEC.md) |
| ライブ速報 | `/live` | なし | — |
| コート画面 | `/court/[court]` | なし | [COURT_SPEC.md](docs/COURT_SPEC.md) |
| 統合コート画面 | `/court` | なし | [COURT_SPEC.md](docs/COURT_SPEC.md) |
| タイマー表示 | `/timer/[courtId]` | なし | [TIMER_SPEC.md](docs/TIMER_SPEC.md) |
| タイマー操作 | `/timer/[courtId]/control` | なし | [TIMER_SPEC.md](docs/TIMER_SPEC.md) |
| ショートカット印刷 | `/timer/shortcuts` | なし | [TIMER_SPEC.md](docs/TIMER_SPEC.md) |
| ログイン | `/admin/login` | — | — |
| 管理画面ホーム | `/admin` | Cookie | [EVENT_ADMIN_SPEC.md](docs/EVENT_ADMIN_SPEC.md) |
| 試合詳細 | `/admin/events/[id]` | Cookie | [EVENT_ADMIN_SPEC.md](docs/EVENT_ADMIN_SPEC.md), [BRACKET_SPEC.md](docs/BRACKET_SPEC.md), [BRACKET_VIEW_SPEC.md](docs/BRACKET_VIEW_SPEC.md), [MATCH_LABEL_SPEC.md](docs/MATCH_LABEL_SPEC.md), [FORM_CONFIG_SPEC.md](docs/FORM_CONFIG_SPEC.md) |
| 参加者詳細 | `/admin/events/[id]/entries/[entryId]` | Cookie | [EVENT_ADMIN_SPEC.md](docs/EVENT_ADMIN_SPEC.md) |
| タイマー管理 | `/admin/timer-presets` | Cookie | [TIMER_SPEC.md](docs/TIMER_SPEC.md) |
| 仕様書 | `/admin/spec` | なし（dev） | — |
| オフラインフォールバック | `/offline` | なし | [OFFLINE_SPEC.md](docs/OFFLINE_SPEC.md) |

---

## 4. データモデル

### 4.1 テーブル定義

```sql
-- 流派マスタ
dojos (
  id UUID PK,
  name TEXT NOT NULL UNIQUE,
  name_reading TEXT,        -- TTS 読み仮名
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
  created_at TIMESTAMPTZ
)

-- ルール（部門・クラス）
rules (
  id UUID PK,
  name TEXT NOT NULL,
  name_reading TEXT,            -- TTS 読み仮名
  description TEXT,             -- ルールの説明・詳細（フォーム設定の注意書きにデフォルト挿入される）
  timer_preset_id UUID → timer_presets,  -- 紐付けタイマー（1タイマー:Nルール）
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
```

**Supabase Storage バケット**: `form-notice-images`（公開読み取り）

### 4.2 体格相性レベル

`lib/compatibility.ts` で定義。

| 記号 | 意味 | 判定条件 |
|------|------|---------|
| ◎ ok | 問題なし | 差 ≤ 上限 |
| △ warn | 注意 | 上限 < 差 ≤ 2×上限 |
| ✕ ng | 危険 | 差 > 2×上限 |
| － unknown | データなし | 体重/身長未入力 |

---

## 5. API 仕様

### 5.1 管理者向け API（認証必須）

認証: `verifyAdminAuth()` による Cookie チェック

| メソッド | パス | 概要 |
|---------|------|------|
| POST/DELETE | `/api/admin/login` | ログイン・ログアウト |
| POST | `/api/admin/events` | 大会作成（`copy_from_event_id` 指定で過去大会から複製。`copy_entries` で任意エントリーコピー） |
| PATCH | `/api/admin/events/[id]` | 大会更新 |
| DELETE | `/api/admin/events/[id]` | 大会削除 |
| POST | `/api/admin/dojos` | 流派追加 |
| PATCH/DELETE | `/api/admin/dojos/[id]` | 流派更新・削除 |
| POST | `/api/admin/fighters` | 選手追加 |
| PATCH/DELETE | `/api/admin/fighters/[id]` | 選手更新・削除 |
| POST | `/api/admin/rules` | ルール追加（name, name_reading, description） |
| PATCH/DELETE | `/api/admin/rules/[id]` | ルール更新（name_reading, description）・削除 |
| POST | `/api/admin/entries` | エントリー追加（管理者） |
| PATCH | `/api/admin/entries/[id]` | エントリー更新 |
| DELETE | `/api/admin/entries/[id]` | エントリー削除 |
| POST/DELETE | `/api/admin/entry-rules` | ルール紐付け管理 |
| GET/POST | `/api/admin/bracket-rules` | 振り分けルール一覧取得・作成 |
| PUT/DELETE | `/api/admin/bracket-rules/[id]` | 振り分けルール更新・削除 |
| POST | `/api/admin/tournaments` | トーナメント作成・対戦表生成 |
| PUT | `/api/admin/tournaments/[id]` | トーナメント更新（matches 再作成、id/sort_order/created_at 保持） |
| DELETE | `/api/admin/tournaments/[id]` | トーナメント削除 |
| PATCH | `/api/admin/matches/[id]` | マッチ更新（管理者） |
| POST | `/api/admin/matches/[id]/replace` | マッチの選手差し替え（`{ slot, entry_id }`） |
| POST | `/api/admin/matches/batch` | 試合ラベル一括更新 |
| POST | `/api/admin/matches/swap` | 同一ラウンド内の隣接試合入替 |
| GET/PUT | `/api/admin/settings` | 全体設定（体重差・身長差上限等）の取得・更新 |
| POST/DELETE | `/api/admin/events/[id]/banner` | バナー画像アップロード/削除 |
| POST/DELETE | `/api/admin/events/[id]/ogp` | OGP画像アップロード/削除 |
| GET/POST | `/api/admin/timer-presets` | タイマー一覧取得・新規作成 |
| PATCH/DELETE | `/api/admin/timer-presets/[id]` | タイマー更新・削除 |
| POST | `/api/admin/timer-presets/[id]/duplicate` | タイマー複製 |
| POST/DELETE | `/api/admin/timer-presets/[id]/buzzer` | カスタムブザー音源アップロード/削除 |

### 5.2 コート用 API（認証必須）

| メソッド | パス | 概要 |
|---------|------|------|
| PATCH | `/api/court/matches/[id]` | 試合進行（開始・勝者確定・選手替え・順序入替） |
| PATCH | `/api/court/entries/[id]` | 棄権フラグ更新（`{ is_withdrawn: boolean }`） |

**`/api/court/matches/[id]` の action 一覧**

| action | パラメータ | 説明 |
|--------|-----------|------|
| `start` | `tournamentId` | `status: "ongoing"` に変更。トーナメントも `ongoing` に |
| `set_winner` | `winnerId`, `tournamentId`, `round`, `rounds`, `position` | 勝者確定・次ラウンド進出。最終ラウンドならトーナメントを `finished` に |
| `replace` | `slot`, `newFighterId` | 選手差し替え |
| `edit` | `matchLabel`, `rules` | マッチラベル・ルール変更 |
| `correct_winner` | `winnerId`, `tournamentId`, `round`, `rounds`, `position` | 勝者訂正。次ラウンドが未進行なら選手を差し替え |
| `swap_with` | `otherMatchId` | 試合順序入替（3ステップスワップで `UNIQUE` 制約を回避） |
| `finish_timer` | `winnerId`, `tournamentId`, `round`, `rounds`, `position`, `resultMethod`, `resultDetail` | タイマーからの結果書き戻し。winner_id, status="done", result_method, result_detail を更新。次ラウンド進出も処理 |

### 5.3 公開 API（認証不要）

| メソッド | パス | 概要 |
|---------|------|------|
| POST | `/api/public/entry` | エントリーフォーム送信（extra_fields, form_version 含む） |
| GET | `/api/public/form-config?event_id=xxx` | フォーム設定取得（準備中なら `{ready:false}`） |

### 5.4 フォーム設定管理 API（認証必須）

| メソッド | パス | 概要 |
|---------|------|------|
| GET | `/api/admin/form-config?event_id=xxx` | フォーム設定取得（なければデフォルトで自動作成） |
| PUT | `/api/admin/form-config` | フィールド設定一括更新 |
| PATCH | `/api/admin/form-config` | バージョンインクリメント＆公開 |
| POST | `/api/admin/form-config/copy` | 過去の大会からフォーム設定コピー |
| POST | `/api/admin/form-config/notices` | 注意書き作成 |
| PATCH | `/api/admin/form-config/notices/[id]` | 注意書き更新 |
| DELETE | `/api/admin/form-config/notices/[id]` | 注意書き削除（画像カスケード削除） |
| POST | `/api/admin/form-config/image-upload` | 注意書き画像アップロード（5MB制限、JPEG/PNG/WebP） |
| DELETE | `/api/admin/form-config/image-upload` | 注意書き画像削除 |
| POST | `/api/admin/form-config/custom-fields` | 自由設問追加（custom_field_defs + form_field_configs） |
| DELETE | `/api/admin/form-config/custom-fields` | 自由設問削除 |
| POST | `/api/admin/form-config/custom-fields/duplicate` | 自由設問複製 |

### 5.5 TTS API（認証必須）

| メソッド | パス | 概要 |
|---------|------|------|
| POST | `/api/tts` | OpenAI TTS-1 で音声生成。`{ text, voice, speed }` を受け取り音声 blob を返す。コート画面の TTS prefetch でも使用 |

### 5.6 不具合報告 API

| メソッド | パス | 概要 |
|---------|------|------|
| POST | `/api/bug-reports` | 不具合報告の投稿（公開、認証不要） |
| GET | `/api/bug-reports` | 一覧取得（認証必須） |
| PATCH | `/api/bug-reports/[id]` | ステータス更新（認証必須） |

---

## 6. アナウンス機能仕様

> 詳細は [ANNOUNCE_SPEC.md](docs/ANNOUNCE_SPEC.md) を参照。

### 6.1 TTS 設定

LocalStorage に保存。

| 設定 | キー | デフォルト |
|------|------|-----------|
| 音声 | `tts_voice` | nova |
| 速度 | `tts_speed` | 1.0 |

**音声一覧**

| 値 | 説明 |
|-----|------|
| nova | 女性・明瞭 |
| shimmer | 女性・柔らか |
| alloy | 中性 |
| echo | 男性・軽め |
| fable | 男性・物語風 |
| onyx | 男性・重厚 |

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

| 変数 | 説明 | サンプル値 |
|------|------|-----------|
| `{{試合ラベル}}` | 試合名またはラウンド名 | 準決勝 |
| `{{ルール}}` | ルール名のみ（未設定時は空） | エキスパート |
| `{{選手1名前}}` | 選手1の名前（読み仮名優先） | ふくしまけんしん |
| `{{選手1流派＋道場}}` | 流派と道場を読点でつないだもの | じゅうくうかい、ほんぶどうじょう |
| `{{選手1流派}}` | 選手1の流派のみ | じゅうくうかい |
| `{{選手1道場}}` | 選手1の道場名のみ（ない場合は空） | ほんぶどうじょう |
| `{{選手2名前}}` | 選手2の名前（読み仮名優先） | すずきいちろう |
| `{{選手2流派＋道場}}` | 流派と道場を読点でつないだもの | せいどうかいかん |
| `{{選手2流派}}` | 選手2の流派のみ | せいどうかいかん |
| `{{選手2道場}}` | 選手2の道場名のみ（ない場合は空） | （空） |

**勝者発表テンプレート用変数**

| 変数 | 説明 | サンプル値 |
|------|------|-----------|
| `{{勝者名前}}` | 勝者の名前（読み仮名優先） | ふくしまけんしん |
| `{{勝者流派＋道場}}` | 流派と道場を読点でつないだもの | じゅうくうかい、ほんぶどうじょう |
| `{{勝者流派}}` | 勝者の流派のみ | じゅうくうかい |
| `{{勝者道場}}` | 勝者の道場名のみ（ない場合は空） | ほんぶどうじょう |

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

| 項目 | 仕様 |
|------|------|
| レスポンシブ | スマホ対応必須（参加申込フォーム・コート画面） |
| 横幅統一 | 基本 `max-w-5xl`。参加申込フォーム本体のみ `max-w-md`（入力フォームのため例外）。ライブ速報 `/live` は `max-w-lg`（スマホ最適化のため例外） |
| リアルタイム更新 | ライブ速報: Supabase Realtime（matches テーブル購読）で即時反映 + 5秒ポーリング（フォールバック）。コート画面: 3秒ポーリング、ホーム: 5秒ポーリング。全画面で `visibilitychange` イベントによるタブ復帰時即時リロード対応（モバイルブラウザの `setInterval` 停止対策） |
| ブラウザ互換性 | PostCSS プラグイン `postcss-unwrap-layer.mjs` で Tailwind CSS 4 の `@layer` を除去し Chrome < 99 でもユーティリティクラスが動作。`browserslist` 設定（Chrome >= 80）で `color-mix()` を HEX fallback + `@supports` 段階的強化に自動変換。`globals.css` の CSS 変数フォールバックも安全策として維持。`lang="ja"` + 日本語システムフォント明示指定で CJK 混在テキストのフォント切り替え安定化 |
| カスタムカラー | メイン背景色 `--color-main-bg: #101828`（gray-900 相当）。Tailwind の `bg-main-bg` で全ページ共通使用。カード背景は `bg-gray-800`、ボーダーは `border-gray-700`（参加申込フォームの入力欄は `border-gray-600`）。注意書きは外枠線なし・左ボーダーのみ（`border-l-2 border-yellow-600/40`）で項目の補足情報として表示 |
| LocalStorage 利用 | TTS設定、アナウンステンプレート（試合順序は DB 管理に移行） |
| オフライン対応 | PWA（Serwist による Service Worker）。App Shell キャッシュ + API リクエストキューイング + 楽観的更新。詳細は [OFFLINE_SPEC.md](docs/OFFLINE_SPEC.md) |
| デプロイ | Vercel（karate.naocho.net） |

---

## 9. 開発上の決定事項・設計方針

ユーザーからの要望に基づく仕様決定の履歴。

### 2026-03-22 の決定事項

- **シードマーク廃止**: 参加者一覧の ★/☆ ボタンを削除。不戦勝はトーナメント作成時に対応
- **選手タブ廃止**: FighterPanel（/admin 画面の「選手」タブ）を削除。活用用途がないため
- **「BYE」→「不戦勝」**: システム全体で統一。全画面・全 UI で「不戦勝」と表記
- **欠場機能（2026-03-22 追加）**: `entries.is_withdrawn` フラグで欠場状態を管理。欠場登録した選手は対戦表作成から除外。確定済み対戦表に欠場選手が含まれる場合は警告バナーで「不戦勝にする」「別選手に差し替え」アクションを提供
- **選手差し替えエンドポイント**: `/api/admin/matches/[id]/replace` を新設。差し替え先エントリーから fighter レコードを自動生成（`ensureFighterFromEntry` 共有関数）
- **`lib/ensure-fighter.ts` 抽出**: `ensureFighterFromEntry` をトーナメント作成と選手差し替えで共用するため独立ファイル化
- **確定済み対戦表の「← 登録前に戻る」**: round-1 マッチからペアを復元してフォームに戻す。再登録時は `PUT /api/admin/tournaments/[id]` でトーナメントを更新（`id`・`sort_order`・`created_at` を保持し、matches のみ再作成）。DELETE+POST による並び順崩れを防止
- **体重差・身長差の編集禁止（確定後）**: 確定後はテキスト表示のみ。編集不可
- **コート画面への直接リンク削除**: 試合詳細の確定済み対戦表から「コート画面 →」リンクを廃止
- **ブラケット確定後スクロール**: 「登録する」ボタン押下後、ブラケット表示の先頭に自動スクロール
- **横幅統一**: 全画面 `max-w-5xl`
- **コート画面ブラケット統合（2026-03-22）**: コート画面からトーナメント選択セレクト・対戦カードリストを廃止。コートに紐づく全トーナメントを `sort_order` 順に縦並びで表示し、ブラケット上で全操作（試合開始・勝者確定・棄権トグル・試合順入替）を完結させる
- **赤・白バッジ（2026-03-23）**: ブラケットの各選手スロット左端に赤丸（赤）・白丸（白）バッジを表示。上のスロット = 赤、下のスロット = 白。BracketView 内の凡例（「上の選手（赤）」「下の選手（白）」）で意味を説明。管理画面・コート画面など BracketView を使う全画面で共通表示
- **棄権バッジ（2026-03-22）**: コート画面のブラケット上で棄権状態をバッジ表示。「棄」ボタンで `entries.is_withdrawn` をトグル。視認性向上・操作ミス防止目的（アナウンス自体は通常通り勝者のみ読み上げ）
- **再読み上げ（2026-03-23）**: 試合中のカードフッターに「📢 再読」ボタン（試合開始アナウンス再読）、終了済みカードに「📢 再読」ボタン（勝者アナウンス再読）を追加
- **勝者訂正（2026-03-23）**: 終了済みカードフッターの「訂正」ボタンでカードをオレンジ枠の訂正モードに切り替え。選手スロットをタップして勝者を変更。API `correct_winner` アクションで winner_id を更新し、次ラウンドのマッチが done/ongoing でない場合は選手も差し替え。キャンセルボタンで訂正モード解除
- **棄権バッジ即時反映（2026-03-23）**: 変化検知を `allMatches` のみから `{ allMatches, allEntries }` に拡張。棄権トグル後（matches は変化しない）もポーリングで検知して状態が即時反映されるように修正
- **最終整合性修正（2026-04-07）**: 未実装機能の統合（cacheData/offlineMode/UnifiedStatusBar）、dead export削除、仕様書のステータス更新、各画面仕様書にオフライン参照追加、CLAUDE.mdにエクスポート確認チェックリスト追加
- **レビュー指摘修正: dead code削除・enqueue追加・テスト補完（2026-04-07）**: ConnectionStatusBanner削除、court-index-clientにenqueue追加、resilient-fetchにofflineModeテスト、offline-queueに401/ネットワークエラーテスト追加
- **E2Eテスト修正（2026-04-07）**: entry-form-autosaveテストをテストイベント作成方式に修正、SWテストに開発環境スキップ追加
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
- **オフライン対応 Phase 1a: Service Worker + PWA + offlineページ（2026-04-07）**: Serwist によるApp Shellキャッシュ、PWAマニフェスト、オフラインフォールバックページを追加。画面一覧に /offline を追記
- **SPEC.mdドキュメント修正（2026-04-06）**: §5.2 court API認証記述を修正、§5.5 TTS API認証記述を追加、§5.6 不具合報告APIを追記
- **品質レビュー2回目（2026-04-05）**: supabase_schema.sqlにbuzzer新カラム5つを反映、buzzer_soundデフォルト値を修正
- **品質レビュー対応（2026-04-05）**: court API/TTS APIに認証追加、buzzer旧ID統一、console.log整理、未使用format-other削除、TIMER_SPEC DB定義更新
- **操作説明にブザー音源設定の説明を追加（2026-04-05）**: タイマー設定セクションにブザー音源（30種＋カスタム）・メイン/寝技別設定・連続回数の説明を追加
- **ブザー連続再生の音被り修正（2026-04-05）**: 連続回数2回以上で前の音が鳴り終わる前に次が再生される問題を修正。1回分の再生時間＋0.3秒休止を待ってから次を再生
- **ブザー設定UIレイアウト修正（2026-04-05）**: 音源ドロップダウンの幅比率を2:1:1に調整、min-w-0でオーバーフロー防止
- **ブザー音源30種拡張＋メイン/寝技別設定（2026-04-05）**: 音程3段階×波形3種×パターン3種=27+特殊3=30種。メイン/寝技で別の音源・秒数・連続回数を設定可能。二段三段の音量問題修正
- **寝技回数の+/-ボタンの向き修正（2026-04-05）**: 残り回数ベースで+1=残り増加、-1=残り減少に修正。表示ラベルも「残り」を明記
- **ブザー音源選択・カスタムアップロード機能（2026-04-05）**: 内蔵10種の音源（Web Audio API生成）＋カスタムアップロード＋鳴動秒数設定＋試聴機能。タイマー操作パネルでのカスタム音源プリロード修正
- **不具合修正5件（2026-04-05）**: ウォッチ通知バナー点滅化＋バイブ削除、アイコン⭐に変更、/liveソート固定＋自動スクロール、カスタム音源エラー自動消去、勝敗確定時の寝技ボタン非表示
- **試合速報に選手ウォッチ＋リマインド通知機能を追加（2026-04-05）**: 選手名で検索してウォッチ登録。3試合前にバナー＋バイブで通知。localStorage永続化。勝ち上がり自動監視
- **操作説明ガイド: 試合進行フローの説明改善（2026-04-05）**: タイマー操作をメインの進行方法として先に配置し、コート画面をタイマー不使用時の代替として後に配置
- **操作説明ガイド改善4件（2026-04-05）**: セクション色を統一、複数セクション同時展開対応、タイマー説明を1プリセット構成に書き直し、流派ラベルを「任意」に変更
- **CLAUDE.md Step 3 に tsc 型チェック必須化（2026-04-04）**: npx tsc --noEmit をStep 3の確認項目に追加。vitest通過でもtsc型チェックで失敗するケースの再発防止
- **GitHub Actions 型エラー修正（2026-04-04）**: rule-grouping.test.ts の Entry/Rule テストデータに不足していた extra_fields, form_version, name_reading, timer_preset_id, created_at を追加
- **操作説明ガイドのナビボタン区切り改善（2026-04-04）**: ナビゲーションボタンを区切り線＋右寄せ＋アイコン付きにして、モックアップUIと視覚的に分離
- **操作説明ガイド修正（2026-04-04）**: 「空手大会」→「武道大会」に変更。ルール説明欄の案内文を修正（タイマー名に関する誤解を招く記述を削除）
- **操作説明ガイドの全面更新（2026-04-04）**: 2部構成（事前設定5項目＋運営フロー7項目）に再構築。各設定がどこで使われるかの相互参照、具体的な手順、注意点、モックアップを追加
- **トップページ文言修正（2026-04-03）**: 「アクティブな試合がありません」→「開催中の試合はありません」に変更。未開催時の管理画面誘導リンクを削除
- **コート自動振り分け機能（2026-04-03）**: 未割当トーナメントを各コートの試合数が均等になるようグリーディ法で自動振り分け。ボタンはタイム見積もりパネル内に配置
- **対戦表作成のコート依存を解消（2026-04-03）**: トーナメント作成をコートに依存しないフラット構造に変更。コート割当は各トーナメントのドロップダウンで後から設定。CourtSection → TournamentEditor にリネーム。タイム見積もりをコートごとのサマリー表示に変更
- **学年フィルタで年齢ベース区分を概算年齢で判定（2026-04-03）**: 上限=高3なら概算18歳超の一般・シニアを除外。下限=年少なら概算3歳未満を除外
- **対戦表フィルタ・ソートのテスト充実（2026-04-03）**: gradeFilterPredicate と buildFilterSortComparator のテストを22件→44件に拡充。混合フィルタ、境界値、null値、概算年齢、空ageCategories等をカバー
- **学年フィルタで年齢ベース区分が除外される不具合修正（2026-04-03）**: 学年ベースフィルタ時に一般・シニア等の年齢ベース区分エントリーが除外されないよう修正
- **選手リストのデフォルトソート（2026-04-03）**: フィルタなし時のデフォルトを年齢昇順に変更。体重フィルタ設定時は体重優先
- **「その他」値の表示変換（2026-04-03）**: `other:xxx` 形式で保存された値を確認メール・CSV・申込詳細画面で「その他: xxx」に変換して表示
- **チェックボックス「その他」テキスト入力の必須判定（2026-04-03）**: 「その他」テキストのみ入力時も必須チェックを通過するよう修正
- **確認メールの改行値フォーマット統一（2026-04-03）**: テキストエリア等の改行を含む値を `ラベル:\n  行1\n  行2` 形式に統一。配列値と同じインデント付き表示にする
- **CSV複数選択の区切りを改行に変更（2026-04-03）**: 複数選択項目のCSV出力をセミコロン区切りから改行区切りに変更。テキストエリアと同様にセル内改行で表示される
- **よみがな必須の親フィールド連動（2026-04-03）**: 親フィールド（所属団体・道場支部名）が任意の場合、よみがなフィールドも自動的に任意になる（必須マーク非表示・バリデーションスキップ）
- **棄権選手の勝者選択無効化（2026-03-23）**: 試合中（ongoing）に棄権中の選手スロットはクリック不可・半透明の disabled 表示。棄権していない選手のみクリックして勝者確定できる
- **試合順入替 DB 対応（2026-03-22）**: 試合順序の入替を LocalStorage から DB の `matches.position` 更新に変更。`UNIQUE(tournament_id, round, position)` 制約を回避するため 3 ステップスワップ（tmpPos=99999 を経由）
- **ローディングオーバーレイ（2026-03-22）**: ブラケット操作時に処理中カードへスピナーオーバーレイを表示。`processingMatchIds: Set<string>` で複数カードの処理状態を管理
- **`/api/court/entries/[id]` 追加（2026-03-22）**: 棄権フラグ更新用エンドポイント。`supabaseAdmin` を使用
- **トーナメント選択ラベル（廃止）**: コート画面のセレクトUIを廃止。全トーナメント縦並び表示に変更
- **エントリーフォームの所属欄レイアウト**: 流派｜道場を横並び（姓名と同じ構造）に変更
- **必須マーカー廃止・任意ラベル**: 赤い `*` を全廃。任意項目のみ「（任意）」と表記
- **体重・身長の注意書き**: 道着着用時・当日計量・失格リスクを黄色スタイルで表示
- **備考の注意書き**: 主催者確認・確約できない旨を黄色スタイルで表示
- **注意書きスタイル統一**: `text-xs text-yellow-500/80 bg-yellow-900/20 rounded-lg px-3 py-2`
- **`{{ルール}}` 変数**: ルール名のみ展開（「ルール、エキスパート。」は廃止し「エキスパートルール」のようにテンプレート側で制御）
- **変数名の変更**: `選手1所属` → `選手1流派＋道場`（所属という表現を廃止）
- **変数一覧の統合**: 説明とサンプル値を一つのリストに統合表示
- **流派選択時の読み仮名自動入力**: 既存エントリーの reading map から補完。ドロップダウン選択時は常に上書き

### 2026-03-24 の決定事項

- **アナウンステンプレートのDB化**: `/admin` のテンプレート設定を localStorage から DB（`settings` テーブル）に移行。`key = 'announce_templates'`, `value = JSONB` で保存。`GET /api/admin/settings` で全デバイス共通に取得、`PUT /api/admin/settings` で保存（admin 認証必要）。コート画面・管理画面ともに起動時に API からロードして使用。TTS音声・速度・ミュート状態はデバイス固有のためlocalStorageのまま維持
- **`court-settings.ts` 削除**: 未使用ファイル。コート数・コート名はすでに `events` テーブルでDB管理されている
- **ファビコン設定**: `app/icon.png` に柔空会（ju-ku.club）のファビコンを配置。Next.js App Router が自動でファビコンとして認識
- **対戦表確定後スクロール改善**: 「登録する」ボタン押下後、コートセクション先頭ではなく**新規作成したトーナメントの先頭**に自動スクロール。API レスポンスから作成されたトーナメント ID を取得し、DOM の `id="tournament-{id}"` 要素にスクロール
- **次アクション誘導バナー**: ① 全エントリーが対戦表に割り当て済みになると Step 2 に緑バナー「全員の対戦表が確定しました。試合番号を設定してください。」＋「③ 試合番号設定へ →」リンクを表示。② 全試合の試合番号が DB 保存済みになると Step 3 に緑バナー「準備完了！大会をアクティブに設定すると試合を開始できます。」＋`/admin?tab=events`（試合一覧）へのリンクを表示
- **コート画面アクセス制限**: アクティブなイベント（`is_active = true`）が存在しない場合、コート画面（`/court/[court]`）に🔒ロック画面を表示し操作不可。`is_active` の確認はトーナメントの join ではなく events テーブルへの独立したクエリで行う（join が null を返すと誤判定するバグを修正）
- **統合アナウンス画面 `/court`**: アクティブなイベントの全コートを1画面に表示する統合ビュー。コートごとに `CourtPanel` コンポーネントで独立してデータ管理・操作（試合開始・勝者確定・棄権・アナウンス）を行う。`is_active` でないイベントはロック画面を表示
- **ホームページ (`/`) のコート表示改善**: コートごとに全トーナメントを表示（従来は1トーナメントのみ）。試合一覧を `MatchTable` から読み取り専用 `BracketView` に変更。5秒ポーリングで自動更新

### 2026-03-23 の決定事項（管理画面リニューアル）

- **試合詳細画面の3ステップ化**: 「参加者管理」「対戦表作成」「試合番号設定」の3ステップ。基本設定（開催日・コート名）はステップ外でインライン編集。トーナメントが存在する場合はロード時にステップ②を自動選択。ステップ③はトーナメント未作成時は非活性
- **参加受付締め切り機能**: `events.entry_closed BOOLEAN NOT NULL DEFAULT false` を追加。管理者がステップ2のボタンで自由にON/OFF切り替え。締め切り中は公開フォームにロック画面表示、API送信も403拒否
- **変更検知バナー**: ステップ3で「トーナメント作成後に新規参加者追加」または「欠場者あり」の場合に黄色警告バナーを表示
- **ダッシュボードパネル**: ステップ3の先頭にルール別参加者統計を表示（組み合わせ提案はおすすめ振り分けダイアログに統合）
- **組み合わせ提案アルゴリズム（階級分け）**: 体重をメインとし、年齢・性別・経歴・体格（身長）・段級で分割してバランス評価（◎△✕）。体重: 45/50/55/60/65/70/75/80kg、年齢: 15/18/20/25/30/31/35/40/45歳、身長: 155/160/165/170/175/180cm、経験: 3/5/7/10年、性別: 男女。2名未満グループの提案は除外。最大8件表示。参加者分布パネル（`RuleDistributionPanel`）で利用
- **フィルター拡張**: 身長範囲・経験・年代区分フィルタをトーナメント作成UIに追加。フィルター条件はDBに永続化（`filter_experience`, `filter_grade`, `filter_min_grade`, `filter_max_grade`, `filter_min_height`, `filter_max_height`）
- **年代フィルタ**: 下限・上限レンジ（`minGrade`/`maxGrade`）で範囲指定。学年ベース区分（年少〜高3）は `gradeToNumber()` で数値変換してフィルタ、年齢ベース区分は `findAgeCategory()` で取得した `minAge`/`maxAge` で entry の `age` をフィルタ。年齢ベース区分選択時は単一セレクト化（年齢自動入力は廃止）
- **フィルタ並び順**: 年代 → 年齢 → 体重 → 身長 → 性別 → 経験 → 名前 → 試合数。トーナメント名への反映は年代・年齢・体重・身長・性別のみ（経験・名前・試合数は除外）
- **トーナメント名自動生成**: フィルター条件からトーナメント名を自動生成（例: 「小1〜小4 男子 18歳以上 75kg以上」）。手動で名前を編集すると自動生成を停止

### 2026-03-28 巨大ファイル分割リファクタリング

機能変更なし。implementer の実行速度向上を目的に、巨大な2ファイルをコンポーネント単位で分割。

**`app/admin/events/[id]/page.tsx`（3,594行 → 約350行）**
- `components/participant-section.tsx` — Step1 参加者管理（フォーム設定、メール設定、参加受付、参加者一覧、CSV出力、テスト参加者生成）
- `components/bracket-section.tsx` — Step2 対戦表作成（ダッシュボード、参加者分布、コート別対戦表、グループ編集、確定済み対戦表）
- `components/match-label-section.tsx` — Step3 試合番号設定（コートタブ + MatchLabelEditor）
- page.tsx には共通 state、load()、StepNav、レイアウト、メタ情報編集のみ残留

**`app/admin/page.tsx`（2,278行 → 約120行）**
- `components/home-dashboard-panel.tsx` — ホームタブ（進行中試合パネル、次の試合、要対応）
- `components/events-panel.tsx` — 試合タブ（CRUD、複製、アクティブ切替）
- `components/settings-panel.tsx` — 設定タブ（アナウンス、ルール、流派、タイマー、年代区分、不具合報告）
- `components/guide-panel.tsx` — 操作説明タブ（6ステップガイド、相性マーク凡例）
- page.tsx にはタブ切替、ログアウト、バージョン表示のみ残留

---

## 10. スキーマ管理方針

- `supabase_schema.sql`: 現在の DB の「あるべき姿」を常に反映する参照用ファイル
- `supabase/migrations/`: 変更差分を `NNNN_description.sql` 形式で蓄積
- Claude Code がスキーマ変更を行うとき: 両ファイルを同時に更新し、`supabase db push` を実行する（PostToolUse hook で自動実行）

---

## 11. Claude Code 自動化フック（`~/.claude/settings.json`）

### Stop hook（会話終了時に `~/.claude/predeploy.sh` → `~/.claude/karate-predeploy.sh` を実行）

会話終了時に自動でデプロイパイプラインを実行する。トリガーファイルに依存せず、常に呼び出される。

**`karate-predeploy.sh` の処理フロー:**
1. **SPEC.md チェック**: `/tmp/karate-spec-needed` が残っていたらエラーで停止（SPEC.md 未更新はデプロイ不可）
2. **未コミット変更チェック**: `git diff` で変更が残っていたらエラーで停止（コミットを促す）
3. **未プッシュ確認**: `git log origin/main..HEAD` で未プッシュコミットがなければデプロイ不要で終了
4. **排他ロック**: コミットハッシュ単位のロックファイル（`/tmp/karate-deploy-{hash}`）で同一コミットの多重デプロイを防止
5. **ビルド**: `npm run build`
6. **プッシュ**: `git push origin main`（Vercel の GitHub 連携が自動デプロイ）

**注意**: `vercel --prod` は使用しない。GitHub 連携と CLI の両方でデプロイすると二重デプロイになるため。

### 過去の変更

- ルール・タイマー設定の改善（5件）:
  - ルール画面のタイマー設定UIデザイン改善: プルダウン常時表示を廃止。タイマー未設定時は「タイマーを設定する」ボタン、設定済みは「タイマー名 + 変更/解除ボタン」を表示
  - タイマー1:ルールNの関係に修正: `rules.timer_preset_id` カラム追加。ルール側からタイマーを参照する形に変更し、1つのタイマーを複数ルールで共有可能に。操作画面の `getPresetForMatch` を `rulePresetMap` 方式に変更
  - システム全体のスピナー漏れ再チェック: `timer-presets-panel.tsx` の削除（`deletingId`）・複製（`duplicatingId`）にローディング状態を追加
  - タイマー複製が末尾に追加: 一覧のソート順を `created_at ASC` に変更し、複製・新規作成が末尾に表示されるよう修正
  - 赤白の左右入れ替え機能: 操作画面の試合一覧上部にボタンとして配置（プリセット設定から移動）。コート単位でセッション中保持。入替時はタイマー表示・ミニプレビュー・スコア操作・試合結果がすべて連動
- `entries.is_seed` カラム削除済み（`supabase/migrations/0002_drop_is_seed.sql`）
- `lib/entry-utils.ts` 削除済み（`ensureFighterFromEntry` は `lib/ensure-fighter.ts` に移動）
- `/live` アクセス制御: アクティブな大会がない場合はゲート画面表示（認証不要）
- `matchLabelNum` ユーティリティを `lib/match-utils.ts` に共通化（コート画面・ライブ速報で共用）
- 全画面に `visibilitychange` イベントリスナー追加（モバイルブラウザのバックグラウンドタブ復帰時に即時リロード）
- 古いChrome互換性包括対応: PostCSS で `@layer` 除去（Chrome < 99 対策）、`browserslist` で `color-mix()` を HEX fallback 化（Chrome < 111 対策）、`lang="ja"` + 日本語フォント明示（CJK混在テキスト対策）
- 背景色: カスタムカラー `--color-main-bg` を `#101828`（gray-900 相当）に変更し、全ページのメイン背景に適用。カード・ボーダー・テキスト色は変更なし（視覚的階層を維持）
- 参加申込フォームの項目ラベル編集機能: `form_field_configs.custom_label` カラム追加。管理画面でラベルをクリックすると編集可能。参加申込フォームに反映される
- 過去の大会から複製機能: 試合タブの各大会に「複製」ボタン追加。大会名・コート設定・ルール・フォーム設定をコピーして新規作成。参加者は任意コピー（警告付き）
- ルール説明機能: `rules` テーブルに `description` カラム追加。設定タブのルール管理でルールごとに説明・詳細を登録可能。フォーム設定初回作成時に `description` が設定されたルールの説明を `rule_preference` フィールドのデフォルト注意書きとして自動挿入
- コントラスト改善（参加申込フォーム）: メインラベルを `text-gray-300`、サブラベル（姓・名等）を `text-gray-400` に引き上げ。注意書きカード枠線を `border-gray-500`、入力欄枠線を `border-gray-600` に変更
- コントラスト改善（管理画面フォーム設定）: フィールドカードの枠線を `border-gray-500`（非表示時は `border-gray-600/40`）に強化、ボディに `bg-gray-800/40` 背景を追加してカード内外を明確化。メインラベルを `text-gray-200`、サブラベル（姓・名・読み等）を `text-gray-400` に引き上げ
- 設定タブのサブタブを `grid` 均等割レイアウトに変更（横幅をタブ数で等分）
- 自由設問（カスタムフィールド）機能: 管理者がフォーム設定画面から任意の項目（テキスト・数値・選択肢等）を追加・削除・複製可能。`custom_field_defs` テーブルで定義を管理し、入力値は `entries.extra_fields` JSONB に格納。GIN インデックスで検索可能。大会複製時にもコピーされる
- 自由設問の統合管理: 大会ごとに聞くか変わる11項目（保護者名、試合経験、希望試合数、頭突き希望、防具関連）を FIELD_POOL から `custom_field_defs` に移行。管理者追加の `custom_*` フィールドと同等に削除・複製が可能。field_key は既存のまま維持し `extra_fields` との互換性を保持。固定項目（氏名、性別、年齢、身長、体重、所属、ルール、連絡先等）はバッジなし・削除不可。既存大会はフォーム設定アクセス時に `custom_field_defs` を自動補完
- 参加申込フォームUI改善: birthday/age を2列グリッドに統合表示（管理画面プレビューと同一レイアウト）、注意書きの外枠線を削除し左ボーダーのみで項目の補足情報感を演出、フィールド間の間隔を `space-y-4` → `space-y-6` に拡大してすっきりした印象に
- 所属団体の読み仮名欄を常時表示に変更（マスタ選択時は読み仮名を自動入力、手動編集も可能）
- 参加申込フォームのバリデーション改善: ボタンを常に押下可能にし、押下時にバリデーションエラーを表示。エラーサマリー + フィールド個別エラー（赤枠・メッセージ）+ 最初のエラー箇所への自動スクロール。値入力時にリアルタイムでエラークリア
- TTS読み上げ改善: ルール名の読み仮名（`rules.name_reading`）をアナウンスに反映。試合ラベル（「決勝」「第1試合」等）の読み仮名自動変換（`normalizeMatchLabelForTts`）を追加
- 参加者一覧のメモボタン分離: 申込備考ボタン（あるときのみ表示）と管理者メモボタン（「メモ記入」/「メモあり」）を個別に表示。選手名クリックで詳細画面に遷移
- 参加者詳細画面（`/admin/events/[id]/entries/[entryId]`）: フォーム設定全項目を表示、読み仮名統合、管理者メモ編集可能
- 不具合報告管理パネル（`BugReportsPanel`）: 設定タブの「不具合報告」サブタブ（開発モード限定）で報告一覧を閲覧・ステータス更新・対応内容記録。`PATCH /api/bug-reports/[id]` で status/resolution/fixed_in_version を更新。フィルタ（全件/未対応/対応済み/対応しない）、展開式カード、相対時間表示。Agent Dashboard へのリンク（`NEXT_PUBLIC_AGENT_DASHBOARD_URL` 環境変数、デフォルト `http://localhost:3456`）
- ワンマッチ重複チェック: 同じルール内で同じ対戦相手の組み合わせが既に登録済みの場合は409で拒否（`tournaments/route.ts`）。フロントでもエラーをalert表示
- ワンマッチUI改善: ワンマッチモード時は「手動で対戦を追加」ボタンを非表示。全グループがワンマッチの場合は「トーナメントを追加/ワンマッチを追加」ボタンを非表示
- 受付締切後ガイド: 参加受付を締め切った直後に「② 対戦表作成へ →」のネクストアクション案内を表示
- デモエントリー年齢分布改善: 小学生30%・中高生25%・成人25%・中高年20%の年齢分布。年齢に応じた体重・身長レンジ。年代区分（幼稚園〜高校・18歳未満・一般・シニア）を自動設定
- 対戦表確定判定修正: `allEntriesAssigned` で `fighter_id` 未設定のエントリーも未割当として正しくカウント
- パンくずナビゲーション: 全管理画面ページの「← 戻る」をパンくず形式（`管理画面 / 試合 / {イベント名}`）に変更。`/admin/timer-presets` に戻るリンク追加。参加者詳細は4階層パンくず
- 振り分けルールによる全自動対戦表作成の高度化: `bracket_rules` テーブル追加。年齢・体重・身長・性別・学年差等の条件で選手を自動グループ分け。ダイアログでプレビュー確認後、コート割り当て付きで一括トーナメント作成。`lib/auto-bracket.ts` で振り分けロジック、`components/bracket-rules-panel.tsx` で設定UI、`components/auto-create-dialog.tsx` で確認ダイアログを実装
- 振り分けルール複製機能: 各ルールカードに「複製」ボタンを追加。全フィールドをコピーして名前に「（コピー）」を付与した新規作成フォームを表示
- バージョン表示の遅延表示化: 管理画面のバージョン表示を `DelayedVersion` コンポーネントに分離し、1.5秒遅延で表示。読み込み中にコミットハッシュが目立つ問題を解消
- 対戦表作成UX改善（3件）:
  - ボタン文言変更: 「全自動で対戦表を作成」→「振り分けルールで対戦表を作成」に変更。振り分けルール0件の場合は「振り分けルールを登録して対戦表を作成」に変更し、振り分けルールタブへ遷移
  - 手動絞り込みからの振り分けルール登録: トーナメント確定後、フィルタ条件が設定されている場合に振り分けルールとして保存するか確認ダイアログを表示
  - 参加者分布パネル: `computeSuggestions()` を `lib/suggestions.ts` に抽出。CourtSection 内の `DistributionPanel` で参加者の体重・年齢・性別・身長・経験の分布を折りたたみ式で表示（対戦表作成は「振り分けルールで作成」に一本化）
- iOSフォーカス時自動ズーム防止: viewport に `maximum-scale=1` を設定（`app/layout.tsx` で `Viewport` export）。モバイル（1024px以下）で input/select/textarea のフォントサイズを 16px に強制（`app/globals.css`）。iOS が font-size 16px 未満の入力欄でフォーカス時に自動ズームする問題を解消
- E2Eテスト修正（7件）: UI変更（パンくずナビ追加・タイマーサブタブのインライン化・ホームタブのボタン名衝突）に追従。ボタンセレクタに `exact: true` 追加、タイマーサブタブの遷移先をインライン表示に変更、「設定に戻る」ボタンをパンくずリンクに変更、イベント一覧確認先を試合タブに変更、スコア表示のセレクタを限定化、`adminLogin` に `networkidle` 待機追加
- E2Eテスト大幅拡充（29テスト追加、8ファイル新規）: エントリーフォーム（表示・バリデーション・メール確認・送信）、対戦表作成（参加者追加・振り分けルール・ワンマッチ・削除）、試合進行（試合開始・勝者設定・次ラウンド進出・勝者訂正）、イベント管理（編集・複製・アクティブ切替・削除・受付開始/終了）、参加者管理（一覧・追加・欠場切替・詳細）、設定（ルールCRUD・流派CRUD・アナウンス設定）、フォーム設定（フィールド表示/非表示・カスタムフィールド・公開）、ライブ・表示（ライブ画面・ホーム対戦表・コート複数トーナメント）。CLAUDE.mdにE2Eテストルールを追記
- E2Eテスト flaky 修正（3ファイル）: 並列テスト間でアクティブイベントが排他的に切り替わることによる競合を解消。固定 `waitForTimeout` を `toPass` リトライパターンに置換し、リトライ内で `is_active` を再設定してからリロードする方式に変更。対象: `match-progression.spec.ts`（勝者設定後の次ラウンド進出）、`live-and-display.spec.ts`（ホーム対戦表・コート複数トーナメント）、`event-management.spec.ts`（アクティブ/非アクティブ切替）
- 不具合6件一括修正:
  - フォーム設定の公開前自動保存: `toggleReady()` で未保存の変更がある場合に自動で PUT（保存）を実行してから PATCH（公開）する
  - フォーム設定パネルのレイアウト調整: 空の左側 div を削除し、ボタン群を左寄せに配置
  - 受付ボタンの3段階フロー: フォーム未公開時は「準備中」表示（灰色バッジ）、公開後に「受付中」（緑）、締切後に「受付終了」（赤）
  - フィルタ並び順変更: 年代 → 年齢 → 体重 → 身長 → 性別 → 経験 → 名前。トーナメント名反映は年代・年齢・体重・身長・性別のみ
  - 年代フィルタをレンジ化: `gradeFilter`（単一セレクト）→ `minGrade`/`maxGrade`（範囲セレクト）に変更。`gradeToNumber()` で範囲フィルタリング。DB に `filter_min_grade`/`filter_max_grade` カラム追加
  - テスト参加者のダブルエントリー: ルール2件以上の場合、約30%の参加者に複数ルール割り当てを生成
- 年代区分フィールド改善: `grade`（学年）をフリーテキストからセレクト（ドロップダウン）に変更。表示名を「年代区分」に変更。固定選択肢（年少〜中3）+ 年齢ベース区分（18歳未満/一般/シニア）。設定タブに「年代区分」サブタブを追加し年齢ベース区分の編集UI（追加・編集・削除・デフォルトリセット）を提供。`lib/grade-options.ts` に選択肢生成ユーティリティを新設。`gradeToNumber` を幼稚園対応（年少=-2, 年中=-1, 年長=0）に拡張。対戦表フィルタと管理画面の参加者追加フォームもセレクト化。デモエントリーに幼稚園・年齢ベース区分を追加
- フォーム設定バージョン・ステータス表示修正: バージョン初期値を1→0に変更（初回公開でv1に）。DB DEFAULT変更+既存未公開データを0に更新。折りたたみヘッダーの `FormConfigStatusBadge` にバージョン表示を統合（v0=「未公開」、v1以降=「vN」）。展開内パネルのステータスバッジ・タイトル・バージョン表示を削除しヘッダーとの重複を解消
- UI一貫性・品質改善: `lib/ui-constants.ts` にスタイル定数（`BTN`/`INPUT`/`BADGE`）を新設。ボタン文言統一（「一時保存」→「保存」、「設定完了」→「公開する」、「設定を取り消す」→「公開を取り消す」、「閉じる」→「キャンセル」、「保存しました ✓」→「保存しました」）。削除確認メッセージを「〇〇を削除しますか？」形式に統一。`disabled:opacity-40`/`disabled:opacity-30`/`disabled:opacity-20` → 全て `disabled:opacity-50` に統一。欠場バッジを `bg-orange-900 text-orange-300` → `bg-red-900 text-red-300`（`BADGE.error`）に変更
- イベントフェーズ6段階化: ヘッダーバッジを3段階（準備中/受付中/受付終了）から6段階（準備中/受付中/対戦表作成中/試合準備中/試合中/試合終了）に拡張。`lib/event-phase.ts` に `getEventPhase()` を新設し、既存データ（event, formConfigReady, tournaments, matchRows）から自動判定。ステップナビに現在フェーズ対応ステップのリングハイライトを追加
- 経験フィールドの分布表示を「参考」扱いに変更: `DistributionPanel` で経験軸を他の軸と区切り線で分離し、「（参考）」ラベルを付与。薄い色で控えめに表示（`opacity-60`、バランス指標は常に灰色）。軸の表示順を体重→年齢→性別→身長→経験に固定
- 不具合6件一括修正（対戦表作成UI）:
  - ボタン文言変更: 「確定する」→「登録する」、「確定前に戻る」→「登録前に戻る」に統一
  - 参加者分布パネルをルール別に: `DistributionPanel`（CourtSection内）を `RuleDistributionPanel`（DashboardPanel下・ルール別セクション表示）に置換
  - 選手プルダウンにフィルタ条件適用: `e1Options`/`e2Options` の構築で `unassigned` → `filteredUnassigned` に変更し、絞り込み条件を反映
  - 1ペア自動ワンマッチ化: `confirm()` 内で `pairs.length === 1` のトーナメントを自動で `type: "one_match"` に変更
  - 複数トーナメント並び順保持: `confirm()` 内で新規追加時は既存トーナメントの最大 `sort_order` + `groupIndex` + 1 を設定、編集時は `editingSortOrder` を使用して元の位置を保持
  - 振り分けルールボタン文言変更: 「振り分けルールを登録して対戦表を作成」→「振り分けルールを登録する」、「振り分けルールで対戦表を作成」→「登録済み振り分けルールで対戦表を作成」

- 振り分けルールに年代範囲（min_grade/max_grade）を追加: `bracket_rules` テーブルに `min_grade`/`max_grade` カラムを追加。型定義・API POST/PUT・UIフォーム（セレクトボックス2つ）・一覧表示・auto-bracket の `matchesRule()` に年代フィルタを追加。`AutoCreateDialog` のルール詳細表示にも年代範囲を表示。トーナメント確定時の振り分けルール保存にも min_grade/max_grade を含める
- 全ボタン・操作にローディング表示を統一追加: 非同期操作を行う全ボタンに `disabled` + テキスト変更（「処理中...」「削除中...」等）を追加。対象16箇所:
  - `/admin` ページ: ログアウト（`loggingOut`）、流派読み仮名更新（ReadingInput の `saving`）、ルール読み仮名更新（ReadingInput の `saving`）、ルール説明更新（DescriptionInput の `saving`）、タイマー紐付け（`linkingRuleId`）、イベント再開（`reopeningId`）
  - `timer-presets-panel.tsx`: 削除（`deletingId`）、複製（`duplicatingId`）
  - `bracket-rules-panel.tsx`: 並び替え（`movingId`）、削除（`deletingId`）
  - `form-config-panel.tsx`: 公開/取消（`togglingReady`）、過去大会コピー（`copying`）、自由設問追加（既存 `adding`）、自由設問削除（`deletingCustomKey`）、自由設問複製（`duplicatingCustomKey`）
  - `/admin/events/[id]` ページ: バナー/OGP画像削除（`deletingImageType`）
  - `auto-create-dialog.tsx`: 対戦表作成実行（`executing`）
  - ReadingInput / DescriptionInput コンポーネントを非同期対応化（`onSave` を `Promise<void> | void` に変更、保存中は入力欄とボタンを disabled 化）
- 年代フィルタ・時間見積もり・UI統一の修正5件:
  - カスタム年代区分のプルダウン反映: `getGradeOptions()` の呼び出し箇所すべてで `settings` テーブルの `age_categories` を渡すよう修正。対象: イベント管理画面（参加者追加フォーム・絞り込みフィルタ・振り分けルール編集）および参加申込フォーム
  - 年齢ベース区分フィルタロジック修正: `gradeToNumber()` が null を返す年齢ベース区分の場合、`findAgeCategory()` で取得した `minAge`/`maxAge` で entry の `age` をフィルタ。`auto-bracket.ts` の `matchesRule()` も同様に対応
  - 年齢ベース区分選択時の単一セレクト化: 年代フィルタで年齢ベース区分を選択すると下限・上限が同じ値にセットされ単一セレクト表示に切り替わる（年齢自動入力は廃止）
  - 振り分けルール編集フォームの項目並び統一: 名前→対象ルール→年代→年齢→体重→身長→性別→最大差→コートの順にフィルタUIと統一
  - 試合時間見積もり修正+内訳表示: インターバルを `試合数-1` 回に修正。`formatTimeEstimate` に内訳テキスト（例: `8試合 × 3分 + 試合間1分 × 7 = 45分`）を追加
  - `lib/grade-options.ts` に `isAgeCategoryLabel()` / `findAgeCategory()` ヘルパー追加
- 絞り込み強化（試合決定数フィルタ・選手個別選択・フィルタ連動ソート）:
  - 試合決定数フィルタ: `GroupFilters` に `matchCountFilter` を追加。「全て」「未達」「0試合」〜「9試合」のセレクトボックス。フィルタロジックは `matchCountFilterPredicate()` として `lib/group-filter-sort.ts` に切り出し
  - 選手個別選択ペアリング: 選手チップクリックで選択/解除（青枠表示）。`selectedEntryIds: Set<string>` で管理。「全選択」「全解除」ボタン。ペアリングボタンを「全員」「選択のみ」の2つに分離
  - フィルタ連動ソート: 使用中のフィルタに応じて選手チップの並び順を変更。ソートロジックは `buildFilterSortComparator()` として `lib/group-filter-sort.ts` に切り出し。年代→年齢→体重→身長の優先順、フィルタなしは氏名順
- セレクト解除ボタン・年代セレクト仕様変更:
  - セレクト解除ボタン: 年代下限/上限・性別・試合数のセレクトに値選択時、右端に×ボタンを表示しクリックでデフォルト値にリセット
  - `FIXED_GRADE_OPTIONS` に高校（高1/高2/高3）を追加（計15項目）。`gradeToNumber()` は既に高校対応済み
  - 年齢ベース区分（一般/シニア等）選択時は単一セレクト化: 下限または上限で選択すると両方が同値にセットされ、「〜」と上限セレクトを非表示
  - 年齢自動入力の廃止: 年齢ベース区分選択時の `findAgeCategory` → `setMinAge`/`setMaxAge` 呼び出しを削除。年齢フィルタは独立して手動入力のみ

---

## 12. 環境変数

| 変数名 | 説明 | 利用側 |
|--------|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL | クライアント |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 公開キー | クライアント |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase サービスロールキー | サーバー (API) |
| `OPENAI_API_KEY` | OpenAI API キー | サーバー (TTS API) |
| `ADMIN_USERNAME` | 管理者ユーザー名（未設定時は `"admin"`） | サーバー (認証) |
| `ADMIN_PASSWORD` | 管理者パスワード（未設定時はローカル開発として認証スキップ） | サーバー (認証) |
| `RESEND_API_KEY` | Resend メール送信 API キー（未設定時はメール送信をスキップ） | サーバー (メール) |
| `RESEND_FROM_EMAIL` | メール送信元アドレス（未設定時は `onboarding@resend.dev`） | サーバー (メール) |

---

## 13. テスト戦略

### 13.1 テストフレームワーク

| レイヤー | ツール | 設定ファイル |
|---------|--------|-------------|
| 単体テスト | Vitest + happy-dom | `vitest.config.ts` |
| E2E テスト | Playwright (Chromium) + dotenv | `playwright.config.ts`（`.env.local` を自動読み込み） |
| CI/CD | GitHub Actions | `.github/workflows/test.yml` |

### 13.2 テスト構成

```
__tests__/
  unit/           # 単体テスト（Vitest）
    timer-state.test.ts      # タイマーステートマシン（状態遷移・スコア・自動判定・Undo・延長・寝技）
    timer-broadcast.test.ts  # localStorage 永続化・排他制御フラグ・BroadcastChannel
    timer-control-display.test.ts # タイマー操作・表示画面（全角変換・勝利方法ラベル・一本直接実行・スコア表示ロジック・次の試合へ表示条件・寝技残回数）
    types.test.ts            # ユーティリティ関数（名前結合・読み仮名）
    tournament.test.ts       # トーナメントロジック（ラウンド数・名前・初回戦生成）
    match-utils.test.ts      # 試合ラベルユーティリティ
    email-template.test.ts   # メールテンプレート変数置換・条件ブロック
    admin-auth.test.ts       # 管理者認証（Cookie 検証）
    compatibility.test.ts    # 対戦相性チェック（体重差・身長差・閾値判定・worst判定）
    court-section-defaults.test.ts # CourtSection デフォルト値（体重差5kg）・sort_order採番ロジック
    speech.test.ts           # TTS読み仮名変換・テンプレート・設定保存
    admin-navigation.test.ts # 管理画面ナビゲーション構造（全ページへの導線・戻るリンク）
    bracket.test.ts          # トーナメントブラケット生成（ペア・バイ・ラウンド計算）
    ensure-fighter.test.ts   # エントリーからの選手自動作成（道場検索・新規作成）
    form-fields.test.ts      # フォームフィールド定義・カテゴリ・カスタムフィールド変換
    grade-options.test.ts    # 年代区分選択肢生成・gradeToNumber変換・isAgeCategoryLabel/findAgeCategoryヘルパー
    auto-bracket.test.ts     # 振り分けルールによるグループ分け・コート割り当てロジック
    suggestions.test.ts      # おすすめ振り分け提案（computeSuggestions / computeBalance / 分布パネル用軸グルーピング）
    event-phase.test.ts      # イベントフェーズ6段階自動判定（getEventPhase）
    group-filter-sort.test.ts # 試合決定数フィルタ・フィルタ連動ソート（matchCountFilterPredicate / buildFilterSortComparator）
  api/            # API ルートテスト（Vitest + Supabase モック）
    admin-login.test.ts          # ログイン/ログアウト
    admin-crud.test.ts           # 道場・選手・エントリー・ルール・設定 CRUD
    admin-events.test.ts         # イベント作成・更新・削除・複製
    admin-matches.test.ts        # 試合更新・入替・一括・選手差替・トーナメントPUT更新・PATCH・削除
    admin-bracket-rules.test.ts # 振り分けルール CRUD・バリデーション・認証
    admin-timer-presets.test.ts  # タイマー CRUD・複製
    admin-form-config.test.ts    # フォーム設定 GET/PUT/PATCH・コピー・注意書き・カスタムフィールド・画像
    admin-media-tournaments.test.ts  # バナー・OGP・ブザー・トーナメント作成
    bug-reports.test.ts              # 不具合報告 POST/GET/PATCH
    court-api.test.ts            # コート操作・公開エントリー・フォーム設定・TTS
  helpers/
    supabase-mock.ts             # Supabase クライアントモック基盤
  e2e/            # E2E テスト（Playwright）
    full-tournament-flow.spec.ts    # 大会フル進行フロー・タイマー操作・タイマー管理
    admin-navigation.spec.ts       # 管理画面ナビゲーション（タブ切替・サブタブ・タイマーインライン表示・パンくず戻り導線）
    entry-form.spec.ts             # エントリーフォーム（表示・バリデーション・メール確認・送信）
    tournament-creation.spec.ts    # 対戦表作成（参加者追加・振り分けルール・ワンマッチ・削除・フィルタ/選択/ソート）
    match-progression.spec.ts      # 試合進行（試合開始・勝者設定・次ラウンド進出・勝者訂正）
    event-management.spec.ts       # イベント管理（編集・複製・アクティブ切替・削除・受付開始/終了）
    participant-management.spec.ts # 参加者管理（一覧表示・追加・欠場切替・詳細表示）
    settings.spec.ts               # 設定（ルールCRUD・流派CRUD・アナウンス設定）
    form-config.spec.ts            # フォーム設定（フィールド表示/非表示・カスタムフィールド・公開）
    live-and-display.spec.ts       # ライブ・表示（ライブ画面・ホーム対戦表・コート複数トーナメント）
    timer-control-improvements.spec.ts # タイマー操作パネル改善（ストップ表記・戻るボタン・一本confirm削除・勝利方法ボタン・確定フロー・h-screen・反則設定表示・フルスクリーン・ブザーサブ操作・未確定確認ダイアログ・アナウンスボタン無効化）
```

### 13.3 npm スクリプト

| コマンド | 内容 |
|---------|------|
| `npm run test` | 全単体テスト実行 |
| `npm run test:watch` | ウォッチモード |
| `npm run test:unit` | unit ディレクトリのみ |
| `npm run test:e2e` | Playwright E2E テスト |
| `npm run test:all` | 単体 + E2E |

### 13.4 CI パイプライン（GitHub Actions）

- **unit-and-build** ジョブ: TypeScript 型チェック → 単体テスト → ビルド確認（push to main + PR）
- **e2e** ジョブ: Playwright テスト（PR のみ、unit-and-build 成功後）

### 13.5 カバレッジ方針

- カバレッジツール: `@vitest/coverage-v8`
- 全 `lib/` モジュールの **Lines カバレッジ 100%** を維持する
- 全 API ルート（38エンドポイント）の**正常系は 100% テスト**済み
- BroadcastChannel 等ブラウザ固有 API は `vi.stubGlobal` でモックしてテスト可能にする
- `localStorage` は happy-dom の制約があるため手動モックを使用
- API ルートテストは Supabase モック基盤（`supabase-mock.ts`）を使用し、DB 依存なしで高速実行

### 13.6 テスト統計

- 単体/APIテスト: 647 テスト（38 ファイル）
- E2E テスト: 71 テスト（12 ファイル）
- **合計: 647 単体/API + 71 E2E テスト**
test
