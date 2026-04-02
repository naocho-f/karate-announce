# 申込フォーム 仕様書

> **ステータス**: ドラフト
> **最終更新**: 2026-03-27
> **対象プロジェクト**: karate-announce
> **対象範囲**: 公開側の参加申込フォーム（描画・バリデーション・送信・メール・OGP）

---

## 1. 概要

### 1.1 目的
イベント（大会）への参加申込を Web フォームで受け付ける。フォームの構成はイベントごとに管理者が設定可能で、フィールドの表示/非表示・必須/任意・選択肢のカスタマイズが行える。

### 1.2 対象ルート
| ルート | 説明 |
|--------|------|
| `/entry/[eventId]` | 申込フォーム（公開、認証不要） |

### 1.3 関連仕様書
| 仕様書 | 関連内容 |
|--------|---------|
| FORM_CONFIG_SPEC.md | フォーム設定の管理側（フィールド定義・注意書き・カスタムフィールド） |
| EVENT_ADMIN_SPEC.md | イベント管理（受付開閉・バナー/OGP 画像・メール設定） |

---

## 2. 画面状態

### 2.1 状態遷移
```
[loading] → [closed]      ← entry_closed OR entry_close_at 超過
         → [not_ready]    ← フォーム未公開
         → [not_found]    ← イベント不存在
         → [form]         ← 通常表示
         → [submitting]   ← 送信中
         → [success]      ← 送信完了
```

### 2.2 各状態の表示

| 状態 | アイコン | メッセージ |
|------|---------|----------|
| `not_found` | なし | 「試合が見つかりません」 |
| `closed` | 🔒 | イベント名 + 「参加受付は終了しました。」 |
| `not_ready` | 🔧 | イベント名 + 「参加申込フォームは準備中です。」+「しばらくお待ちください。」 |
| `success` | ✅ | 「申込完了」+ 「{氏名} さんの参加申込を受け付けました。」+ 「別の方も申し込む」リンク |

**受付終了判定**:
```
entry_closed === true  OR  (entry_close_at != null AND entry_close_at <= now())
```

### 2.3 受付期限の表示
受付中かつ `entry_close_at` が設定されている場合、フォーム上部に期限を表示:
```
受付期限: YYYY/MM/DD HH:MM
```
表示形式: `new Date(entry_close_at).toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" })`（明示的に年・月・日・時・分のフォーマットオプションを指定。ブラウザのデフォルト `toLocaleString` ではなく、2桁固定の `2-digit` を使用）

---

## 3. フォーム構成

### 3.1 レイアウト
- **最大幅**: `max-w-md`（モバイルフォーカスの狭幅）
- **背景**: `bg-main-bg`（#101828）、テキスト: `text-white`
- **バナー画像**: フォーム上部に `w-full rounded-xl` で表示（`banner_image_path` が設定されている場合）

### 3.2 フォーム要素の表示順序
1. バナー画像（設定時のみ）
2. イベント名 + 「参加申込フォーム」サブヘッダー
3. 受付期限表示（設定時のみ）
4. `form_start` 注意書き（sort_order 順）
5. フィールド群（`form_field_configs.sort_order` 順）
   - 各フィールドの直後に `field` 注意書き（anchor_field_key 一致、sort_order 順）
6. `form_end` 注意書き（sort_order 順）
7. バリデーションエラーサマリー（エラー時のみ）
8. 送信ボタン

### 3.3 フィールドの表示/非表示
- `form_field_configs.visible === true` のフィールドのみ表示
- 読み仮名フィールド（kana）は親フィールドが表示されている場合のみ表示
- 親子ペア:
  - `full_name` ↔ `kana`
  - `organization` ↔ `organization_kana`
  - `branch` ↔ `branch_kana`

---

## 4. フィールド型と描画仕様

### 4.1 特殊フィールド

#### full_name（氏名）
- **描画**: 常に2カラムグリッド。読み仮名非表示時は1行（姓 | 名）、表示時は2行（姓 | 名 / 姓読み | 名読み）
- **DB マッピング**: `family_name`, `given_name`, `family_name_reading`, `given_name_reading`
- **バリデーション**: 必須時は姓・名の両方が入力済みであること
- **読み仮名バリデーション**: ひらがな・カタカナ・長音符・中黒・スペースのみ許可（正規表現: `/^[\u3040-\u309F\u30A0-\u30FF\u30FC\u30FB\s　]*$/`）

#### organization（所属団体）
- **描画**: ComboInput（オートコンプリート付きテキスト入力）+ `organization_kana` 入力
- **データソース**: `dojos` テーブルから `name`, `name_reading` を取得
- **自動入力**: ドロップダウンから選択時、`organization_kana` に `name_reading` を自動セット
- **自由入力**: ドロップダウン以外の値も入力可能
- **DB マッピング**: `school_name`, `school_name_reading`

#### branch（道場・支部名）
- **描画**: テキスト入力 + `branch_kana` 入力
- **DB マッピング**: `dojo_name`, `dojo_name_reading`（※ organization と branch の DB カラム名は直感と逆なので注意）

#### birthday + age（生年月日 + 年齢）
- **描画**: レスポンシブグリッド（モバイル: 1カラム、SM+: 2カラム）
  - 左: date 入力（初期値: `2000-01-01` でカレンダー表示位置を調整）
  - 右: 年齢の自動計算表示（読み取り専用。「XX歳（自動計算）」）
- **自動計算**: 基準日 = `event_date`（設定時）or 本日
  ```
  age = 基準年 - 誕生年
  基準日時点で誕生日を迎えていなければ age--
  ```
- **年齢不一致検出**: 手動入力された年齢と自動計算が不一致の場合、警告メッセージ表示（「生年月日から計算した年齢は XX 歳です（{基準}時点）」）
- **年代区分自動選択**: 生年月日入力時、大会日と生年月日から年度ベースで学年を判定し、年代区分（grade）を自動選択する。日本の学年制度（4月2日〜翌年4月1日生まれで区切り）に基づく。学年範囲外（18歳以上相当）は年齢ベース区分から該当するものを選択。自動選択後もユーザーが手動で変更可能。`gradeFromBirthDate()` で判定
- **DB マッピング**: `birth_date`, `age`

#### email（メールアドレス）
- **描画**: email 入力 + 確認用 email 入力
- **確認入力**: `hasConfirmInput: true` により2つ目の入力欄を表示（プレースホルダー: 「もう一度入力してください」）
- **不一致検出**: リアルタイムで一致チェック。不一致時はエラー表示
- **DB マッピング**: `extra_fields.email`（DB カラムなし → extra_fields に格納）

#### rule_preference（出場希望ルール）
- **描画**: イベントに紐づくルール（`event_rules` → `rules`）をチェックボックスまたはラジオボタンで表示
- **モード切替**: `custom_choices` に `__single_select__` マーカーがある場合はラジオボタン（単一選択）、なければチェックボックス（複数選択）
- **DB マッピング**: `entry_rules` テーブル（entry_id, rule_id の M:N）。entries テーブルには格納しない
- **フォールバック**: フォーム設定にルールフィールドがない場合、フォーム下部にレガシーのボタングリッドUIで表示

### 4.2 汎用フィールド型

| 型 | HTML 要素 | 備考 |
|----|-----------|------|
| `text` | `<input type="text">` | `placeholder`, `maxLength` 対応 |
| `textarea` | `<textarea rows={3}>` | `maxLength` 対応 |
| `number` | `<input type="number">` | `step`, `unit` 表示対応 |
| `tel` | `<input type="tel">` | |
| `email` | `<input type="email">` | 確認入力付き（`hasConfirmInput`） |
| `date` | `<input type="date">` | |
| `select` | `<select>` | プレースホルダー: 「選択してください」。「その他」オプション対応 |
| `radio` | `<input type="radio">` の並び | 「その他」オプション対応 |
| `checkbox` | `<input type="checkbox">` の並び | 複数選択。「その他」自由入力対応。`__single_select__` で単一選択モード |

### 4.3 「その他」オプション
- `form_field_configs.has_other_option === true` の場合、選択肢の末尾に「その他」を追加
- 「その他」選択時、自由入力欄を表示（プレースホルダー: 「その他の内容を入力」/ 「自由入力」）
- **送信値**: select/radio は `"other:{入力値}"`、checkbox は選択値の配列に `"other:{入力値}"` を追加

### 4.4 選択肢の優先順位
1. `form_field_configs.custom_choices`（管理者がイベント単位で設定した選択肢）
2. `FIELD_POOL` の `defaultChoices`（フィールド定義のデフォルト選択肢）
3. `FIELD_POOL` の `fixedChoices`（都道府県など変更不可の選択肢）

---

## 5. 入力状態管理

### 5.1 状態オブジェクト
| 状態 | 型 | 用途 |
|------|-----|------|
| `values` | `Record<string, string>` | テキスト・数値・単一選択の値 |
| `multiValues` | `Record<string, Set<string>>` | チェックボックス（複数選択）の値 |
| `otherValues` | `Record<string, string>` | 「その他」自由入力の値 |
| `consents` | `Record<string, boolean>` | 同意チェックボックスの状態（notice ID → boolean） |
| `selectedRules` | `Set<string>` | レガシールール選択（rule_preference フィールド未使用時のフォールバック） |
| `emailConfirm` | `string` | メールアドレス確認入力の値 |
| `fieldErrors` | `Record<string, string>` | フィールドごとのエラーメッセージ |

### 5.2 エラークリア
- 各 `setValue` / `setMultiValue` 呼び出し時に、該当フィールドのエラーを即座にクリア
- 送信ボタン押下時に全フィールドを再バリデーション

---

## 6. バリデーション

### 6.1 バリデーションルール

| チェック | 条件 | エラーメッセージ |
|---------|------|---------------|
| 必須チェック | `config.required && !isFieldFilled()` | 「{ラベル}は必須です」 |
| メール一致 | `email !== emailConfirm` | 「メールアドレスが一致しません」 |
| 読み仮名形式 | ひらがな/カタカナ以外の文字 | 「{サブラベル}はひらがなまたはカタカナで入力してください」（※サブラベルは「姓（読み）」「名（読み）」「団体名（読み）」「支部名（読み）」等の個別ラベルを使用。親フィールドのラベルではなくサブラベルを表示する。エラーは親フィールドの `fieldErrors` キーに格納される） |
| 年齢不一致 | 生年月日の自動計算と入力値が異なる | 「生年月日から計算した年齢は XX 歳です（{基準}時点）」 |
| 同意チェック | `notice.require_consent && !consents[notice.id]` | 「「{ラベル}」にチェックしてください」 |

### 6.2 フィールド入力済み判定（`isFieldFilled()`）
| フィールド | 入力済み条件 |
|-----------|------------|
| `full_name` | `family_name` AND `given_name` が非空 |
| `kana` | `family_name_reading` AND `given_name_reading` が非空 |
| checkbox（複数選択） | `multiValues[key].size > 0` |
| checkbox（単一選択） | `values[key]` が非空 |
| radio / select | `values[key]` が非空 |
| その他 | `values[key]` が非空 |

### 6.3 送信ボタンの活性化条件（`canSubmit`）
以下のすべてが true の場合のみ送信可能:
- 送信中でない
- 年齢不一致がない
- メール不一致がない
- 全必須フィールドが入力済み
- メール確認入力が完了（email フィールドが必須の場合）
- 全同意チェックが ON

### 6.4 エラー表示
- **フィールドレベル**: 各フィールド直下に赤文字でエラーメッセージ。入力欄のボーダーが `border-red-500` に変化
- **サマリー**: 送信ボタン直上に赤背景のエラーリスト（「入力内容を確認してください」+ 箇条書き）
- **自動スクロール**: 最初のエラーフィールドに `scrollIntoView({ behavior: "smooth", block: "center" })` でスクロール

---

## 7. 送信フロー

### 7.1 ペイロード構築（`buildPayload()`）

**DB カラムマッピング**:
| フォームフィールド | DB カラム | 備考 |
|-------------------|----------|------|
| `full_name` → 姓 | `entries.family_name` | |
| `full_name` → 名 | `entries.given_name` | |
| `kana` → 姓読み | `entries.family_name_reading` | |
| `kana` → 名読み | `entries.given_name_reading` | |
| `organization` | `entries.school_name` | ※歴史的命名（8.7 注記参照） |
| `organization_kana` | `entries.school_name_reading` | |
| `branch` | `entries.dojo_name` | ※歴史的命名（8.7 注記参照） |
| `branch_kana` | `entries.dojo_name_reading` | |
| `birthday` | `entries.birth_date` | |
| `age` | `entries.age` | |
| `sex` | `entries.sex` | |
| `weight` | `entries.weight` | `parseFloat` 変換 |
| `height` | `entries.height` | `parseFloat` 変換 |
| `phone` | `entries.extra_fields.phone` | DB カラムなし |
| `email` | `entries.extra_fields.email` | DB カラムなし |
| `prefecture` | `entries.extra_fields.prefecture` | DB カラムなし |
| `rule_preference` | `entry_rules` テーブル | entries には格納しない |
| カスタムフィールド | `entries.extra_fields.{key}` | |

**`extra_fields` に格納されるフィールド**: `dbColumn` プロパティが未設定のフィールドすべて（email, phone, prefecture, カスタムフィールド等）

**バージョン記録**: `entry.form_version = formConfig.version`（管理者がフォーム設定を更新するとインクリメントされる。旧バージョンでの送信を識別可能）

### 7.2 API リクエスト

**エンドポイント**: `POST /api/public/entry`

**リクエストボディ**:
```json
{
  "entry": {
    "event_id": "uuid",
    "family_name": "山田",
    "given_name": "太郎",
    "weight": 65.5,
    "extra_fields": { "email": "test@example.com", "phone": "090-xxxx-xxxx" },
    "form_version": 3
  },
  "school_name": "空手道場A",
  "rule_ids": ["uuid1", "uuid2"]
}
```

### 7.3 API 処理フロー
1. **受付終了チェック**: `entry_closed` OR `entry_close_at <= now()` → 403
2. **道場自動作成**: `school_name` が送信され、`dojos` テーブルに同名レコードがなければ自動挿入
3. **エントリー挿入**: `entries` テーブルに INSERT → `created.id` 取得
4. **ルール挿入**: `entry_rules` テーブルに `(entry_id, rule_id)` を INSERT
5. **メール送信**: fire-and-forget で確認メール送信（失敗しても申込は成功）
6. **レスポンス**: `{ id: "新規エントリーID" }`

### 7.4 エラーハンドリング
- API エラー時: 「送信に失敗しました。もう一度お試しください。」を表示
- 受付終了時: 「参加受付は終了しました」（403）
- メール送信失敗: ログ出力のみ。エントリー作成は成功扱い

---

## 8. 確認メール

### 8.1 送信条件
以下のすべてが true の場合にメール送信:
- `RESEND_API_KEY` 環境変数が設定されている
- `entry.extra_fields.email` にメールアドレスが存在する
- イベントデータが取得できる

### 8.2 送信先
| 宛先 | アドレス |
|------|---------|
| To | 申込者のメールアドレス（`extra_fields.email`） |
| BCC | `events.notification_emails`（管理者通知。設定されている場合のみ） |

### 8.3 送信元
`RESEND_FROM_EMAIL` 環境変数。未設定時は `"参加受付 <onboarding@resend.dev>"`（Resend テスト用）

### 8.4 テンプレート

**デフォルト件名**:
```
【{{event_name}}】参加申込を受け付けました
```

**デフォルト本文**:
```
{{participant_name}} 様

{{event_name}} への参加申込を受け付けました。

{{#event_date}}
■ 開催日: {{event_date}}
{{/event_date}}
{{#venue_info}}
■ 会場情報:
{{venue_info}}
{{/venue_info}}

■ 申込内容:
{{entry_details}}

ご不明な点がございましたらお問い合わせください。
```

**カスタムテンプレート**: `events.email_subject_template` / `events.email_body_template` が設定されていればそちらを優先

### 8.5 テンプレート変数
| 変数 | 値 |
|------|-----|
| `{{participant_name}}` | `family_name + " " + given_name`。未設定時は「申込者」 |
| `{{event_name}}` | イベント名 |
| `{{event_date}}` | 開催日（YYYY-MM-DD） |
| `{{venue_info}}` | 会場情報 |
| `{{entry_details}}` | 申込内容のテキスト整形（下記参照） |
| `{{submission_date}}` | 申込日時（JST、`toLocaleString("ja-JP")` 形式） |

### 8.6 テンプレート構文

**変数置換**: `{{key}}` → 対応する値に置換。未定義の変数は空文字に

**条件ブロック**: `{{#key}}...{{/key}}` → key の値が存在し非空の場合のみブロック内を出力

### 8.7 申込内容テキスト（`entry_details`）の生成
以下の順序で行を構築:
1. `氏名: {family_name} {given_name}`
2. `性別: 男性/女性`（sex が male/female の場合）
3. `生年月日: {birth_date}`
4. `年齢: {age}歳`
5. `体重: {weight}kg`
6. `身長: {height}cm`
7. `所属: {dojo_name}`（← branch の値。DB カラム名と表示ラベルの対応は下記注記参照）
8. `支部: {school_name}`（← organization の値。同上）
9. `参加ルール: {ルール名カンマ区切り}`
10. extra_fields の各項目（email, email_confirm を除く。配列値はカンマ区切り）

> **注記: DB カラム名と UI ラベルの歴史的な不一致**
>
> DB カラム名はフォームフィールド名・UI ラベルと直感的に逆になっている（7.1 参照）:
>
> | フォームフィールド | UI ラベル | DB カラム | メールでの表示ラベル |
> |-------------------|----------|----------|-------------------|
> | `organization` | 所属団体 | `school_name` | 支部 |
> | `branch` | 道場・支部 | `dojo_name` | 所属 |
>
> これは歴史的な命名の経緯によるもので、既存データとの互換性のため維持している。
> メール生成コードは DB カラム名（`entry.dojo_name`, `entry.school_name`）を直接参照するため、
> フォームフィールド名からは逆に見える点に注意。

---

## 9. OGP メタデータ

### 9.1 生成方式
`app/entry/[eventId]/layout.tsx` の `generateMetadata()` でサーバーサイド生成。

### 9.2 メタデータ内容
| タグ | 値 |
|------|-----|
| `title` | `{イベント名} - 参加申込` |
| `description` | `{イベント名}の参加申込フォーム（{開催日}）` |
| `og:title` | 同上 |
| `og:description` | 同上 |
| `og:image` | OGP 画像 URL（下記優先順位） |
| `twitter:card` | 画像あり: `summary_large_image` / 画像なし: `summary` |

### 9.3 OGP 画像の優先順位
1. `events.ogp_image_path`（OGP 専用画像）
2. `events.banner_image_path`（バナー画像にフォールバック）
3. なし（og:image タグなし）

画像サイズ: `width: 1200, height: 630`

---

## 10. 注意書き（Notice）

### 10.1 表示位置
| `anchor_type` | 表示位置 |
|---------------|---------|
| `form_start` | フォーム上部（フィールド群の前） |
| `field` | `anchor_field_key` で指定されたフィールドの直後 |
| `form_end` | フォーム下部（フィールド群の後） |

### 10.2 注意書きの要素
| 要素 | 条件 | 描画 |
|------|------|------|
| テキスト | `text_content` が存在 | 黄色背景の注意テキスト（`text-yellow-500/80 bg-yellow-900/20`） |
| スクロールテキスト | `scrollable_text` が存在 | `max-h-40 overflow-y-auto` のスクロール領域 |
| 画像 | `images[]` が存在 | `sort_order` 順に `w-full rounded-lg` で表示 |
| リンク | `link_url` が存在 | 青文字の外部リンク（`target="_blank"`） |
| 同意チェック | `require_consent === true` | チェックボックス + ラベル（デフォルト: 「上記に同意します」） |

### 10.3 注意書きのスタイル
```
外枠: bg-gray-800/30 border-l-2 border-yellow-600/40 rounded-r-lg pl-3 pr-2 py-2
```

---

## 11. 決定済み事項

- [x] フォーム幅: `max-w-md`（モバイルファーストの狭幅）
- [x] バリデーション: クライアントサイドのみ（サーバーサイドは受付終了チェックのみ）
- [x] メール送信: fire-and-forget（失敗しても申込は成功）
- [x] 道場の自動作成: 未登録の道場名は自動でマスタに追加
- [x] フォームバージョン: 送信時に `form_version` を記録し、旧バージョンでの送信を識別可能に
- [x] organization → school_name、branch → dojo_name の DB マッピング（直感と逆だが既存のため維持）
- [x] OGP 画像: ogp_image_path → banner_image_path のフォールバック
- [x] 確認メール: Resend API 使用。テンプレートは `{{変数}}` + `{{#条件}}...{{/条件}}` 構文

## 12. 未決事項

（現時点でなし）
