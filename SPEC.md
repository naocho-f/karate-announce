# karate-announce システム仕様書

> **このドキュメントについて**
> 開発の進捗に合わせて随時更新すること。新機能追加・仕様変更・廃止した機能は必ずこのドキュメントに反映する。
> 最終更新: 2026-03-28（タイマープリセット: カラーピッカー化+テーマプレビュー追加）

---

## 1. システム概要

空手大会の試合管理・AI アナウンスシステム。
試合の参加受付から対戦表作成、コート進行、結果配信までを一貫して管理する。

**技術スタック**
- フレームワーク: Next.js 16 (App Router) + TypeScript
- スタイリング: Tailwind CSS 4
- データベース: Supabase (PostgreSQL)
- AI音声: OpenAI TTS (tts-1 モデル)
- デプロイ: Vercel（karate.naocho.net）

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

## 3. 画面一覧と機能要件

### 3.1 ホームページ (`/`)

- アクティブな大会（`events.is_active = true`）の対戦表を表示
- コートごとの対戦サマリーを一覧表示
- 対戦カード（選手名・状態・勝者）をリアルタイム表示
- 横幅: `max-w-5xl`

### 3.2 参加申込フォーム (`/entry/[eventId]`)

参加申し込みフォーム。**フォーム設定に基づいて動的にレンダリング**される。

**動的OGPメタデータ**
- `app/entry/[eventId]/layout.tsx` で `generateMetadata()` を実装
- og:title: `{大会名} - 参加申込`、og:description: `{大会名}の参加申込フォーム（{開催日}）`
- og:image: OGP画像 → バナー画像 → なし（優先順位でフォールバック）
- LINE/Twitter等でURL共有時にプレビュー表示

**バナー画像（大会ポスター）**
- フォーム上部に画面幅で大きく表示（`w-full rounded-xl`）
- 管理者がイベントごとにアップロード（`events.banner_image_path`）
- Supabase Storage `form-notice-images` バケット内 `event-banners/{eventId}/` に保存
- API: `POST/DELETE /api/admin/events/[id]/banner`

**受付期限表示**
- `events.entry_close_at` が設定されている場合、フォームヘッダーに「受付期限: YYYY/MM/DD HH:MM」を黄色テキストで表示
- 期限切れの場合は受付終了画面（🔒）を表示

**動的フォーム**
- 管理者がステップ①のフォーム設定タブで項目の表示/非表示・必須/任意を設定
- フォーム設定が `is_ready=false`（準備中）の場合、準備中画面を表示
- 項目は `form_field_configs.sort_order` の順に表示

**項目プール（`lib/form-fields.ts`）**

開発者が定義する全項目プール。操作者が大会ごとに表示/非表示を切り替える。管理者は固定項目に加えて「自由設問」を追加可能（後述）。

| カテゴリ | 項目例 |
|---------|--------|
| 固定項目 | フルネーム、よみがな、年齢、性別、生年月日、都道府県、電話番号、メールアドレス、所属団体、道場・支部名、格闘技経験、身長、体重、出場希望ルール、備考 |
| 自由設問（デフォルト） | 保護者名、試合経験、希望試合数、頭突き希望、持っている防具、シールド面・フィストガード・レッグガード・ファールカップ・道着・帯の有無 |
| 自由設問（管理者追加） | `custom_*` キーで任意に追加されたフィールド |

**特殊フィールド**
- `full_name`: 姓名を2列グリッドで表示。読み仮名（`kana`）が有効なら4列表示
- `organization`: 道場マスタからセレクト + 自由入力。読み仮名欄は常に表示し、マスタ選択時は読み仮名を自動入力（手動編集も可能）。「その他」ON時は自由入力欄を表示
- `branch`: 道場・支部名 + 読み仮名
- `rule_preference`: 管理者設定に応じてチェックボックス（複数選択）またはラジオボタン（単一選択）で表示。選択肢は `event_rules` → `rules` テーブルから動的取得（UUID ベース）。選択値は `entry_rules` テーブルに保存され、対戦表作成時のルール振り分けに直接使用
- メールアドレス: 確認入力欄を自動付随
- `birthday` + `age` 統合表示: レスポンシブ2列グリッド（スマホ縦積み `grid-cols-1`、PC横並び `sm:grid-cols-2`）で生年月日入力と大会日時点の年齢を自動計算表示（管理画面プレビューと同一レイアウト）。生年月日入力時に年齢を自動セット。整合性チェック（矛盾時にエラー表示）。カレンダーの初期表示は2000年（`2000-01-01`）

**注意書き**
- 管理者が任意で登録。フォーム先頭・項目間・フォーム末尾に配置可能
- テキスト、スクロール可能テキスト（規約等）、画像、リンク、同意チェックボックスをサポート
- 同意チェックが必須の注意書きは、未チェック時にバリデーションエラーとして表示

**バリデーションとエラー表示**
- 「申し込む」ボタンは常に押下可能（送信中のみ `disabled`）。未入力でも押せるが、バリデーションエラーが表示される
- ボタン押下時にバリデーション実行: 必須未入力・メール不一致・年齢矛盾・同意未チェックをすべてチェック
- エラー時はボタン上部にエラーサマリー（赤枠内に項目リスト）を表示し、最初のエラー箇所に自動スクロール
- 各フィールドに赤枠 + エラーメッセージ（「〇〇は必須です」等）を個別表示
- 値を入力・同意チェックするとリアルタイムでエラーがクリアされる
- `canSubmit` が `false` のときはボタンが薄い色（`bg-blue-600/60`）になり、`true` で鮮やかなブルーに変化

**送信データ**
- DB の既存カラムに対応する項目はそのまま保存（`family_name`, `weight`, `sex` 等）
- 既存カラムにない項目は `entries.extra_fields`（JSONB）に保存（GIN インデックスで検索可能）
- `rule_preference` の選択値は `entry_rules` テーブルに rule UUID で保存（`extra_fields` には入れない）
- `form_version` を記録（管理画面で旧バージョンの申込を識別可能）

**自由設問（カスタムフィールド）**
- 管理者がフォーム設定画面から任意の項目を追加・削除・複製可能
- タイプ: テキスト（1行）、テキスト（複数行）、数値、プルダウン選択、チェックボックス（複数選択）
- 定義は `custom_field_defs` テーブルに保存、`field_key` は `custom_{8桁hex}` で自動生成
- 入力値は `entries.extra_fields` JSONB に `{"custom_xxx": "値"}` として格納
- `form_field_configs` にも行が作成され、表示/非表示・必須/任意・並び順は固定項目と同じ仕組みで管理
- 固定項目との視覚的区別: 紫の「自由設問」バッジ、削除・複製ボタン付き（固定項目は削除不可）
- 大会複製時にカスタムフィールド定義もコピーされる

**フォールバック**
- `rule_preference` フィールドがフォーム設定に含まれない場合、既存のルール選択UI（event_rules ベース）を表示

### 3.3 ライブ速報ページ (`/live`)

- 全コートの対戦表をリアルタイム表示（5秒ポーリング）
- コートごとに `event.court_names` で登録されたコート名を表示（未設定時は「コートN」フォールバック）
- 1コートに複数トーナメントがある場合もフラットに統合表示
- **試合番号順に並べ替え**: トーナメント・ラウンドに関係なく `match_label` の数値部分（正規表現 `/(\d+)/` で抽出）の昇順で表示。コート画面・ライブ速報の両方で共通ロジック使用
- **不戦勝の専用表示**: 1回戦で fighter2 なしの試合はコンパクトな1行表示（選手名＋「不戦勝」）
- **試合中バナー**: 試合中の対戦を sticky ヘッダー内に固定表示（タブと同様にスクロール追従）
- 勝者・結果をリアルタイム反映
- **コートタブ切り替え**: 2コート以上の場合、ヘッダー下に画面幅いっぱいの均等分割タブを表示。タップで切り替え。試合中のコートには青いパルスドットを表示。1コートの場合はタブ非表示
- **2行レイアウト**: 各試合行は1行目に試合番号＋ステータス、2行目に選手名 vs 選手名で改行なく表示。勝者の「勝」バッジは選手名とは独立した要素で、名前が truncate されてもバッジが名前に混ざらない
- **進行中・次の試合の強調表示**: 試合中の行は太い青枠＋青いグローで強調。進行中がない場合は次の試合（最初の `ready` 試合）を黄枠＋黄グローで強調。パルスドット付きバッジ（「試合中」「次の試合」）で状態を明示
- ログイン不要・スマホ最適化（`max-w-lg`、コンパクトなパディング、truncate で改行防止）
- ヘッダーは `sticky` でスクロール追従

### 3.4 コート画面 (`/court/[court]`)

試合進行担当者が操作する画面。

**機能**
- コートに紐づく全トーナメントを `sort_order` 順に上から縦に並べて表示（`status: "finished"` を除く）
- トーナメントごとに `BracketView` を表示。ブラケット上で全操作を完結させる
- **データ読み込み中表示**: 初回データ取得前はスピナー＋「読み込み中...」を表示
- **試合開始オーバーレイ（▶ 試合開始）**: `ready` 状態かつ両選手揃っている試合はカード全体をオーバーレイで覆い、タップで試合開始。AI アナウンス実行＋状態を `ongoing` に変更。進行中試合（`ongoing`）が存在する場合はオーバーレイを非表示にして誤操作を防止
- **カードの視覚的優先度**: コート全体（トーナメント横断）で次の試合・進行中を判定。一目で次の試合がわかるよう強弱をつける
  - 進行中（`ongoing`）: 黄色ボーダー＋グロー（コートで最大1つ）
  - 次の試合（`nextMatchId`）: 明るい青ボーダー＋強いグロー＋パルスアニメーション。オーバーレイに「▶ 試合開始」を大きく表示（コートで最大1つ）
  - その他の `ready` 試合: `opacity-40` でトーンダウン。オーバーレイは薄い灰色で「▶」のみ
  - 終了済み（`done`）: 通常表示（控えめな緑ボーダーで終了を示す）
- **勝者確定**: `ongoing` 状態の試合で選手スロットをタップして勝者確定。次ラウンドに自動進出・勝者アナウンス
- **試合順入替（↕ 次）**: ブラケットカードのフッターに表示。DB の `position` を 3 ステップスワップで更新（`UNIQUE(tournament_id, round, position)` 制約回避）
- **棄権トグル（棄 ボタン）**: 各選手スロットの右端に表示（`done`/`ongoing` 以外）。`entries.is_withdrawn` を更新。棄権中の選手は取り消し線＋「棄権」バッジで表示
- **アナウンスミュート（🔊/🔇）**: 各試合カードのフッターにスピーカーボタンを表示（`done` 以外）。試合ごとに AI アナウンスの ON/OFF を切り替え可能。ミュート状態は LocalStorage に保存。決勝など人間アナウンスに切り替えたい試合で使用
- **ローディングオーバーレイ**: ボタン操作中のカードにスピナーオーバーレイを表示（`processingMatchIds: Set<string>` で管理）
- **試合番号バッジ**: ブラケットカードの**フッター左端**に `match_label` を表示（試合中は黄色、次の試合は青、終了は灰色）。選手名との重なりを避けるためフッターに配置
- **ナビゲーションバナー**: コート全体で1つだけ表示（トーナメント横断で判定）。`sticky top-0` でスクロール追従
  - 上段: 試合番号・状態 ＋ 操作ヒント（右寄せ）
  - 下段: 選手名 vs 選手名（長い場合は truncate）
  - 試合中（`ongoing`）: 黄色バナー「第X試合 試合中」。タップで該当試合カードにスムーズスクロール
  - 次の試合あり（`ready`）: 青バナー「次の試合：第X試合」。タップで該当カードにスムーズスクロール。該当カードはパルスアニメーション付き青ボーダーで強調
  - 全試合終了: 緑バナー「全試合終了」
- 3秒ごとに自動リロード（変化がない場合は再レンダリングしない）
- 横幅: `max-w-5xl`

**対戦相手なし（不戦勝）の表示**
- fighter が null のスロット: ラウンド1なら「不戦勝」、それ以外は「○回戦 第○試合勝者」と表示（BYE という表現は使わない）

**棄権の扱い**
- 棄権状態は `entries.is_withdrawn` フラグで管理
- 試合中に棄権した場合でも特別なアナウンスは不要。通常の勝者アナウンスのみ
- 棄権バッジは操作補助のための表示（間違えないよう視認性を高める目的）

### 3.5 管理画面ホーム (`/admin`)

認証必須。タブナビゲーション。

**タブ一覧**

| タブ | 機能 |
|------|------|
| ホーム | ダッシュボード（進行中の試合・次の試合・要対応・参加受付状況） |
| 試合 | 試合（大会）管理・過去の大会から複製 |
| 設定 | TTS 設定＆アナウンステンプレート・流派マスタ・ルールマスタ管理・タイマープリセット（別ページへ遷移） |
| 操作説明 | セットアップガイド（6ステップ）・対戦相性マーク説明・速報ページ案内 |

**ホームタブ（ダッシュボード）**
- **進行中**: `is_active: true` の試合。コートごとにコート画面（`/court/[n]`）への直リンクボタンを表示
- **次の試合**: 開催日が最も近い準備中の試合名・開催日・あと何日を表示
- **要対応**: 参加者が1名以上いるが対戦表（tournaments）が未作成の試合を警告表示
- **参加受付状況**: 準備中〜進行中の試合の参加者数と受付状態（受付中／締切済）一覧
- 試合が1件もない場合は「試合を作成する →」ボタンを表示
- 読み込みが **10秒** を超えた場合はタイムアウトエラーを表示し、「再試行」ボタンで再読み込み可能

**試合タブ**
- 試合一覧（開催日降順）。各試合に「アクティブに設定」「管理画面を開く」「複製」「削除」ボタン
- **新規作成**: 大会名・開催日・コート数・コート名・ルールを指定して作成
- **過去の大会から複製**: 各試合の「複製」ボタンからモーダルを開く。コピー対象:
  - 大会名（デフォルト「{元の名前}（コピー）」）、コート数・コート名、体重差/身長差上限、ルール紐づけ、フォーム設定（フィールド・注意書き・画像参照・カスタムフィールド定義）
  - 参加者は任意コピー（チェックボックスで明示的にON + 確認ダイアログで注意喚起）
  - コピーしないもの: status（常に preparing）、is_active、entry_closed、トーナメント・試合結果
  - エラーハンドリング: 複製途中で失敗した場合、作成済みの関連データを子→親の順でクリーンアップしてからエラーを返却。中途半端なデータは残らない

**操作説明タブ**
- セットアップ手順（6ステップ）のアコーディオン表示（各ステップにUI模式図・タブへのリンクあり）
- 対戦相性マーク（◎△✕－）の説明
- 観客向け速報ページ（`/live`）の案内・URL コピーボタン

**その他のページ**
- `/admin/spec`: 仕様書（本ドキュメント）の表示ページ。ヘッダーの「仕様書」リンクからアクセス。静的ページ（認証不要）

**存在しないタブ（廃止済み）**
- ~~Fighters（選手タブ）~~: 削除済み（2026-03-22）

**Settings タブ**
- TTS 音声選択（6種類: Nova, Shimmer, Alloy, Echo, Fable, Onyx）
- TTS 速度調整（0.5x〜1.5x）
- アナウンステンプレート カスタマイズ（試合開始・勝者発表）
- テンプレート変数一覧（変数名・説明・サンプル値を統合表示）
- テンプレートプレビュー（サンプル値で展開した結果を表示）

### 3.6 試合詳細画面 (`/admin/events/[id]`)

対戦表の組成から確定・閲覧まで担うコア画面。**3ステップ構成**。

ステップは自由に行き来可能（ウィザードではない）。トーナメントが1件以上ある場合はロード時に自動でステップ②を表示。ステップ③（試合番号設定）はトーナメントが未作成の場合は非活性。

**メタ情報（開催日・コート名）インライン編集**（ステップ外・常時表示）
- ページ上部に開催日・コート数・コート名を表示。「編集」ボタンで展開してインライン編集可
- 変更後「保存」で `PATCH /api/admin/events/[id]` に送信

---

#### ステップ① 参加者管理

サブタブ構成: 「参加者管理」「フォーム設定」「メール設定」

**フォーム設定タブ（`FormConfigPanel`）**
- **フォームプレビュー型UI**: 実際の参加申込フォームに近い見た目で項目を表示し、その場で設定変更が可能
  - カードは**ヘッダー（2段構成）**と**ボディ（プレビュー専用）**に分離
  - **ヘッダー1段目**: 表示順番号・▲▼移動（「順序」テキスト付き）・必須/任意・表示/非表示トグル
  - **ヘッダー2段目**: ラベル編集・選択肢設定ボタン・注意書き追加ボタン・その他オプション。操作系をすべてヘッダーに集約
  - ボディは入力プレビューと注意書き表示のみ（操作ボタンなし）
  - 「選択肢設定」ボタンは選択肢のある項目（radio/checkbox/select）のみ表示。ボタンスタイルで目立たせる
  - **トグルスイッチ**: 各項目ヘッダー右端にトグルで表示/非表示を切り替え。非表示時はボディにフィールド名のみ表示
  - 読み仮名フィールドは親フィールドに従属表示（親が非表示なら読み仮名も非表示）
  - **生年月日＋年齢統合**: birthday と age を1カードに統合表示（左: 生年月日入力、右: 大会日時点の年齢を自動計算表示）
- **ラベル編集**: 各項目のラベルをクリックすると、インライン入力に切り替わりカスタムラベルを設定可能。空にするとデフォルトラベルに戻る。DB の `form_field_configs.custom_label` に保存され、参加申込フォームに反映される
- **選択肢編集**: 選択肢のある項目はカード内に直接「選択肢を編集...」ボタンを表示。詳細展開時は常時テキストエリアで編集可能
- **詳細設定**: 「その他の回答」オプション・選択肢編集
- **DB管理フィールド**（所属団体・出場希望ルール）: 選択肢はDB管理のため「選択肢設定」ボタンを非表示。代わりに設定画面へのリンクと登録済みデータのプレビューを表示
  - 所属団体: ボディに「設定 > 道場/団体マスター」へのリンクを表示。ヘッダーに「その他」チェックボックスを常時表示し、ONにすると参加者が未登録の団体名を自由入力できる
  - 出場希望ルール: ボディに「設定 > ルール管理」で登録済みのルール名一覧を表示。ヘッダーに「複数選択／単一選択」切替ドロップダウンを表示し、参加者が複数ルールに申し込めるか1つだけか選べる。単一選択時は参加申込フォーム上でラジオボタン表示になる（内部的には `custom_choices` の `__single_select__` マーカーで管理）
- **ルール説明のデフォルト注意書き**: フォーム設定初回作成時、イベントに紐づくルールに `description` が設定されている場合、`rule_preference` フィールド直下の注意書き（`form_notices`）として「【ルール名】\n説明」形式で自動挿入される。管理者は挿入後に自由に編集・削除可能
  - いずれも「その他」オプションのON/OFFはヘッダーから直接切り替え可能
- **注意書き（インライン）**: フォーム先頭・項目直下・フォーム末尾に配置可能
  - テキスト、スクロール可能テキスト（規約等）、画像アップロード、リンク、同意チェックボックス
  - プレビューモードでは画像を実際のフォームと同じ `w-full` で表示（実寸に近いプレビュー）
  - プレビュー/編集モード切り替え
- **スピナー表示**: 注意書きの追加・削除・更新・画像アップロード中にスピナーをオーバーレイ表示。保存ボタンにもスピナー表示
- **過去の大会からコピー**: 過去の大会のフォーム設定をコピーして微修正可能
- **公開**: 「公開する」ボタンでバージョンをインクリメントして `is_ready=true` に設定
- 参加者が既にいる状態でも設定変更可能

**メール設定タブ（`EmailSettingsPanel`）**
- **確認メール送信**: 参加申込完了時に申込者へ確認メールを自動送信（Resend使用）
  - 送信条件: `RESEND_API_KEY` が設定済み かつ 申込者がメールアドレスを入力済み
  - 送信は fire-and-forget（メール送信失敗でも申込は成功する）
  - 各ステップで `[email]` プレフィックス付きログを出力（Vercel ログで追跡可能）
  - 送信元: `RESEND_FROM_EMAIL` 環境変数 or デフォルト `onboarding@resend.dev`
- **管理者通知メールアドレス**: イベントごとに `events.notification_emails`（text[]）を設定。BCCで管理者にも送信
- **件名テンプレート**: `events.email_subject_template`。デフォルト: `【{{event_name}}】参加申込を受け付けました`
- **本文テンプレート**: `events.email_body_template`。デフォルトテンプレートあり
- **会場情報**: `events.venue_info`。テンプレート変数 `{{venue_info}}` で本文に挿入
- **テンプレート変数**: `{{participant_name}}`, `{{event_name}}`, `{{event_date}}`, `{{venue_info}}`, `{{entry_details}}`, `{{submission_date}}`
- **条件ブロック**: `{{#key}}...{{/key}}` — 値がある場合のみ表示
- テンプレート処理: `lib/email-template.ts`

**参加者管理タブ**
- **参加申込フォーム URL** 表示（公開フォームへのリンク）
- **参加受付切り替えボタン**: 「受付中」「受付終了」をワンクリックでトグル
  - `events.entry_closed = false`: 受付中（緑ボタン「受付終了にする」表示）
  - `events.entry_closed = true`: 受付終了（赤バッジ＋「受付再開する」ボタン表示）
  - 管理者が自由に切り替え可能
  - 受付終了中は公開フォーム (`/entry/[eventId]`) に 🔒 ロック画面を表示
  - 受付終了中は `/api/public/entry` が 403 を返し送信を拒否
- **受付自動終了**: `events.entry_close_at`（timestamptz）を設定すると、指定日時に自動で受付終了
  - cronは使わず、リクエスト時に判定: `entry_closed === true` OR `now() > entry_close_at` → 受付終了
  - datetime-local 入力 + 保存/クリアボタン。JST→UTC変換して保存
  - 期限切れ/予約済みのステータス表示あり
- **バナー画像/OGP画像アップロード**: 参加受付セクション内に画像アップロードUI
  - バナー画像: エントリーフォーム上部に表示される大会ポスター
  - OGP画像: SNS共有時のサムネイル（推奨1200x630）。未設定時はバナー画像をフォールバック
  - API: `POST/DELETE /api/admin/events/[id]/banner` および `/api/admin/events/[id]/ogp`
- **QRコード**: 参加申込フォームURLセクションにQRコードプレビュー + PNGダウンロードボタンを表示
  - クライアントサイドで `qrcode` ライブラリを使用して生成（API不要）
  - 配色: 標準の黒ドット + 白背景
- **参加者一覧**（`EntriesSection`）
  - 番号・氏名・所属・体格情報・ルール設定・メモ
  - **旧バージョンマーク**: フォーム設定更新後に古いバージョンで入力された参加者に「旧ver」バッジ（紫）を表示。フォーム設定導入前の参加者にも灰色の「旧ver」バッジを表示
  - シードマーク（★/☆）は**廃止**（2026-03-22 削除）
  - **メモボタン分離**: 申込備考ボタン（`e.memo` がある場合のみ表示、グレー系「申込備考あり」）と管理者メモボタン（常時表示、メモなし→「メモ記入」/メモあり→黄色「メモあり」）を個別に表示。クリックで各パネルが独立して展開
  - **氏名リンク**: 選手名クリックで参加者詳細画面（`/admin/events/[id]/entries/[entryId]`）へ遷移
  - ルールチップ: イベントにルールがある場合のみ表示
  - **欠場登録**: 各行に「欠場」ボタン。欠場状態はオレンジバッジで表示し行を薄く表示（`opacity-50` + `line-through`）。「復帰」ボタンで取消可
  - 欠場中の選手は対戦表作成の選手一覧から除外される
  - カウント表示: 「N名参加 / M名欠場」形式
  - **テストデータ生成**: 「テスト32名追加」ボタンで、参加申込フォームの全項目（性別・生年月日・読み仮名・電話番号・メールアドレス・都道府県・保護者名・試合経験・防具情報等の extra_fields を含む）が入ったダミー参加者を一括生成。`is_test = true` で識別。「テスト削除」ボタンで一括削除可能
  - **CSV出力**: 「CSV出力」ボタンで全参加者の全項目をCSVダウンロード。BOM付きUTF-8でExcel/スプレッドシート対応。フォーム設定の `visible=true` な項目を `sort_order` 順に列化し、読み仮名は親フィールドに統合（括弧表記）、年齢も生年月日に付加。複数回答（checkbox）はセミコロン区切りでラベルに変換、select/radio も選択肢ラベルに変換。出場ルールは `entry_rules` からルール名を解決してセミコロン区切りで出力。電話番号等の tel 型フィールドは `="value"` 形式で先頭0落ちを防止。管理者メモ・欠場・テスト・申込日時・フォームverの固定列も出力。ファイル名: `{イベント名}_参加者一覧_{YYYYMMDD_HHmm}.csv`

**参加者詳細画面** (`/admin/events/[id]/entries/[entryId]`)
- 参加者一覧から選手名クリックで遷移
- フォーム設定で表示ON（visible）だった全項目を `sort_order` 順に表示（ラベル＋値）
- 読み仮名フィールドは親フィールドに統合表示（「山田 太郎（やまだ たろう）」形式）
- 生年月日は年齢も付加表示
- select/checkbox の値は選択肢ラベルに変換して表示
- 出場ルール: バッジ形式で表示
- 申込備考: 読み取り専用で表示
- 管理者メモ: テキストエリアでインライン編集可能（`onBlur` で自動保存）
- 申込日時、フォームバージョン、欠場/テストバッジを表示

---

#### ステップ② 対戦表作成

**変更検知バナー**
- トーナメント作成後に新規参加者が追加された場合、または欠場者がいる場合に黄色の警告バナーを表示
- 参加受付がまだ「受付中」の場合、青色のヒントも表示

**ダッシュボードパネル（`DashboardPanel`）**
- ルールごとの参加者数・欠場者数・体重統計（最小・最大・平均）を表示
- **組み合わせ提案（`computeSuggestions`）**: 年齢・体重のしきい値で分割したとき、各グループの人数バランスを評価して提案を生成
  - 年齢しきい値: 15, 18, 20, 25, 30, 31, 35, 40, 45 歳
  - 体重しきい値: 45, 50, 55, 60, 65, 70, 75, 80 kg
  - 評価: ◎（バランス良好）△（やや偏り）✕（偏りが大きい）
  - 子ども（15歳未満）は体重許容差 5 kg、成人は 10 kg で評価
  - 人数 2 名未満のグループが含まれる提案は除外
  - ルールごとに展開可能なカード表示（`DashboardCard`）

**コートごとの対戦表作成（`CourtSection`）**
- コート数に応じてコートタブを表示
- **トーナメントとワンマッチの2種類**: 「＋ トーナメントを追加」と「＋ ワンマッチを追加」の2ボタン
  - **トーナメント**: 複数ペアのトーナメント形式。ブラケット品質バッジ・ブラケットプレビュー・自動ペアリング・フィルターあり
  - **ワンマッチ**: 1試合のみ。ペア上限1。ブラケット品質バッジ・ブラケットプレビュー・フィルター・自動ペアリング非表示。デフォルト名「ワンマッチN」
- **未確定グループ**: 体格差上限設定・自動振り分け・ペア手動調整・マッチラベル・ルール設定・「確定する」ボタン
- **選手絞り込みフィルタ**（トーナメントのみ）: 体重範囲、年齢範囲、性別、身長範囲、学年、経験、名前で選手を絞り込んでトーナメントに追加
- **トーナメント名自動生成**: 絞り込み条件を変更すると、その条件からトーナメント名を自動生成（例: 「男子 75kg以上」）。手動で名前を編集すると自動生成を停止し、以降は手動名のまま維持
- **選手の複数参加**: 希望試合数（`extra_fields.desired_match_count`）に達するまで選択肢に残る。同一トーナメント/ワンマッチ内のみ重複不可
- **希望試合数の可視化**: 選手チップに `(設定済/希望)` 表示（例: `山田太郎 (1/3)`）。希望1試合の場合は省略
- **確定ボタン文言**: 「確定する（Nトーナメント・Mワンマッチ・計X対戦）」
- **確定後**: トーナメントはBracketView、ワンマッチはシンプルな1試合カード表示
- **ダッシュボード**: 希望試合未充足N名・合計希望Y試合/設定済Z試合を表示。トーナメント数・ワンマッチ数を分けて表示
  - **▲/▼ 並び替えボタン**: トーナメントの表示順を入れ替え。クリック即座にオプティミスティック更新（UIが即反映）＋バックグラウンドで `PATCH /api/admin/tournaments/[id]` を2件送信。処理中はスピナー表示・他ボタン無効化。API完了後に `load()` で同期
  - 「← 確定前に戻る」ボタン: round-1 マッチからペアを復元してフォームに戻す
  - 「削除」ボタン: トーナメント丸ごと削除（確認ダイアログあり・削除中は無効化）
  - **不戦勝（`fighter2_id` が null）の試合カード**: ブラケット上に通常通り表示。接続線も表示。番号付け対象外のみ（詳細はステップ③参照）
  - **「← 確定前に戻る」**: round-1 マッチからペアを復元してフォームに戻す。`sort_order`（表示順）を保持して再確定時に同じ位置に戻る。欠場選手はペアから除外（もういなかった扱い）

**欠場による影響マッチ対応**
- 確定後に欠場登録された選手が含まれるマッチを自動検出
- **警告バナーは折りたたみに関わらず常時表示**（折りたたみ内には収めない）
- 欠場選手を含む試合は自動的に不戦勝処理（`status: "done"`, `winner_id` = 相手選手）。fighter_id は消去せず名前を表示し続ける。次ラウンドへの進出も自動処理
- **欠場バッジ（棄権）**: `withdrawnIds` に含まれる選手スロットに「棄権」バッジを表示。試合終了済み（`done`）でもバッジは表示される
- **確定前に戻るでの欠場選手の扱い**: ペア復元時に欠場選手（`is_withdrawn: true`）はペアから除外。フォームに戻した段階では存在しなかった扱いになり、ペア選択肢にも出ない
- **欠場警告の表示条件**: 両選手が揃っていて（`fighter1_id != null && fighter2_id != null`）かつ未完了（status が `done`/`ongoing` 以外）のマッチのみ警告対象。相手がまだ未確定のマッチは除外する。これにより自動処理後に確実に警告が消える
- 各マッチに以下のアクション選択肢を提供（自動処理前のみ）:
  - **不戦勝にする**: 相手選手を勝者として試合終了（`status: "done"`, `winner_id` = 相手選手）。次ラウンドへの進出も自動処理
  - **別選手に差し替え**: 参加者一覧（欠場・既出場以外）から差し替え選手を選択してそのスロットに配置

---

#### ステップ③ 試合番号設定

**試合番号設定（`MatchLabelEditor` コンポーネント）**
- トーナメントが未作成の場合はステップ③タブが非活性（クリック不可）
- 開閉なし・常時展開表示
- **コート別グループ表示**: ステップ②と同じ順・同じグループ分けで表示（コート見出し → その下にトーナメント一覧）。コートにトーナメントがなければそのコートは表示しない。ワンマッチにはトーナメント名横に「ワンマッチ」バッジ表示
- **ワンマッチの表示**: BracketView の代わりにシンプルな1試合カード表示（番号付きの丸バッジ + 選手名 vs 選手名 + 赤白入替ボタン）。番号割り当てはタップで通常通り動作
- **コート別番号付け**: 試合番号はコートごとに独立してカウント。ラベル形式は `{コート名}第N試合`（例: 「Aコート第1試合」「Bコート第1試合」）
- **タップ順で番号割り当て**: 試合カードをタップした順にコート内の番号が振られる。再タップで解除
- **ラウンド順で自動割り当て**: コートごとに独立して「ラウンド → トーナメント sort_order → トーナメント表示順（tIdx）→ ポジション」順で割り当て。sort_order が同じ場合も常にトーナメント単位でまとまる。例: T1 1回戦→1,2,3,4 / T2 1回戦→5,6,7,8 / T1 2回戦→9,10 / T2 2回戦→11,12
- **不戦勝（1回戦で `fighter2_id` が null）の試合は番号設定対象外**: 1回戦かつ相手なし（`round === 1 && fighter1_id !== null && fighter2_id === null`）の試合のみ対象外。カード・接続線はブラケット上に通常通り表示されるが、番号付けオーバーレイは出ず、タップしても反応しない。自動割り当て・件数カウントの対象外。2回戦以降で相手がまだ確定していない試合（不戦勝で上がった選手の次の試合など）は通常通り番号付け対象
- **全解除**: 全ラベルをクリア（空 = アナウンス時にラウンド名「準決勝」等を使用）
- **保存**: `POST /api/admin/matches/batch` で `match_label` を一括更新
- **対戦順変更（↕次）**: 同一ラウンド内の隣接する試合を入れ替える。`POST /api/admin/matches/swap` → DB RPC `swap_match_positions` でトランザクション内アトミックスワップ（失敗時は自動ロールバック、position=-1 が残らない）。対戦表（ステップ②）にも即時反映。処理中はスピナー表示・連打無効
- **赤白入れ替え（⇅赤白）**: 1試合の `fighter1_id` と `fighter2_id` を入れ替える。`PATCH /api/admin/matches/[id]` で更新。対戦表にも即時反映。試合終了・進行中の試合には表示しない。処理中はスピナー表示・連打無効
- 各ボタンは `stopPropagation` により試合番号のクリックイベントと干渉しない
- スワップ後の再フェッチは `load(preserveOrder=true)` でトーナメントデータのみ更新し、メモリ上の番号割り当て順（`order`）は保持する
- アナウンス時は `match_label` が設定されていればそれを読み上げ、空なら「準決勝」等のラウンド名にフォールバック
- **試合ラベル読み仮名変換**: TTS送信前に「決勝」→「けっしょう」「第1試合」→「だいいちしあい」等の漢数字・全角数字を含む一般的な試合ラベルを読み仮名に自動変換（`normalizeMatchLabelForTts`）
- **ルール名読み仮名**: `rules.name_reading` が設定されていればTTSでルール名の代わりに読み仮名を使用。コート画面起動時にルールマスタ（name→name_reading マップ）を取得

### 3.7 ログインページ (`/admin/login`)
- ID・パスワード入力フォーム
- 認証成功で `/admin` にリダイレクト
- `POST /api/admin/login` で Cookie ベースのセッション管理

### 3.8 参加者詳細画面 (`/admin/events/[id]/entries/[entryId]`)
- 個別参加者の全情報を表示（氏名・読み・連絡先・申込フォームの全項目）
- フォーム設定に基づいてフィールドを動的にレンダリング
- カスタムフィールドの値も表示
- 管理者メモの編集
- 戻るリンク: `/admin/events/[id]`

### 3.9 統合コート画面 (`/court`)
- アクティブイベントの全コートを1画面に統合表示
- 各コートの対戦表・試合状態をパネルで一覧
- 個別コート画面 (`/court/[court]`) と同じ機能を統合
- 戻るリンク: `/`

### 3.10 タイマー表示画面 (`/timer/[courtId]`)
- 外付けモニターにフルスクリーン表示するスコアボード
- 16:9 SEIKO JT-801 風デジタルスコアボードデザイン
- BroadcastChannel 経由で操作画面からリアルタイム状態受信
- 操作要素なし（クリックでフルスクリーン切替のみ）
- 表示: メインタイマー（画面50%）、スコア（30%）、寝技タイマー（15%）、試合番号（5%）
- 詳細仕様: `docs/TIMER_SPEC.md`

### 3.11 タイマー操作画面 (`/timer/[courtId]/control`)
- タイムキーパーが操作する画面。アナウンス機能も統合
- ミニプレビュー + メイン操作（開始/停止/再開）+ スコア操作（ポイント/技あり/反則/一本）+ 寝技
- キーボードショートカット対応（右サイドバーに参照パネル）
- beforeunload で離脱防止
- BroadcastChannel + localStorage で状態同期・永続化（状態復元はrunning→pausedで安全復帰）
- **トーナメント連携**: アクティブイベントのコートに割り当てられた試合を自動取得、選択して開始
- **プリセット選択**: ルール名マッチ → 手動選択 → デフォルトの優先順で適用
- **結果書き戻し**: 試合終了後に finish_timer API でDB更新（winner_id, result_method, result_detail）、次ラウンド進出も自動処理
- **コート画面排他制御**: localStorage の timer-active フラグ（30秒TTL、10秒ハートビート）でコート画面の操作を抑止
- 詳細仕様: `docs/TIMER_SPEC.md`

### 3.12 ショートカット印刷用ページ (`/timer/shortcuts`)
- タイマー操作のキーボードショートカット一覧
- `@media print` 最適化

### 3.13 タイマープリセット管理 (`/admin/timer-presets`)
- ルールプリセットの CRUD + 複製
- 基本設定（試合時間・方向・延長）、寝技、ポイント・反則、表示テーマ、ブザーをフルカスタマイズ
- カラー設定: ネイティブカラーピッカー（`type="color"`）で色選択、HEXコード自動表示
- テーマプレビュー: 編集中の色・フォント設定をリアルタイム反映したミニタイマー画面を表示
- API: `/api/admin/timer-presets`

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
  filter_grade TEXT,          -- 学年/段級フィルタ
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

-- タイマープリセット
timer_presets (
  id UUID PK,
  name TEXT NOT NULL,
  event_id UUID → events,     -- NULL = グローバル
  rule_id UUID → rules,       -- 紐付けルール
  match_duration INT DEFAULT 120,
  timer_direction TEXT DEFAULT 'countdown',
  -- 延長・寝技・ポイント・反則・表示・テーマ・ブザー（全45+カラム）
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
  version INT DEFAULT 1,       -- 公開バージョン
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
| POST | `/api/admin/tournaments` | トーナメント作成・対戦表生成 |
| DELETE | `/api/admin/tournaments/[id]` | トーナメント削除 |
| PATCH | `/api/admin/matches/[id]` | マッチ更新（管理者） |
| POST | `/api/admin/matches/[id]/replace` | マッチの選手差し替え（`{ slot, entry_id }`） |
| POST | `/api/admin/matches/batch` | 試合ラベル一括更新 |
| POST | `/api/admin/matches/swap` | 同一ラウンド内の隣接試合入替 |
| GET/PUT | `/api/admin/settings` | 全体設定（体重差・身長差上限等）の取得・更新 |
| POST/DELETE | `/api/admin/events/[id]/banner` | バナー画像アップロード/削除 |
| POST/DELETE | `/api/admin/events/[id]/ogp` | OGP画像アップロード/削除 |
| GET/POST | `/api/admin/timer-presets` | タイマープリセット一覧取得・新規作成 |
| PATCH/DELETE | `/api/admin/timer-presets/[id]` | プリセット更新・削除 |
| POST | `/api/admin/timer-presets/[id]/duplicate` | プリセット複製 |
| POST/DELETE | `/api/admin/timer-presets/[id]/buzzer` | カスタムブザー音源アップロード/削除 |

### 5.2 コート用 API（認証不要）

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

### 5.5 TTS API

| メソッド | パス | 概要 |
|---------|------|------|
| POST | `/api/tts` | OpenAI TTS-1 で音声生成。`{ text, voice, speed }` を受け取り音声 blob を返す |

---

## 6. アナウンス機能仕様

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
- **確定済み対戦表の「← 確定前に戻る」**: 削除&再作成ではなく、round-1 マッチからペアを復元してフォームに戻す
- **体重差・身長差の編集禁止（確定後）**: 確定後はテキスト表示のみ。編集不可
- **コート画面への直接リンク削除**: 試合詳細の確定済み対戦表から「コート画面 →」リンクを廃止
- **ブラケット確定後スクロール**: 「確定する」ボタン押下後、ブラケット表示の先頭に自動スクロール
- **横幅統一**: 全画面 `max-w-5xl`
- **コート画面ブラケット統合（2026-03-22）**: コート画面からトーナメント選択セレクト・対戦カードリストを廃止。コートに紐づく全トーナメントを `sort_order` 順に縦並びで表示し、ブラケット上で全操作（試合開始・勝者確定・棄権トグル・試合順入替）を完結させる
- **赤・白バッジ（2026-03-23）**: ブラケットの各選手スロット左端に赤丸（赤）・白丸（白）バッジを表示。上のスロット = 赤、下のスロット = 白。BracketView 内の凡例（「上の選手（赤）」「下の選手（白）」）で意味を説明。管理画面・コート画面など BracketView を使う全画面で共通表示
- **棄権バッジ（2026-03-22）**: コート画面のブラケット上で棄権状態をバッジ表示。「棄」ボタンで `entries.is_withdrawn` をトグル。視認性向上・操作ミス防止目的（アナウンス自体は通常通り勝者のみ読み上げ）
- **再読み上げ（2026-03-23）**: 試合中のカードフッターに「📢 再読」ボタン（試合開始アナウンス再読）、終了済みカードに「📢 再読」ボタン（勝者アナウンス再読）を追加
- **勝者訂正（2026-03-23）**: 終了済みカードフッターの「訂正」ボタンでカードをオレンジ枠の訂正モードに切り替え。選手スロットをタップして勝者を変更。API `correct_winner` アクションで winner_id を更新し、次ラウンドのマッチが done/ongoing でない場合は選手も差し替え。キャンセルボタンで訂正モード解除
- **棄権バッジ即時反映（2026-03-23）**: 変化検知を `allMatches` のみから `{ allMatches, allEntries }` に拡張。棄権トグル後（matches は変化しない）もポーリングで検知して状態が即時反映されるように修正
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
- **対戦表確定後スクロール改善**: 「確定する」ボタン押下後、コートセクション先頭ではなく**新規作成したトーナメントの先頭**に自動スクロール。API レスポンスから作成されたトーナメント ID を取得し、DOM の `id="tournament-{id}"` 要素にスクロール
- **次アクション誘導バナー**: ① 全エントリーが対戦表に割り当て済みになると Step 2 に緑バナー「全員の対戦表が確定しました。試合番号を設定してください。」＋「③ 試合番号設定へ →」リンクを表示。② 全試合の試合番号が DB 保存済みになると Step 3 に緑バナー「準備完了！大会をアクティブに設定すると試合を開始できます。」＋`/admin?tab=events`（試合一覧）へのリンクを表示
- **コート画面アクセス制限**: アクティブなイベント（`is_active = true`）が存在しない場合、コート画面（`/court/[court]`）に🔒ロック画面を表示し操作不可。`is_active` の確認はトーナメントの join ではなく events テーブルへの独立したクエリで行う（join が null を返すと誤判定するバグを修正）
- **統合アナウンス画面 `/court`**: アクティブなイベントの全コートを1画面に表示する統合ビュー。コートごとに `CourtPanel` コンポーネントで独立してデータ管理・操作（試合開始・勝者確定・棄権・アナウンス）を行う。`is_active` でないイベントはロック画面を表示
- **ホームページ (`/`) のコート表示改善**: コートごとに全トーナメントを表示（従来は1トーナメントのみ）。試合一覧を `MatchTable` から読み取り専用 `BracketView` に変更。5秒ポーリングで自動更新

### 2026-03-23 の決定事項（管理画面リニューアル）

- **試合詳細画面の3ステップ化**: 「参加者管理」「対戦表作成」「試合番号設定」の3ステップ。基本設定（開催日・コート名）はステップ外でインライン編集。トーナメントが存在する場合はロード時にステップ②を自動選択。ステップ③はトーナメント未作成時は非活性
- **参加受付締め切り機能**: `events.entry_closed BOOLEAN NOT NULL DEFAULT false` を追加。管理者がステップ2のボタンで自由にON/OFF切り替え。締め切り中は公開フォームにロック画面表示、API送信も403拒否
- **変更検知バナー**: ステップ3で「トーナメント作成後に新規参加者追加」または「欠場者あり」の場合に黄色警告バナーを表示
- **ダッシュボードパネル**: ステップ3の先頭にルール別参加者統計と組み合わせ提案を表示
- **組み合わせ提案アルゴリズム（階級分け）**: 体重をメインとし、年齢・性別・経歴・体格（身長）・段級で分割してバランス評価（◎△✕）。体重: 45/50/55/60/65/70/75/80kg、年齢: 15/18/20/25/30/31/35/40/45歳、身長: 155/160/165/170/175/180cm、経験: 3/5/7/10年、性別: 男女。2名未満グループの提案は除外。最大8件表示
- **フィルター拡張**: 身長範囲・経験・学年フィルタをトーナメント作成UIに追加。フィルター条件はDBに永続化（`filter_experience`, `filter_grade`, `filter_min_height`, `filter_max_height`）
- **トーナメント名自動生成**: フィルター条件からトーナメント名を自動生成（例: 「男子 18歳以上 75kg以上」）。手動で名前を編集すると自動生成を停止

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
    types.test.ts            # ユーティリティ関数（名前結合・読み仮名）
    tournament.test.ts       # トーナメントロジック（ラウンド数・名前・初回戦生成）
    match-utils.test.ts      # 試合ラベルユーティリティ
    email-template.test.ts   # メールテンプレート変数置換・条件ブロック
    admin-auth.test.ts       # 管理者認証（Cookie 検証）
    compatibility.test.ts    # 対戦相性チェック（体重差・身長差・閾値判定・worst判定）
    speech.test.ts           # TTS読み仮名変換・テンプレート・設定保存
    admin-navigation.test.ts # 管理画面ナビゲーション構造（全ページへの導線・戻るリンク）
    bracket.test.ts          # トーナメントブラケット生成（ペア・バイ・ラウンド計算）
    ensure-fighter.test.ts   # エントリーからの選手自動作成（道場検索・新規作成）
    form-fields.test.ts      # フォームフィールド定義・カテゴリ・カスタムフィールド変換
  api/            # API ルートテスト（Vitest + Supabase モック）
    admin-login.test.ts          # ログイン/ログアウト
    admin-crud.test.ts           # 道場・選手・エントリー・ルール・設定 CRUD
    admin-events.test.ts         # イベント作成・更新・削除・複製
    admin-matches.test.ts        # 試合更新・入替・一括・選手差替・トーナメント更新削除
    admin-timer-presets.test.ts  # タイマープリセット CRUD・複製
    admin-form-config.test.ts    # フォーム設定 GET/PUT/PATCH・コピー・注意書き・カスタムフィールド・画像
    admin-media-tournaments.test.ts  # バナー・OGP・ブザー・トーナメント作成
    court-api.test.ts            # コート操作・公開エントリー・フォーム設定・TTS
  helpers/
    supabase-mock.ts             # Supabase クライアントモック基盤
  e2e/            # E2E テスト（Playwright）
    full-tournament-flow.spec.ts  # 大会フル進行フロー・タイマー操作・プリセット管理
    admin-navigation.spec.ts     # 管理画面ナビゲーション（タブ切替・サブタブ・タイマーリンク・戻る導線）
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
- 全 API ルート（37エンドポイント）の**正常系は 100% テスト**済み
- BroadcastChannel 等ブラウザ固有 API は `vi.stubGlobal` でモックしてテスト可能にする
- `localStorage` は happy-dom の制約があるため手動モックを使用
- API ルートテストは Supabase モック基盤（`supabase-mock.ts`）を使用し、DB 依存なしで高速実行

### 13.6 テスト統計

- 単体テスト: 279 テスト（13 ファイル）
- API ルートテスト: 100 テスト（8 ファイル）
- **合計: 379 テスト**（実行時間 ~900ms）
