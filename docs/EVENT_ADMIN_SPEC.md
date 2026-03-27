# イベント管理・管理画面 仕様書

> **ステータス**: ドラフト
> **最終更新**: 2026-03-27
> **対象プロジェクト**: karate-announce
> **対象範囲**: イベントCRUD、管理画面ダッシュボード、マスタデータ管理、認証、ライブ速報、設定管理

---

## 1. 概要

### 1.1 目的
空手大会の運営に必要なイベント（大会）のライフサイクル管理を提供する。イベントの作成から参加受付・対戦表作成・試合進行・結果確定までを一貫して管理する管理画面と、観客向けのライブ速報画面を含む。

### 1.2 対象画面・ルート
| ルート | 種別 | 説明 |
|--------|------|------|
| `/admin` | 管理 | ダッシュボード（ホーム・イベント一覧・設定・操作説明） |
| `/admin/login` | 公開 | ログイン画面 |
| `/admin/events/[id]` | 管理 | イベント詳細（参加者・対戦表・試合番号の3ステップ） |
| `/admin/events/[id]/entries/[entryId]` | 管理 | 参加者詳細 |
| `/live` | 公開 | ライブ速報（認証不要） |
| `/` | 公開 | ホームページ（試合状況簡易表示。認証不要） |
| `/court/{courtNum}` | 公開 | コート画面（試合進行。詳細は COURT_SPEC.md） |
| `/entry/[eventId]` | 公開 | 申込フォーム（詳細は ENTRY_FORM_SPEC.md） |
| `/admin/spec` | 管理 | 仕様書閲覧ページ（外部共有用。機微情報は非表示） |

---

## 2. 認証

### 2.1 認証方式
Cookie ベースのパスワード認証。セッション管理は行わず、パスワードハッシュを Cookie に直接保存するシンプルな方式。

| 項目 | 値 |
|------|-----|
| Cookie 名 | `admin_auth` |
| トークン生成 | `SHA256(password + "karate-announce-v1")` |
| Cookie 属性 | `httpOnly: true`, `secure: NODE_ENV === "production"`（本番環境時のみ）, `sameSite: "lax"`, `path: "/"` |
| 有効期限 | 30日 |
| 環境変数 | `ADMIN_USERNAME`（未設定時は `"admin"`）, `ADMIN_PASSWORD` |

### 2.2 認証フロー
1. ユーザーが `/admin/login` でユーザー名・パスワードを入力
2. `POST /api/admin/login` でサーバー側でハッシュ比較
3. 一致 → `admin_auth` Cookie をセット → `/admin` にリダイレクト
4. 不一致 → エラーメッセージ表示（「IDまたはパスワードが違います」）

### 2.3 認証チェック
- すべての `/api/admin/*` エンドポイントで `verifyAdminAuth()` を呼び出し
- 認証失敗 → `401 Unauthorized` レスポンス
- **開発モード**: `ADMIN_PASSWORD` が未設定の場合、認証チェックをスキップ（常に通過）

### 2.4 ログアウト
- `DELETE /api/admin/login` → Cookie 削除
- ログイン画面にリダイレクト

### 2.5 ログイン画面 UI
- ダークテーマの中央寄せフォーム
- ユーザー名・パスワード入力欄
- 送信ボタン（両フィールド入力済みで有効化）
- エラーメッセージをインライン表示

---

## 3. イベント管理

### 3.1 イベントデータモデル

#### `events` テーブル
| カラム | 型 | デフォルト | 説明 |
|--------|-----|---------|------|
| id | uuid | gen_random_uuid() | PK |
| name | text | NOT NULL | イベント名 |
| event_date | date | NULL | 開催日（YYYY-MM-DD） |
| court_count | integer | 1 | コート数（1〜4） |
| court_names | text[] | NULL | コートのカスタム名（例: `["Aコート", "Bコート"]`）。NULL の場合は「コート1」「コート2」… で表示 |
| status | text | 'preparing' | `preparing` / `ongoing` / `finished` |
| is_active | boolean | false | **排他制約**: 同時に `true` は1件のみ。他を自動で `false` に |
| max_weight_diff | numeric | NULL | 体重差の許容上限（互換性判定用、kg） |
| max_height_diff | numeric | NULL | 身長差の許容上限（互換性判定用、cm） |
| entry_closed | boolean | false | 手動受付終了フラグ |
| entry_close_at | timestamptz | NULL | 自動受付終了日時（UTC） |
| banner_image_path | text | NULL | バナー画像パス（Supabase Storage） |
| ogp_image_path | text | NULL | OGP 画像パス（未設定時はバナーにフォールバック） |
| email_subject_template | text | NULL | 確認メール件名テンプレート |
| email_body_template | text | NULL | 確認メール本文テンプレート |
| venue_info | text | NULL | 会場情報（メールテンプレート変数用） |
| notification_emails | text[] | NULL | 管理者通知メールアドレス（BCC） |
| created_at | timestamptz | now() | |

### 3.2 イベント作成

**API**: `POST /api/admin/events`

**リクエスト**:
```json
{
  "name": "第5回空手道大会",
  "event_date": "2026-04-15",
  "court_count": 2,
  "court_names": ["Aコート", "Bコート"],
  "rule_ids": ["uuid1", "uuid2"]
}
```

**処理**:
1. `events` テーブルに `status: "preparing"` で挿入
2. `rule_ids` が指定されている場合、`event_rules` テーブルにレコードを挿入

**レスポンス**: `{ id: "新規イベントID" }`

### 3.3 イベント複製

**API**: `POST /api/admin/events`（`copy_from_event_id` 付き）

**リクエスト**:
```json
{
  "name": "第6回空手道大会",
  "event_date": "2026-10-20",
  "court_count": 2,
  "copy_from_event_id": "元イベントID",
  "copy_entries": true
}
```

**コピー対象**:
| データ | コピー | 備考 |
|--------|--------|------|
| イベント基本情報 | ○ | name, event_date は新規値。court_count, max_weight_diff, max_height_diff は元をコピー |
| ルール（event_rules） | ○ | |
| フォーム設定（form_configs, form_field_configs, custom_field_defs） | ○ | ソースにフォーム設定がない場合はデフォルト（FIELD_POOL）で新規作成 |
| 注意書き画像（form_notice_images 参照） | ○ | |
| 参加者（entries） | `copy_entries` が true の場合のみ | リセット項目: `admin_memo=NULL`, `is_withdrawn=false`, `fighter_id=NULL`, `form_version=NULL`。`is_test` フラグは保持 |
| entry_rules | entries コピー時のみ | |
| トーナメント | ✕ | コピーしない |
| 試合（matches） | ✕ | コピーしない |
| 結果 | ✕ | コピーしない |

**エラーハンドリング**: コピー途中で失敗した場合、`cleanupNewEvent()` で作成済みデータを全削除し、エラーメッセージを返却。

### 3.4 イベント更新

**API**: `PATCH /api/admin/events/{id}`

任意のフィールドを部分更新。

**特殊ロジック**:
- `is_active: true` を送信した場合 → 先に全イベントを `is_active: false` に更新してから、対象を `true` に設定（同時に1件のみ active を保証）

### 3.5 イベント削除

**API**: `DELETE /api/admin/events/{id}`

関連データ（entries, entry_rules, tournaments, matches, form_configs 等）をカスケードで削除。

### 3.6 受付状態の判定

受付終了の判定は以下のいずれかが成立した場合:
```
entry_closed === true  OR  (entry_close_at != null AND entry_close_at <= now())
```

- **手動制御**: `entry_closed` フラグを PATCH で切り替え
- **自動制御**: `entry_close_at` に UTC 日時を設定。API リクエスト時に判定（cron 不要）
- **UI 表示**:
  - 受付中: 緑バッジ「受付中」
  - 締切済: グレーバッジ「受付終了」

---

## 4. 管理画面ダッシュボード

### 4.1 タブ構成

管理画面（`/admin`）は4つのタブで構成:

| タブ | 名称 | 内容 |
|------|------|------|
| 1 | ホーム | 運営状況サマリー |
| 2 | 試合 | イベント一覧・作成・複製・削除 |
| 3 | 設定 | マスタデータ・アナウンス設定 |
| 4 | 操作説明 | セットアップガイド |

### 4.2 ホームタブ

**データ取得**: 全イベントを `event_date DESC NULLS LAST, created_at DESC` で取得。10秒タイムアウト付き。

**セクション構成**:

#### 進行中の試合
- `is_active: true` のイベントを表示
- コートごとにボタン表示（カスタム名 or 「コート{n}」）
- 各ボタンは `/court/{courtNum}` を新しいタブで開く

#### 次の試合
- `event_date` が未来で最も近いイベント（`status != "finished"`）
- 表示: イベント名、開催日、あと何日、参加者数、コート数
- イベント詳細へのリンク

#### 要対応
- 参加者がいるがトーナメント未作成のイベントを警告表示
- 表示: 「{N}名あり・対戦表が未作成」
- 「対戦表を作成」ボタン → イベント詳細 Step 2 へ

#### 参加受付状況
- `status != "finished"` かつ参加者ありのイベント
- 受付状態バッジ（受付中 / 受付終了）
- 参加者数（non-withdrawn, non-test で集計）

### 4.3 試合タブ（イベント一覧）

**イベントリスト**:
- `event_date DESC, created_at DESC` でソート
- カード表示: イベント名、開催日（YYYY/MM/DD）、コート数
- `is_active` なイベントには「● 進行中」バッジ

**アクション**:
| ボタン | 動作 |
|--------|------|
| ▶ アクティブに設定 / 進行中（クリックで停止） | `is_active` トグル。PATCH で更新 |
| 管理画面を開く → | `/admin/events/{id}` に遷移 |
| アナウンス画面 | `/` を新しいタブで開く（active 時のみ表示） |
| コピー | 複製モーダルを表示 |
| 削除 | 確認ダイアログ → DELETE |

**イベント作成フォーム**:
- 入力: イベント名、開催日（任意）、コート数（1〜4 のボタン選択）、コート名（グリッド入力、任意）、ルール（チェックボックス複数選択）
- 送信後、作成されたイベント詳細ページに遷移

**複製モーダル**:
- 入力: 新イベント名、新開催日（任意）、「参加者もコピーする」チェックボックス
- 参加者コピー時の注意書き表示

### 4.4 設定タブ

3つのサブタブで構成:

#### アナウンス設定
- **音声選択**: OpenAI TTS の6ボイス（nova, shimmer, alloy, echo, fable, onyx）
- **速度調整**: 0.5x〜1.5x のスライダー
- **テスト再生**: 「試し聞き」ボタンでサンプルテキストを再生
- **保存先**: localStorage（`tts_voice`, `tts_speed`）

#### アナウンステンプレート編集
- **タブ**: 「試合開始」「勝者発表」の2テンプレート
- **変数挿入**: `{{変数名}}` ボタンをクリックでカーソル位置に挿入
- **プレビュー**: サンプル値でリアルタイムプレビュー
- **試し聞き**: プレビュー結果を TTS API で再生
- **保存先**: DB `settings` テーブル（key: `announce_templates`）
- **リセット**: デフォルトテンプレートに戻す（確認ダイアログ付き）

#### ルール管理
- **作成**: ルール名（必須）、読み仮名（任意）、説明（任意）
- **編集**: 読み仮名・説明をインライン編集
- **削除**: 確認ダイアログ付き
- **データ**: `rules` テーブルに保存

#### 道場（流派）管理
- **作成**: 道場名（必須）、読み仮名（任意）
- **編集**: 読み仮名をインライン編集
- **削除**: 確認ダイアログ付き
- **自動作成**: 申込フォームから新しい道場名が送信された場合、自動で `dojos` テーブルにレコード作成
- **データ**: `dojos` テーブルに保存

### 4.5 操作説明タブ

6ステップのアコーディオン形式セットアップガイド:
1. ルールを登録する
2. 流派を登録する（任意）
3. 試合を作成する
4. 参加者を集める
5. 対戦表を組んで試合番号を設定する
6. 試合をアクティブにして AI アナウンス開始

各ステップに説明文と操作手順を記載。互換性凡例（◎ △ ✕）の説明も含む。

---

## 5. イベント詳細画面

### 5.1 画面構成

**ヘッダー**:
- 戻るリンク（`/admin?tab=events`）
- イベント名（h1）
- 受付状態バッジ
- ログアウトボタン

**メタ情報ブロック**（インライン編集）:
- 表示モード: 開催日、コート数、コート名を表示
- 編集モード: 「編集」ボタンで開閉
  - 開催日: `<input type="date">`
  - コート名: 2カラムグリッド入力
  - 保存 / キャンセルボタン
- 保存: `PATCH /api/admin/events/{id}`

**ステップナビゲーション**:
- 3つのボタン: Step ① 参加者 | Step ② 対戦表 | Step ③ 試合番号
- Step ② ボタンにはトーナメント数を表示
- トーナメントが存在する場合、初回表示時に Step ② を自動選択

### 5.2 Step ① 参加者管理

3つのサブタブ:

#### サブタブ A: 参加者管理
（参加者一覧・受付制御・バナー/OGP・QR は ENTRY_FORM_SPEC.md と FORM_CONFIG_SPEC.md で詳述）

**受付制御**:
- トグルボタン: 「受付中」↔「受付終了」
- 自動締切: `datetime-local` 入力で `entry_close_at` を設定。JST → UTC 変換（`new Date(localValue + '+09:00').toISOString()`）
- クリアボタンで自動締切を解除

**バナー画像**:
- アップロード: `POST /api/admin/events/{id}/banner`
- 削除: `DELETE /api/admin/events/{id}/banner`
- 保存先: Supabase Storage `form-notice-images` バケット、パス `event-banners/{eventId}/{timestamp}.{ext}`
- 対応形式: JPEG, PNG, WebP

**OGP 画像**:
- アップロード: `POST /api/admin/events/{id}/ogp`
- 削除: `DELETE /api/admin/events/{id}/ogp`
- 保存先: Supabase Storage、パス `event-ogp/{eventId}/{timestamp}.{ext}`
- 推奨サイズ: 1200x630px
- 未設定時はバナー画像にフォールバック

**QR コード**:
- クライアントサイドで `qrcode` ライブラリにより生成
- 申込フォーム URL のQRを150pxで表示
- 「QRコードをダウンロード」ボタンで PNG ダウンロード

**参加者一覧テーブル**:
| 列 | 内容 |
|----|------|
| # | 通し番号 |
| 氏名 | クリックで参加者詳細へ遷移 |
| 所属 | 道場名 |
| 性別 | 男性 / 女性 |
| 体重 | kg |
| 身長 | cm |
| ルール | バッジ表示 |
| メモ | 申込者メモ + 管理者メモ（分離） |
| 状態 | 欠場バッジ（オレンジ）、テストバッジ |

- **旧バージョンバッジ**: フォーム設定更新前に提出されたエントリーに紫バッジ「旧」
- **欠場表示**: `is_withdrawn: true` → 行に `opacity-50` + 取り消し線
- **CSV エクスポート**: BOM 付き UTF-8、全角対応、電話番号フィールドは `="値"` 形式（Excel 数式防止）
- **テストデータ**: 「テスト32名追加」ボタンでダミーデータ生成、「テスト削除」で `is_test: true` のエントリーを一括削除
- **参加者数表示**: 「N名参加 / M名欠場」（non-test で集計）

#### サブタブ B: フォーム設定
→ FORM_CONFIG_SPEC.md で詳述

#### サブタブ C: メール設定

**件名テンプレート**:
- テキスト入力。`{{変数名}}` で変数を埋め込み
- 保存先: `events.email_subject_template`

**本文テンプレート**:
- テキストエリア。`{{変数名}}` で変数を埋め込み
- 条件ブロック: `{{#key}}...{{/key}}`（値が存在する場合のみ表示）
- 保存先: `events.email_body_template`

**会場情報**:
- テキスト入力。メールテンプレートの `{{venue_info}}` 変数に展開
- 保存先: `events.venue_info`

**テンプレート変数一覧**:
| 変数 | 説明 |
|------|------|
| `{{participant_name}}` | 参加者氏名 |
| `{{event_name}}` | イベント名 |
| `{{event_date}}` | 開催日 |
| `{{venue_info}}` | 会場情報 |
| `{{entry_details}}` | 申込内容（全フィールドをテキスト整形） |
| `{{submission_date}}` | 申込日時（JST） |

**管理者通知メール**:
- テキスト入力（カンマ区切りで複数アドレス）
- 保存先: `events.notification_emails`（text[]）
- 申込時に BCC で送信

### 5.3 Step ② 対戦表作成
→ BRACKET_SPEC.md で詳述

### 5.4 Step ③ 試合番号管理
→ MATCH_LABEL_SPEC.md で詳述

---

## 6. 参加者詳細画面

### 6.1 画面構成（`/admin/events/[id]/entries/[entryId]`）

**表示内容**:
- フォーム設定の `sort_order` 順にフィールドを表示（非表示フィールドは除外）
- 読み仮名フィールド: 親フィールドの隣に括弧付きで表示（例: 「山田 太郎（やまだ たろう）」）
- カスタムフィールド: `extra_fields` から取得して表示

**管理者メモ**:
- テキストエリア。フォーカスアウト時に自動保存（`PATCH /api/admin/entries/{id}` with `admin_memo`）

**メタ情報**:
- 申込日時
- フォームバージョン（旧バージョンの場合は警告表示）
- 欠場 / テストデータバッジ

**申込ルール**:
- バッジ形式で表示

---

## 7. マスタデータ API

### 7.1 ルール API

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/admin/rules` | 作成。body: `{ name, name_reading?, description? }` |
| PATCH | `/api/admin/rules/{id}` | 更新。body: `{ name_reading?, description? }` |
| DELETE | `/api/admin/rules/{id}` | 削除 |

**一覧取得**: 管理画面では Supabase クライアントから直接 `rules` テーブルを `select()` で取得（専用 GET API は設けていない）。

#### `rules` テーブル
| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid | PK |
| name | text | ルール名（必須） |
| name_reading | text | 読み仮名（TTS 用。未設定時は name をそのまま使用） |
| description | text | 説明文（申込フォームのルール選択時にツールチップ or 注記として表示） |
| created_at | timestamptz | |

### 7.2 道場 API

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/admin/dojos` | 作成。body: `{ name, name_reading? }` |
| PATCH | `/api/admin/dojos/{id}` | 更新。body: `{ name_reading? }` |
| DELETE | `/api/admin/dojos/{id}` | 削除 |

**一覧取得**: 管理画面では Supabase クライアントから直接 `dojos` テーブルを `select()` で取得（専用 GET API は設けていない）。

#### `dojos` テーブル
| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid | PK |
| name | text | 道場名（必須、ユニーク） |
| name_reading | text | 読み仮名（TTS 用） |
| created_at | timestamptz | |

**自動作成ルール**: 申込フォームから `school_name` が送信され、`dojos` テーブルに同名レコードが存在しない場合、自動で `{ name: school_name }` を挿入。

### 7.3 設定 API

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/admin/settings` | 全設定取得（`{ key: value }` 形式） |
| PUT | `/api/admin/settings` | 設定の upsert。body: `{ key, value }` |

#### `settings` テーブル
| カラム | 型 | 説明 |
|--------|-----|------|
| key | text | PK。設定キー |
| value | jsonb | 設定値 |
| updated_at | timestamptz | |

**使用中のキー**:
| key | 内容 |
|-----|------|
| `announce_templates` | アナウンステンプレート（試合開始・勝者発表の2テンプレート。変数付きテキスト） |

### 7.4 イベントルール関連テーブル

#### `event_rules` テーブル
| カラム | 型 | 説明 |
|--------|-----|------|
| event_id | uuid | FK → events |
| rule_id | uuid | FK → rules |

**PK**: `(event_id, rule_id)` の複合キー。M:N 関係。

---

## 8. エントリー管理 API

### 8.1 管理者向けエントリー API

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/admin/entries` | 管理者によるエントリー手動作成 |
| PATCH | `/api/admin/entries/{id}` | エントリー更新（任意フィールド） |
| DELETE | `/api/admin/entries/{id}` | エントリー削除（entry_rules も連鎖削除） |

### 8.2 エントリールール API

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/admin/entry-rules` | ルール追加。body: `{ entry_id, rule_id }` |
| DELETE | `/api/admin/entry-rules` | ルール削除。body: `{ entry_id, rule_id }` |

### 8.3 選手レコード

エントリーから選手（`fighters`）レコードを自動生成する `ensureFighterFromEntry()` 関数。対戦表作成時に呼び出され、`entries.fighter_id` を設定。

#### `fighters` テーブル
| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid | PK |
| name | text | 氏名（family_name + given_name） |
| name_reading | text | 読み仮名 |
| family_name | text | 姓 |
| given_name | text | 名 |
| family_name_reading | text | 姓の読み |
| given_name_reading | text | 名の読み |
| dojo_id | uuid | FK → dojos |
| dojo_name | text | 道場名（非正規化コピー） |
| affiliation | text | 所属（school_name + dojo_name を「　」で結合） |
| affiliation_reading | text | 所属の読み仮名 |
| weight | numeric | 体重（kg） |
| height | numeric | 身長（cm） |
| age_info | text | 年齢＋段級の複合情報 |
| experience | text | 経験 |
| created_at | timestamptz | |

#### `entries` テーブル（主要カラム）
| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid | PK |
| event_id | uuid | FK → events |
| fighter_id | uuid | FK → fighters（対戦表作成時に設定） |
| family_name | text | 姓 |
| given_name | text | 名 |
| family_name_reading | text | 姓の読み |
| given_name_reading | text | 名の読み |
| sex | text | 性別（male / female） |
| weight | numeric | 体重 |
| height | numeric | 身長 |
| birth_date | date | 生年月日 |
| age | integer | 年齢 |
| grade | text | 段級 |
| experience | text | 経験 |
| dojo_name | text | 道場名 |
| dojo_name_reading | text | 道場名の読み |
| school_name | text | 支部名 |
| school_name_reading | text | 支部名の読み |
| memo | text | 申込者メモ |
| admin_memo | text | 管理者メモ |
| is_withdrawn | boolean | 欠場フラグ |
| is_test | boolean | テストデータフラグ |
| form_version | integer | 申込時のフォームバージョン |
| extra_fields | jsonb | カスタムフィールドの値（GIN インデックス） |
| created_at | timestamptz | |

---

## 9. ライブ速報

### 9.1 概要（`/live`）
認証不要の公開ページ。進行中イベントの試合状況をリアルタイム表示。

### 9.2 データ取得
- `is_active: true` のイベントを取得
- コートごとにトーナメント → 試合 → 選手データを結合
- **ポーリング**: 5秒間隔
- **Supabase Realtime**: `matches` テーブルの変更をリアルタイム購読
- **バックグラウンドタブ**: `visibilitychange` イベントで可視化時に即座にポーリング再開

### 9.3 UI レイアウト
- **ヘッダー**: イベント名 + 「LIVE」バッジ + 最終更新時刻
- **コートタブ**: `grid grid-cols-{court_count}` で均等幅（UIスタイルガイド準拠）
- **試合一覧**:
  - 試合番号（`match_label` から数値抽出してソート）
  - 選手名 + 所属（2行レイアウト）
  - 状態バッジ: 試合中（黄色）/ 次の試合（青）/ 完了（グレー）
  - 勝者表示: `text-green-400 font-bold` + `▶` マーク
  - 不戦勝: コンパクト表示
- **進行中試合**: ページ上部に固定バナー。タップで該当試合にスクロール
- **BracketView**: 読み専用モードでトーナメント表を表示
- **レスポンシブ**: `max-w-lg` 中央寄せ（モバイル最適化）

### 9.4 更新検知
- 受信データをシリアライズして前回値と比較
- 変更がない場合は `setState` をスキップ（不要な再レンダリング防止）

---

## 10. ホームページ（`/`）

### 10.1 概要
観客向けのトップページ。`is_active: true` のイベントの試合状況を簡易表示。

### 10.2 データ取得
- active イベントの全トーナメント・試合データを取得
- 5秒ポーリング

### 10.3 UI
- コート別にグループ表示
- 各トーナメントの BracketView（読み専用）
- 未完了試合のリスト表示
- `max-w-5xl` 中央寄せ

---

## 11. 決定済み事項

- [x] 認証方式: Cookie ベースのパスワードハッシュ（シンプル方式、シングルテナント想定）
- [x] イベント active 制約: 同時に1件のみ（API 側で排他制御）
- [x] イベント複製: トーナメント・試合はコピーしない（参加者のみオプション）
- [x] ライブ速報の更新方式: 5秒ポーリング + Supabase Realtime
- [x] マスタデータの自動作成: 道場は申込フォームから自動作成
- [x] テストデータ: `is_test` フラグで区別、一括削除可能
- [x] CSV エクスポート: BOM 付き UTF-8、Excel 対応フォーマット

## 12. 未決事項

（現時点でなし）
