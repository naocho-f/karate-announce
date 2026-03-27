# フォーム設定 仕様書

> **ステータス**: ドラフト
> **最終更新**: 2026-03-27
> **対象プロジェクト**: karate-announce
> **対象範囲**: 管理側のフォーム設定（フィールド管理・注意書き・カスタムフィールド・バージョン管理）

---

## 1. 概要

### 1.1 目的
申込フォームの構成をイベントごとに管理者が設定する機能。フィールドの表示/非表示・必須/任意・表示順序・選択肢のカスタマイズ、注意書きの追加、カスタムフィールドの作成が行える。

### 1.2 画面構成
`/admin/events/[id]` の Step ① 参加者管理内、「フォーム設定」サブタブに `FormConfigPanel` コンポーネントとして配置。

### 1.3 関連仕様書
| 仕様書 | 関連内容 |
|--------|---------|
| ENTRY_FORM_SPEC.md | 公開側のフォーム描画・バリデーション・送信 |
| EVENT_ADMIN_SPEC.md | イベント管理全般 |

---

## 2. データモデル

### 2.1 `form_configs` テーブル
| カラム | 型 | デフォルト | 説明 |
|--------|-----|---------|------|
| id | uuid | gen_random_uuid() | PK |
| event_id | uuid | NOT NULL | FK → events |
| version | integer | 0 | 公開時にインクリメント |
| is_ready | boolean | false | 公開状態（true = 公開中、false = 準備中） |
| created_at | timestamptz | now() | |
| updated_at | timestamptz | now() | |

### 2.2 `form_field_configs` テーブル
| カラム | 型 | デフォルト | 説明 |
|--------|-----|---------|------|
| id | uuid | gen_random_uuid() | PK |
| form_config_id | uuid | NOT NULL | FK → form_configs |
| field_key | text | NOT NULL | フィールド識別子（FIELD_POOL のキー or `custom_XXXXXXXX`） |
| visible | boolean | true | 表示フラグ |
| required | boolean | false | 必須フラグ |
| sort_order | integer | 0 | 表示順序 |
| has_other_option | boolean | false | 「その他」自由入力オプション |
| custom_choices | jsonb | NULL | 管理者定義の選択肢 `[{ label, value }]` |
| custom_label | text | NULL | 管理者定義のラベル（未設定時は FIELD_POOL のデフォルトラベル） |

### 2.3 `custom_field_defs` テーブル
| カラム | 型 | デフォルト | 説明 |
|--------|-----|---------|------|
| id | uuid | gen_random_uuid() | PK |
| form_config_id | uuid | NOT NULL | FK → form_configs |
| field_key | text | NOT NULL | `custom_XXXXXXXX`（8桁の16進数。ランダム生成） |
| label | text | NOT NULL | フィールド表示名 |
| field_type | text | NOT NULL | `text` / `number` / `select` / `checkbox` / `textarea` |
| choices | jsonb | NULL | 選択肢 `[{ label, value }]`（select/checkbox 時） |
| sort_order | integer | 0 | |
| created_at | timestamptz | now() | |

### 2.4 `form_notices` テーブル
| カラム | 型 | デフォルト | 説明 |
|--------|-----|---------|------|
| id | uuid | gen_random_uuid() | PK |
| form_config_id | uuid | NOT NULL | FK → form_configs |
| anchor_type | text | NOT NULL | `form_start` / `field` / `form_end` |
| anchor_field_key | text | NULL | `field` タイプ時のアンカーフィールド |
| sort_order | integer | 0 | 同一アンカー内の表示順序 |
| text_content | text | NULL | テキスト内容 |
| scrollable_text | text | NULL | スクロール表示テキスト（利用規約等の長文） |
| link_url | text | NULL | リンクURL |
| link_label | text | NULL | リンク表示テキスト |
| require_consent | boolean | false | 同意チェックボックスの有無 |
| consent_label | text | NULL | 同意チェックのラベル（デフォルト: 「上記に同意します」） |
| created_at | timestamptz | now() | |

### 2.5 `form_notice_images` テーブル
| カラム | 型 | デフォルト | 説明 |
|--------|-----|---------|------|
| id | uuid | gen_random_uuid() | PK |
| notice_id | uuid | NOT NULL | FK → form_notices |
| storage_path | text | NOT NULL | Supabase Storage パス |
| sort_order | integer | 0 | 画像の表示順序 |
| created_at | timestamptz | now() | |

---

## 3. フィールドプール（FIELD_POOL）

### 3.1 概要
システムが提供する定義済みフィールドの一覧。管理者はこれらのフィールドの表示/非表示・必須/任意を切り替えてフォームを構成する。

### 3.2 フィールド定義の構造
```typescript
type FieldPoolItem = {
  key: string;                        // 一意の識別子
  label: string;                      // デフォルト表示名
  type: "text" | "textarea" | "number" | "tel" | "email" | "date" | "radio" | "checkbox" | "select";
  category: "basic" | "affiliation" | "competition" | "equipment";
  dbColumn?: string;                  // entries テーブルのカラム名。未設定 → extra_fields に格納
  defaultRequired: boolean;           // デフォルトの必須設定
  defaultChoices?: FieldChoice[];     // デフォルト選択肢
  defaultHasOther?: boolean;          // デフォルトで「その他」オプションあり
  kanaParent?: string;                // 読み仮名の親フィールドキー
  useMaster?: "dojos";               // マスタテーブル連携
  hideKanaOnMasterSelect?: boolean;   // マスタ選択時に読み仮名を自動入力
  hasConfirmInput?: boolean;          // 確認入力（email 用）
  step?: number;                      // 数値入力のステップ
  unit?: string;                      // 表示単位（cm, kg）
  placeholder?: string;              // プレースホルダー
  maxLength?: number;                // 最大文字数
  fixedChoices?: FieldChoice[];      // 固定選択肢（都道府県等、管理者変更不可）
};
```

### 3.3 固定フィールド一覧（FIXED_FIELD_KEYS）
削除不可のフィールド:

| key | label | 型 | カテゴリ | dbColumn | 備考 |
|-----|-------|-----|---------|----------|------|
| `full_name` | 氏名 | text | basic | family_name, given_name | 姓名分割入力 |
| `kana` | よみがな | text | basic | family_name_reading, given_name_reading | full_name の読み |
| `age` | 年齢 | number | basic | age | birthday と連動自動計算 |
| `sex` | 性別 | radio | basic | sex | male / female |
| `birthday` | 生年月日 | date | basic | birth_date | age を自動計算 |
| `prefecture` | 都道府県 | select | basic | ─ | 47都道府県（fixedChoices） |
| `phone` | 電話番号 | tel | basic | ─ | extra_fields 格納 |
| `email` | メールアドレス | email | basic | ─ | 確認入力付き。extra_fields 格納 |
| `organization` | 所属団体 | select | affiliation | school_name | dojos マスタ連携 |
| `organization_kana` | 所属団体よみがな | text | affiliation | school_name_reading | organization の読み |
| `branch` | 道場・支部名 | text | affiliation | dojo_name | |
| `branch_kana` | 道場・支部名よみがな | text | affiliation | dojo_name_reading | branch の読み |
| `martial_arts_experience` | 武道経験 | textarea | affiliation | experience | |
| `memo` | 備考 | textarea | affiliation | memo | |
| `rule_preference` | 出場希望ルール | checkbox | competition | ─ | entry_rules テーブルに格納。DB動的選択肢 |
| `height` | 身長 | number | competition | height | step: 0.1, unit: cm |
| `weight` | 体重 | number | competition | weight | step: 0.1, unit: kg |

### 3.4 デフォルトカスタムフィールド（DEFAULT_CUSTOM_FIELDS）
新規フォーム作成時に自動追加される。削除・複製可能。

| key | label | 型 | 選択肢 | デフォルト非表示 |
|-----|-------|-----|--------|----------------|
| `guardian_name` | 保護者氏名 | text | ─ | ○ |
| `match_experience` | 試合経験 | select | なし/1〜3回/4〜10回/11回以上 | |
| `desired_match_count` | 希望試合数 | select | 1回/2回/3回/4回 | |
| `head_butt_preference` | 上段突き | checkbox | あり/なし/どちらでもよい | |
| `equipment_owned` | 所持防具 | checkbox | 道着/面/拳サポ/脚サポ/ファウルカップ/帯 | |
| `shield_mask` | 面 | select | 持参/レンタル/購入 | |
| `fist_guard` | 拳サポーター | select | 持参/レンタル/購入 | |
| `leg_guard` | 脚サポーター | select | 持参/レンタル/購入 | |
| `groin_guard` | ファウルカップ | select | 持参/レンタル/購入 | |
| `gi` | 道着 | select | 持参/レンタル/購入 | |
| `belt` | 帯 | select | 持参/レンタル/購入 | |

### 3.5 フィールドのペアリングルール
| 親フィールド | 子フィールド | 連動 |
|------------|------------|------|
| `full_name` | `kana` | 表示/必須が連動。並び順も親の直後 |
| `organization` | `organization_kana` | 同上 |
| `branch` | `branch_kana` | 同上 |
| `birthday` | `age` | 表示が連動。並び順も birthday の直後 |

**sort_order**: 子フィールドは `親の sort_order + 0.5` で自動設定（正規化後は連番）

---

## 4. API

### 4.1 フォーム設定取得・初期化

**`GET /api/admin/form-config?event_id={eventId}`**

**レスポンス**:
```json
{
  "config": { "id": "...", "version": 0, "is_ready": false },
  "fields": [ /* FormFieldConfig[] */ ],
  "notices": [ /* FormNotice[] with images */ ],
  "customFieldDefs": [ /* CustomFieldDef[] */ ]
}
```

**初回アクセス時の自動初期化**:
1. `form_configs` レコードを作成（`version: 0`, `is_ready: false`）
2. FIELD_POOL の全フィールドに対して `form_field_configs` レコードを作成
3. DEFAULT_CUSTOM_FIELDS を `custom_field_defs` + `form_field_configs` に挿入
4. デフォルト注意書き（安全同意書、装備レンタル案内等）を挿入
5. イベントにルールが紐づいている場合、ルール説明文を注意書きとして自動挿入

**後方互換**: `form_field_configs` にカスタムフィールドキーがあるが `custom_field_defs` にない場合、DEFAULT_CUSTOM_FIELDS から自動補完。

### 4.2 フィールド設定保存

**`PUT /api/admin/form-config`**

**リクエスト**:
```json
{
  "config_id": "uuid",
  "fields": [ /* FormFieldConfig[] */ ],
  "is_ready": false
}
```

**動作**:
- `form_field_configs` の `visible`, `required`, `sort_order`, `has_other_option`, `custom_choices`, `custom_label` を一括更新
- `is_ready` が指定されている場合、`form_configs.is_ready` を更新（バージョンは変更しない）

### 4.3 フォーム公開

**`PATCH /api/admin/form-config`**

**リクエスト**:
```json
{
  "config_id": "uuid"
}
```

**動作**:
- `version` をインクリメント
- `is_ready = true` に設定
- `updated_at` を更新

**レスポンス**: `{ ok: true, version: 新バージョン番号 }`

### 4.4 過去イベントからコピー

**`POST /api/admin/form-config/copy`**

**リクエスト**:
```json
{
  "source_event_id": "uuid",
  "target_config_id": "uuid"
}
```

**動作**:
1. ターゲットの既存 `form_field_configs` と `form_notices` を全削除
2. ソースの `form_field_configs` を全コピー（visible, required, custom_choices, custom_label を保持）
3. ソースの `form_notices` と画像参照をコピー（画像ファイル自体は共有、ストレージパスをコピー）
4. `custom_field_defs` はコピーしない（GET 時に `form_field_configs` から自動補完）

### 4.5 カスタムフィールド API

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/admin/form-config/custom-fields` | 作成。body: `{ form_config_id, label, field_type, choices? }` |
| DELETE | `/api/admin/form-config/custom-fields` | 削除。body: `{ form_config_id, field_key }` |
| POST | `/api/admin/form-config/custom-fields/duplicate` | 複製。body: `{ form_config_id, source_field_key }` |

**作成時の処理**:
1. `field_key` を `custom_${ランダム8桁hex}` で生成
2. `custom_field_defs` に挿入（`sort_order` = 既存最大値 + 1）
3. `form_field_configs` に挿入（`visible: true`, `required: false`, 同じ `sort_order`）
4. select/checkbox の場合、`custom_choices` に `choices` をコピー

**複製時の処理**:
- ソースの全プロパティをコピー
- `field_key` は新規生成
- `label` に「(コピー)」サフィックスを付与

**削除時の処理**:
- `custom_field_defs` と `form_field_configs` の両方から削除
- アンカーされた注意書きは孤立するが、UI側でフィルタ

### 4.6 注意書き API

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/admin/form-config/notices` | 作成。body: `{ form_config_id, anchor_type, anchor_field_key?, sort_order, ... }` |
| PATCH | `/api/admin/form-config/notices/{id}` | 更新。任意フィールドの部分更新 |
| DELETE | `/api/admin/form-config/notices/{id}` | 削除。紐づく画像もストレージから削除 |

### 4.7 画像 API

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/admin/form-config/image-upload` | アップロード。FormData: `file`, `notice_id`, `sort_order?` |
| DELETE | `/api/admin/form-config/image-upload` | 削除。body: `{ image_id }` |

**制限**:
- 対応形式: JPEG, PNG, WebP
- 最大サイズ: 5MB
- ストレージパス: `{noticeId}/{timestamp}.{ext}`
- バケット: `form-notice-images`（公開読み取り）

---

## 5. UI 構成

### 5.1 ヘッダー
- バージョン表示: `v{version}`
- ステータスバッジ: 「公開中」（緑）/ 「準備中」（黄）
- 「過去の大会から読み込む」ボタン → コピーモーダル
- 「保存する」ボタン（dirty 時のみ活性化。保存中は「保存中...」、保存後は「保存済み」）
- 「フォームを公開」/「準備中に戻す」ボタン

### 5.2 フォームプレビュー
`max-w-lg` の中央寄せで、実際のフォームに近い外観でプレビュー表示。

**表示要素（sort_order 順）**:
1. フォーム開始注意書き（`form_start`）
2. フィールドカード群
3. カスタムフィールド追加ボタン
4. フォーム終了注意書き（`form_end`）
5. 送信ボタン（モック）

### 5.3 フィールドカード

#### 非表示フィールド
- グレーアウト（`border-gray-600/40 bg-gray-800/40`）
- ラベルのみ表示
- 並び替え・必須設定は不可

#### 表示フィールド
- 枠: `border-gray-500 bg-gray-700/30`

**ヘッダー（2行）**:
- 1行目: 並び替え（▲▼）、必須/任意ドロップダウン、読み仮名の必須設定、ステータスインジケータ、表示/非表示トグル
- 2行目: ラベルインライン編集（`custom_label`）、型固有の設定ボタン、注意書き追加ボタン

**ボディ**: フィールド型に応じた入力プレビュー

**カスタムフィールドの追加要素**:
- 紫バッジ表示
- 「複製」ボタン
- 「削除」ボタン（確認ダイアログ付き）

### 5.4 並び替え（▲▼ボタン）
- 表示フィールド同士の sort_order をスワップ
- 読み仮名フィールドは親の直後に自動追従（`sort_order = 親 + 0.5`）
- birthday/age ペアは常に隣接
- スワップ後に sort_order を 0, 1, 2, ... に正規化
- ドラッグ&ドロップは未実装（将来対応の余地あり）

### 5.5 表示/非表示トグル
- フィールドの `visible` を切り替え
- 読み仮名フィールド・age フィールドは親と連動してトグル
- 非表示フィールドはリストの末尾にまとめて表示

### 5.6 選択肢編集（FieldDetailEditor）
- radio / checkbox / select フィールドの選択肢をテキストエリアで一括編集
- 1行1選択肢の形式
- 保存時に `{ label, value }` 配列に変換（value は自動スラッグ化）
- 既存の選択肢と同じ label がある場合は value を保持

### 5.7 注意書きエディタ（InlineNoticeEditor）

**プレビューモード**: 設定内容を簡潔に表示。ホバーで編集/削除ボタン

**編集モード**:
- テキスト内容（textarea）
- スクロールテキスト（details ドロップダウン内の textarea）
- リンク URL + ラベル（2カラムグリッド）
- 画像アップロード + サムネイル（削除ボタン付き）
- 同意チェックボックス ON/OFF + カスタムラベル入力
- 保存 / 閉じるボタン

### 5.8 カスタムフィールド追加フォーム
- 「カスタムフィールドを追加」ボタンで展開
- 入力: ラベル（必須）、型（select で選択）、選択肢（select/checkbox 時のみテキストエリア）
- 「追加する」ボタンで API 呼び出し → 即座にフォームに反映

### 5.9 コピーモーダル
- 過去のイベント一覧をスクロールリストで表示
- 選択 → 確認ダイアログ「{イベント名}からコピーしますか？現在の設定は上書きされます。」
- 実行 → 全フィールド・注意書きを差し替え → リロード

---

## 6. ルール選択フィールドの特殊仕様

### 6.1 選択肢の動的取得
`rule_preference` フィールドの選択肢は FIELD_POOL のデフォルトではなく、`event_rules` + `rules` テーブルからイベントに紐づくルールを動的に取得。

### 6.2 単一選択/複数選択の切替
- **複数選択**（デフォルト）: チェックボックスで表示。`custom_choices = null`
- **単一選択**: ラジオボタンで表示。`custom_choices = [{ label: "__meta__", value: "__single_select__" }]` を設定

この `__single_select__` マーカーは表示時にフィルタされ、UIには表示されない。

### 6.3 DB 連携
- フォーム設定画面: ルール選択肢の直接編集はできない。「ルール管理画面で設定してください」のリンクを表示
- 申込フォーム: `rules` テーブルの `name` を選択肢ラベル、`id` を value として使用
- 送信時: `entry_rules` テーブルに保存（entries テーブルには格納しない）

---

## 7. バージョン管理

### 7.1 バージョンのライフサイクル
1. **作成時**: `version: 0`, `is_ready: false`
2. **保存時**（PUT）: バージョン変更なし
3. **公開時**（PATCH）: `version++`, `is_ready: true`
4. **非公開に戻す**（PUT with `is_ready: false`）: バージョン変更なし

### 7.2 バージョンの用途
- 公開フォーム（`/entry/[eventId]`）は `is_ready: true` の場合のみ表示
- 申込時に `entry.form_version` に現在のバージョンを記録
- 管理画面の参加者一覧で、旧バージョンで送信されたエントリーに紫バッジ「旧」を表示

---

## 8. 状態管理

### 8.1 dirty フラグ
- フィールドの変更（表示/非表示、必須、並び順、ラベル、選択肢）で `dirty = true`
- `save()` 成功後に `dirty = false`
- 注意書きの変更は即座に API を呼ぶため dirty フラグの対象外
- ページ遷移時の未保存警告なし（将来対応の余地あり）

### 8.2 busyNotices
- 注意書き操作（画像アップロード/削除、注意書き更新/削除）中の notice ID を `Set<string>` で管理
- busy 中はオーバーレイスピナーを表示し、操作をブロック
- 複数注意書きの同時操作は可能（独立した API 呼び出し）

---

## 9. デフォルト注意書き

新規フォーム作成時に自動挿入される注意書き:

| # | anchor | 内容 | consent |
|---|--------|------|---------|
| 1 | email フィールド | 安全・免責に関する同意書（スクロールテキスト） | ○ |
| 2 | form_start | ルール併願・複数エントリーに関する案内 | |
| 3 | weight フィールド | 体重超過のペナルティ案内 | |
| 4 | equipment_owned フィールド | 装備レンタル費用・配送の案内 | |
| 5-9 | 各装備フィールド | 装備別のレンタル・在庫案内 | |
| 10 | rule_preference フィールド | ルール説明文（event_rules から自動生成） | |

すべて作成後に管理者が編集可能。

---

## 10. 決定済み事項

- [x] フィールド並び替え: ▲▼ボタン方式（ドラッグ&ドロップは将来対応）
- [x] 選択肢編集: テキストエリアで1行1選択肢
- [x] ルール選択肢: DB 駆動（event_rules + rules テーブル）、フォーム設定画面からは直接編集不可
- [x] 単一選択/複数選択: `__single_select__` マーカーによる切替
- [x] コピー機能: フィールド設定と注意書きをまるごとコピー（画像は参照共有）
- [x] バージョン管理: 公開時のみインクリメント。保存だけではバージョンは変わらない
- [x] カスタムフィールドキー: `custom_` + ランダム8桁hex。作成後変更不可

## 11. 未決事項

（現時点でなし）
