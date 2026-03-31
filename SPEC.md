# karate-announce システム仕様書

> **このドキュメントについて**
> 開発の進捗に合わせて随時更新すること。新機能追加・仕様変更・廃止した機能は必ずこのドキュメントに反映する。
> 最終更新: 2026-03-28（ルール・タイマー設定改善5件: ルール画面タイマーUI改善・タイマー1:ルールN関係・スピナー漏れ修正・タイマー複製末尾追加・赤白左右入れ替え機能）

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
| 固定項目 | フルネーム、よみがな、年齢、性別、生年月日、都道府県、電話番号、メールアドレス、所属団体、道場・支部名、格闘技経験、年代区分、身長、体重、出場希望ルール、備考 |
| 自由設問（デフォルト） | 保護者名、試合経験、希望試合数、頭突き希望、持っている防具、シールド面・フィストガード・レッグガード・ファールカップ・道着・帯の有無 |
| 自由設問（管理者追加） | `custom_*` キーで任意に追加されたフィールド |

**特殊フィールド**
- `full_name`: 姓名を2列グリッドで表示。読み仮名（`kana`）が有効なら4列表示
- `organization`: 道場マスタからセレクト + 自由入力。読み仮名欄は常に表示し、マスタ選択時は読み仮名を自動入力（手動編集も可能）。「その他」ON時は自由入力欄を表示
- `branch`: 道場・支部名 + 読み仮名
- `grade`（年代区分）: セレクトボックスで表示。固定選択肢（年少/年中/年長/小1〜小6/中1〜中3/高1〜高3）+ 年齢ベース区分（デフォルト: 18歳未満/一般/シニア）。年齢ベース区分は設定タブの「年代区分」で編集可能（`settings` テーブルの `age_categories` キー）。DBカラム `grade` に保存。**カスタム年代区分の反映**: イベント管理画面（参加者追加フォーム・振り分けルール編集・絞り込みフィルタ）および参加申込フォームで、`settings` テーブルの `age_categories` から取得したカスタム区分がプルダウンに反映される
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
- **タイマー・操作パネルへの動線**: ヘッダー直下にカードパネル（`bg-gray-800 border border-gray-700 rounded-xl p-4`）を常時表示。2カラムグリッドで大きめのボタンを配置:
  - 「⏱ タイマー表示画面を開く」（青系 `bg-blue-600`、`/timer/{court}`、別窓、↗アイコン付き）
  - 「🎮 操作パネルを開く」（緑系 `bg-green-600`、`/timer/{court}/control`、別窓、↗アイコン付き）
- **TTS事前読み込み（prefetch）**: 次の試合（`courtNextMatch`）が確定した時点で、アナウンステキストを事前に `/api/tts` に POST して音声を生成・キャッシュする。試合開始時の音声再生を高速化する目的。同じ試合の二重リクエストは `prefetchedRef` で防止
- 3秒ごとに自動リロード（変化がない場合は再レンダリングしない）
- 横幅: `max-w-5xl`

**対戦相手なし（不戦勝）の表示**
- fighter が null のスロット: ラウンド1なら「不戦勝」、それ以外は「○回戦 第○試合勝者」と表示（BYE という表現は使わない）

**棄権の扱い**
- 棄権状態は `entries.is_withdrawn` フラグで管理
- 試合中に棄権した場合でも特別なアナウンスは不要。通常の勝者アナウンスのみ
- 棄権バッジは操作補助のための表示（間違えないよう視認性を高める目的）

### 3.5 管理画面ホーム (`/admin`)

認証必須。タブナビゲーション。ページ最下部にコミットハッシュベースのバージョン表示（`DelayedVersion` コンポーネント）。初期読み込み時に目立たないよう1.5秒遅延で表示。開発環境では `(dev)` を付記。

**タブ一覧**

| タブ | 機能 |
|------|------|
| ホーム | ダッシュボード（進行中の試合・次の試合・要対応・参加受付状況） |
| 試合 | 試合（大会）管理・過去の大会から複製 |
| 設定 | TTS 設定＆アナウンステンプレート・流派マスタ・ルールマスタ管理・タイマー管理（インライン表示、別ページ `/admin/timer-presets` も存在）・年代区分設定 |
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
- **公開**: 「設定完了」ボタンでバージョンをインクリメントして `is_ready=true` に設定（初期バージョン0 → 初回公開でv1）
- **バージョン表示**: 折りたたみヘッダーの `FormConfigStatusBadge` にステータス（公開中/準備中/未設定）とバージョン（v1, v2... / 未公開）を一括表示。展開内にはステータス・バージョンを重複表示しない
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
- **フィールド表示名**: `entry_details` 内の extra_fields 項目は、`form_field_configs.custom_label` → `FIELD_POOL.label` → キー名 の優先順で日本語表示名を使用。カスタムフィールドは `custom_field_defs.label` を使用
- テンプレート処理: `lib/email-template.ts`

**参加者管理タブ**
- **参加申込フォーム URL** 表示（公開フォームへのリンク）
- **イベントフェーズバッジ**: ヘッダーに6段階のフェーズを自動判定して表示（`lib/event-phase.ts` の `getEventPhase()`）
  | フェーズ | 条件 | バッジ色 | ステップハイライト |
  |---------|------|---------|------------------|
  | 準備中 | フォーム未公開（`is_ready=false`） | gray | ① |
  | 受付中 | `entry_closed=false` かつフォーム公開済 | green | ① |
  | 対戦表作成中 | `entry_closed=true` かつトーナメント未作成 or 未確定 | blue | ② |
  | 試合準備中 | トーナメント確定済み（matches あり）かつ `is_active=false` | yellow | ③ |
  | 試合中 | `is_active=true` かつ `status !== "finished"` | green（点滅） | ③ |
  | 試合終了 | `status === "finished"` | gray | ③ |
  - ステップナビの対応ステップにリングハイライト（`ring-blue-500/50`）を表示
- **参加受付切り替えボタン**: 3段階表示
  - フォーム設定未公開時: ボタンは「📋 準備中（フォーム設定を公開してください）」表示で disabled
  - `events.entry_closed = false` かつフォーム公開済: 緑ボタン「🔓 受付中（クリックで締め切り）」
  - `events.entry_closed = true`: 「🔒 受付終了（クリックで再開）」
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
  - **欠場登録**: 各行に「欠場」ボタン。欠場状態は赤バッジ（`BADGE.error`）で表示し行を薄く表示（`opacity-50` + `line-through`）。「復帰」ボタンで取消可
  - 欠場中の選手は対戦表作成の選手一覧から除外される
  - カウント表示: 「N名参加 / M名欠場」形式
  - **テストデータ生成**（開発環境のみ表示）: 「🧪 テスト参加者を追加」ボタンで、参加申込フォームの全項目（性別・生年月日・読み仮名・電話番号・メールアドレス・都道府県・保護者名・試合経験・防具情報等の extra_fields を含む）が入ったダミー参加者32名を一括生成。`is_test = true` で識別。ルールが2件以上の場合、約30%の参加者にダブルエントリー（複数ルール割り当て）を生成。「🗑 テスト参加者を削除」ボタンで一括削除可能。各ボタンにはホバー時にツールチップで動作説明を表示
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
- ルールごとにカード表示（`DashboardCard`）: 参加者数、未割当数、トーナメント数を表示
- ※ 組み合わせ提案（階級分けおすすめ）は参加者分布パネル（`RuleDistributionPanel`）で表示（対戦表作成機能なし、参考情報として分布を表示）

**サブタブ**: 「コート別対戦表」と「振り分けルール」の2タブ。均等幅レイアウト。

**振り分けルール（`BracketRulesPanel`）**
- 振り分けルール（`bracket_rules` テーブル）の CRUD 管理
- 各ルールに名前、対象競技ルール、年齢範囲、体重範囲、身長範囲、年代範囲（min_grade/max_grade）、最大学年差、最大体重差・身長差、性別、割り当てコートを設定
- ▲/▼ ボタンで優先順序（`sort_order`）を変更。先に処理されたルールが優先して選手を取る
- **複製ボタン**: 各ルールカードに「複製」ボタン。既存ルールの全フィールドをコピーして新規作成フォームにセット、名前に「（コピー）」を付与。新しいAPIは不要（既存のPOSTで新規作成）
- API: `GET/POST /api/admin/bracket-rules`, `PUT/DELETE /api/admin/bracket-rules/[id]`

**全自動対戦表作成ダイアログ（`AutoCreateDialog`）**
- 「振り分けルールで対戦表を作成（N名）」ボタン押下でモーダルダイアログ表示（振り分けルールが1件以上ある場合）
- 振り分けルールが0件の場合は「振り分けルールを登録する」ボタンを表示し、押下で振り分けルールサブタブに遷移
- 登録済みの振り分けルール一覧をチェックボックスで表示、有効/無効切替可能
- 「振り分けプレビュー」ボタンで選手のグループ分け結果とコート別試合数を表示
- 「この内容で対戦表を作成する」で各グループをトーナメントとしてAPI経由で一括作成
- 振り分けルール未設定の場合は案内メッセージを表示

**振り分けロジック（`lib/auto-bracket.ts`）**
- `groupEntriesByRules()`: 振り分けルールを `sort_order` 順に処理。各ルールの条件（年齢・体重・身長・性別・年代範囲・競技ルール）に合致する未割当選手をグループ化。`min_grade`/`max_grade` で年代範囲フィルタ（例: 小1〜小4）、`max_grade_diff` がある場合は学年差でサブグループに分割。どのルールにも合致しない選手は「未分類」グループに
- `assignCourts()`: `court_num` 指定のグループは固定コート、未指定は試合数が最小のコートに自動割り当て
- 学年の数値変換（`lib/grade-options.ts`）: 年少=-2, 年中=-1, 年長=0, 小1=1, ..., 小6=6, 中1=7, ..., 中3=9, 高1=10, ...。年齢ベース区分（18歳未満/一般/シニア等）は数値変換対象外（null）
- 年齢ベース区分フィルタ: `isAgeCategoryLabel()` / `findAgeCategory()` で年齢ベース区分を判定。年齢ベース区分の場合は entry の `age` で `minAge`/`maxAge` をフィルタ。学年ベースの場合は `gradeToNumber()` で数値変換してフィルタ

**参加者分布パネル（`RuleDistributionPanel`）**
- DashboardPanel の下、コート別対戦表の上に1つ表示。イベント全体の参加者をルール別に分けて分布を表示
- ルールが設定されている場合はルールごとにセクション分け（ダブルエントリーの選手は `entryRuleIds` で両方のルールに含まれる）。ルール未設定の場合は全参加者で1セクション
- 「💡 参加者の分布（N名）」ボタンで折りたたみ/展開を切り替え
- `computeSuggestions()`（`lib/suggestions.ts`）の結果を軸（体重・年齢・性別・身長・経験）ごとにグルーピングして表示。軸の表示順は 体重→年齢→性別→身長→経験 の固定順
- 各提案をピル形式で表示: バランス指標（◎/△/✕）＋分割ラベル＋人数
- **経験軸は「参考」扱い**: 他の軸と区切り線で分離し、ラベルに「（参考）」を付与。薄い色（`opacity-60`、`bg-gray-700/30`）で控えめに表示。バランス指標は常に灰色
- 表示のみ（対戦表作成のアクションなし）。振り分けルール作成の参考情報として利用
- ※ 旧 `DistributionPanel`（CourtSection 内配置）は廃止。`RuleDistributionPanel`（イベント上部配置・ルール別表示）に置き換え
- ※ 旧「おすすめ振り分けダイアログ」（`SuggestCreateDialog`）は廃止済み。対戦表作成は「振り分けルールで作成」に一本化

**コートごとの対戦表作成（`CourtSection`）**
- **試合所要時間の見積もり表示**: 対戦表が作成済みのコートで、コートヘッダー下に推定所要時間パネルを表示
  - 計算: `試合数 × (試合時間 + 延長時間の50%) + (試合数 - 1) × 試合間インターバル`（インターバルは試合間にのみ適用）
  - 試合時間: トーナメントの `default_rules` → `rules.name` → `rules.timer_preset_id` → `timer_presets` で解決。タイマー未紐づけ時はデフォルト2分（120秒）
  - 延長時間: `has_extension` が true の場合のみ `extension_duration` の50%を加算
  - 試合間インターバル: デフォルト1分。UI で 0分/30秒/1分/2分/3分/5分を選択可能
  - 開始時刻: デフォルトは現在時刻を30分刻みに丸め。time input で変更可能
  - 試合数: コート内全トーナメントの実試合数（両選手が揃っている試合のみ。不戦勝は除外）
  - 表示例: 「全16試合 — 推定 約45分（10:00開始 → 10:45終了予定）」
  - 内訳表示: 「8試合 × 3分 + 試合間1分 × 7 = 45分」形式で計算内訳を表示
  - ロジック: `lib/time-estimate.ts`（`estimateMatchMinutes`, `formatTimeEstimate`, `countActualMatches`, `roundedNowHHMM`）
- コート数に応じてコートタブを表示
- **振り分けルールで対戦表作成**: 「登録済み振り分けルールで対戦表を作成（N名）」ボタン（振り分けルール登録済みの場合）または「振り分けルールを登録する」ボタン（未登録の場合）。未割当選手がいる場合のみ表示。クリックで `AutoCreateDialog` を開くか振り分けルールタブに遷移
- **参加者分布パネル**: DashboardPanel の下に `RuleDistributionPanel` として配置。ルール別にセクション分けして体重・年齢・性別・身長・経験の分布をピル形式で表示（表示のみ、対戦表作成アクションなし）
- **手動絞り込みからの振り分けルール登録**: トーナメント確定時、グループにフィルタ条件が設定されている場合に「この絞り込み条件を振り分けルールとして登録しますか？」の確認ダイアログを表示。「はい」で `POST /api/admin/bracket-rules` に保存。同名ルールが既に存在する場合はスキップ
- **トーナメントとワンマッチの2種類**: 「＋ トーナメントを追加」と「＋ ワンマッチを追加」の2ボタン
  - **トーナメント**: 複数ペアのトーナメント形式。ブラケット品質バッジ・ブラケットプレビュー・自動ペアリング・フィルターあり
  - **ワンマッチ**: 1試合のみ。ペア上限1。ブラケット品質バッジ・ブラケットプレビュー・フィルター・自動ペアリング非表示。デフォルト名「ワンマッチN」
- **作成中はトーナメント追加ボタン制御**: 編集フォーム内のトーナメント追加/ワンマッチ追加ボタンは、全グループにペアが設定されるまで非表示。未確定のグループがある状態で追加ボタンを押せないようにすることで誤操作を防止
- **未確定グループ**: 体格差上限設定・自動振り分け・ペア手動調整・マッチラベル・ルール設定・「登録する」ボタン
- **体重差デフォルト値**: 新規グループ作成時の体重差上限のデフォルトは **5kg**（身長差は未設定）。ユーザーは必要に応じて変更可能
- **未割当選手のルール別表示**: 未割当選手リストをルールごとにグループ化して表示。「フルコン（8名）— 合計希望試合数: 12」のようにルール名・人数・合計希望試合数をヘッダーに表示。複数ルールに参加する選手は両方に表示される。ルールが1つ以下の場合はフラット表示
- **選手絞り込みフィルタ**（トーナメントのみ）: 体重範囲、年齢範囲、性別、身長範囲、年代区分（セレクト）、経験、名前、試合決定数で選手を絞り込んでトーナメントに追加。**プルダウン選択肢にもフィルタ条件が適用**され、条件に合致しない選手は選択肢に表示されない
  - **セレクト解除ボタン**: 年代下限/上限・性別・試合数のセレクトに値が選択されている場合、右端に×ボタンを表示。押すとデフォルト値（空/全て）にリセット
  - **年代セレクトの動作**: 学年制（年少〜高3）は下限・上限の2つのセレクトで範囲指定。年齢ベース区分（一般/シニア等）は単一セレクトとして動作し、下限または上限で選択すると両方が同じ値にセットされ、「〜」と上限セレクトは非表示になる
  - **試合決定数フィルタ**: 「全て」「未達」「0試合」〜「9試合」から選択。「未達」は希望試合数に達していない選手のみ表示、「N試合」はちょうどN試合の選手のみ表示
- **選手個別選択ペアリング**: 絞り込み後の選手チップをクリックで選択/解除（選択時は青枠で強調）。「全選択」「全解除」ボタンあり。ペアリングボタンは2つ: 「全員（N名）を追加してペアリング」（全件）と「選択したN名を追加してペアリング」（選択のみ、0名選択時は disabled）
- **フィルタ連動ソート**: 絞り込み後の選手チップ表示順がフィルタ条件に応じて変化。年代フィルタ→学年順、年齢フィルタ→年齢順、体重フィルタ→体重順、身長フィルタ→身長順。複数フィルタ時は年代→年齢→体重→身長の優先順。フィルタなしは氏名順。ソートロジックは `lib/group-filter-sort.ts` に切り出し
- **トーナメント名自動生成**: 絞り込み条件を変更すると、その条件からトーナメント名を自動生成（例: 「男子 75kg以上」）。手動で名前を編集すると自動生成を停止し、以降は手動名のまま維持
- **自動ペアリング（`lib/pairing.ts`）**: 参加人数から次の2の累乗を計算し、不戦勝を自動挿入してブラケットを綺麗にする。体格が平均から外れた選手（乖離スコア = `|体重-平均体重|*2 + |身長-平均身長|*0.3`）を優先的に不戦勝に割り当て、残り選手を体格近似でペアリング
- **選手の複数参加**: 希望試合数（`extra_fields.desired_match_count`）に達するまで選択肢に残る。同一トーナメント/ワンマッチ内のみ重複不可
- **希望試合数の可視化**: 選手チップに `(設定済/希望)` 表示（例: `山田太郎 (1/3)`）。希望1試合の場合は省略
- **登録ボタン文言**: 「登録する（Nトーナメント・Mワンマッチ・計X対戦）」
- **1ペア自動ワンマッチ**: トーナメントタイプでペアが1組の場合、登録時に自動で `type: "one_match"` に変更して保存
- **複数トーナメント一括作成時の並び順**: 新規追加時はそのコートの既存トーナメントの最大 `sort_order` + 1 から連番で採番し、常に最下部に追加される。編集時は元の `sort_order` を保持
- **確定後**: トーナメントはBracketView、ワンマッチはシンプルな1試合カード表示
- **ダッシュボード**: 希望試合未充足N名・合計希望Y試合/設定済Z試合を表示。トーナメント数・ワンマッチ数を分けて表示
  - **▲/▼ 並び替えボタン**: トーナメントの表示順を入れ替え。クリック即座にオプティミスティック更新（UIが即反映）＋バックグラウンドで `PATCH /api/admin/tournaments/[id]` を2件送信。処理中はスピナー表示・他ボタン無効化。API完了後に `load()` で同期
  - 「← 登録前に戻る」ボタン: round-1 マッチからペアを復元してフォームに戻す
  - 「削除」ボタン: トーナメント丸ごと削除（確認ダイアログあり・削除中は無効化）
  - **不戦勝（`fighter2_id` が null）の試合カード**: ブラケット上に通常通り表示。接続線も表示。番号付け対象外のみ（詳細はステップ③参照）
  - **「← 登録前に戻る」**: round-1 マッチからペアを復元してフォームに戻す。`sort_order`（表示順）を保持して再確定時に同じ位置に戻る。欠場選手はペアから除外（もういなかった扱い）

**欠場による影響マッチ対応**
- 確定後に欠場登録された選手が含まれるマッチを自動検出
- **警告バナーは折りたたみに関わらず常時表示**（折りたたみ内には収めない）
- 欠場選手を含む試合は自動的に不戦勝処理（`status: "done"`, `winner_id` = 相手選手）。fighter_id は消去せず名前を表示し続ける。次ラウンドへの進出も自動処理
- **欠場バッジ（棄権）**: `withdrawnIds` に含まれる選手スロットに「棄権」バッジを表示。試合終了済み（`done`）でもバッジは表示される
- **登録前に戻るでの欠場選手の扱い**: ペア復元時に欠場選手（`is_withdrawn: true`）はペアから除外。フォームに戻した段階では存在しなかった扱いになり、ペア選択肢にも出ない
- **欠場警告の表示条件**: 両選手が揃っていて（`fighter1_id != null && fighter2_id != null`）かつ未完了（status が `done`/`ongoing` 以外）のマッチのみ警告対象。相手がまだ未確定のマッチは除外する。これにより自動処理後に確実に警告が消える
- 各マッチに以下のアクション選択肢を提供（自動処理前のみ）:
  - **不戦勝にする**: 相手選手を勝者として試合終了（`status: "done"`, `winner_id` = 相手選手）。次ラウンドへの進出も自動処理
  - **別選手に差し替え**: 参加者一覧（欠場・既出場以外）から差し替え選手を選択してそのスロットに配置

---

#### ステップ③ 試合番号設定

**試合番号設定（`MatchLabelEditor` コンポーネント）**
- トーナメントが未作成の場合はステップ③タブが非活性（クリック不可）
- 開閉なし・常時展開表示
- **コートタブ**: コート数が2以上の場合、「全コート」＋各コート名のタブを上部に表示（`grid` で均等割り）。タブ切り替えで表示するコートをフィルタリング。`MatchLabelEditor` の `selectedCourt` props でフィルタ制御。デフォルトは「全コート」（全表示）
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
- 操作要素なし（クリックでフルスクリーン切替のみ）。初回クリックで `requestFullscreen()` を呼び出し、以降はトグル
- 表示: メインタイマー（画面50%）、スコア（30%）、寝技タイマー（15%）、試合番号（5%）
- **試合ラベルの数字表示**: 半角数字を全角に自動変換（`String.fromCharCode(c.charCodeAt(0) + 0xFEE0)`）
- **一本オーバーレイ**: 勝者サイド色でフラッシュ（背景色 `winnerColor + 88`、テキスト色 `winnerColor`、白い光のtext-shadow）。2秒後にフェードアウト。レスポンシブフォントサイズ（`min(20vw,8rem)`）で見切れ防止
- **寝技カウントダウン表示**: `newaza_direction` が `countdown` の場合、寝技タイマーを残り時間として表示。`getNewazaDisplayMs()` で制御
- **スコア項目間隔**: `layout.scoreItemGap` で技あり・反則の表示間隔を調整可能
- **赤白左右入れ替え（`swap_sides`）**: タイマー設定の `swap_sides` が `true` の場合、表示画面で赤（左）と白（右）の位置を入れ替えて表示。色・選手名・スコアがすべて反転する。操作パネル側のボタンラベル（赤/白）は変更しない（内部ロジックは赤/白のまま）
- 詳細仕様: `docs/TIMER_SPEC.md`

### 3.11 タイマー操作画面 (`/timer/[courtId]/control`)
- タイムキーパーが操作する画面。アナウンス機能も統合
- **レイアウト**: `h-screen` で画面全体を使用。操作エリアは `flex-1` で縦方向いっぱいに展開
- ミニプレビュー + メイン操作（開始/ストップ/再開）+ スコア操作（ポイント/技あり/反則/一本）+ 寝技
- **ボタンサイズ**: メインボタン `py-6`、スコアボタン `py-4`、結果ボタン `py-5` で大きめにタッチしやすく
- キーボードショートカット対応（右サイドバーに参照パネル）
- **一本操作**: `confirm()` ダイアログなしで直接実行（ボタン・キーボードショートカット共通）
- beforeunload で離脱防止
- BroadcastChannel + localStorage で状態同期・永続化（状態復元はrunning→pausedで安全復帰）
- **トーナメント連携**: アクティブイベントのコートに割り当てられた試合を自動取得、選択して開始
- **試合一覧（カード形式）**: コート画面の速報と同様のカード形式。各カードに選手名・所属・ルール・トーナメント名を表示。ステータスに応じたハイライト:
  - ready: 青枠＋「次の試合」バッジ
  - ongoing: 黄色枠＋「試合中」バッジ（パルスアニメーション）
  - done: グレーアウト＋「終了」バッジ（選択不可）
- **試合一覧に戻る**: ready/running/paused 状態で「← 試合一覧に戻る」ボタンを表示
- **次の試合へ**: finished 状態で「次の試合へ」ボタンを押すと idle（試合一覧）に戻る。結果未確定（`resultWritten === false`）の場合は確認ダイアログ「試合結果が未確定です。戻りますか？」を表示
- **ルール選択**: ラベル「ルール」。ルール名マッチ → 手動選択 → デフォルトの優先順で適用
- **ルール→タイマー紐付け**: `rules.timer_preset_id` でルールごとにタイマーを紐付け。1つのタイマーを複数ルールで共有可能。操作画面では試合のルール名から `rules.timer_preset_id` を引いてプリセットを自動選択
- **結果書き戻し**: 試合終了後に finish_timer API でDB更新（winner_id, result_method, result_detail）、次ラウンド進出も自動処理
- **勝利方法選択**: `prompt()` ではなくボタンリストで選択（ポイント/技あり優勢/一本/合わせ一本/反則勝ち/判定/棄権勝ち/負傷勝ち）
- **勝利確定後フロー**: 勝者と勝利方法を大きく表示。「確定する」ボタン（DB書き戻し）＋「訂正する」ボタン（time_upに戻る）
- **結果ボタンレイアウト**: `grid grid-cols-2`（引き分けなし）/ `grid grid-cols-3`（引き分けあり）で均等配置
- **反則ポイント設定表示**: 試合中にタイマーの反則ルール設定を常時表示。有効時「反則N回で相手にM点」、無効時「反則→ポイント変換: 無効」
- **コート画面排他制御**: localStorage の timer-active フラグ（30秒TTL、10秒ハートビート）でコート画面の操作を抑止
- **ブザーボタン**: メイン操作ボタンから分離し、サブ操作エリアに移動。小さめサイズ（`py-2 text-sm`）で表示
- **アナウンス実行ボタン**: 試合セット後（`ready`/`running`/`paused`）に「試合開始アナウンス」ボタン、試合終了後（`finished`）に「勝利アナウンス」ボタンを表示。`lib/speech.ts` の既存関数を使用し、コート画面と同じテンプレート・読み仮名データで発話
- **音声再生中の制御**: `isPlaying` ステートで音声再生中を追跡。再生中はアナウンスボタンが無効化され「再生中...」と表示
- **ミュート切替**: ヘッダー右に音声ON/ミュート中トグルを常時表示。ミュート時はアナウンスボタンが無効化される
- **TTS事前読込**: 試合選択時に `prefetchTts()` でアナウンステキストを事前生成。試合開始時の音声再生を高速化
- 詳細仕様: `docs/TIMER_SPEC.md`

### 3.12 ショートカット印刷用ページ (`/timer/shortcuts`)
- タイマー操作のキーボードショートカット一覧
- `@media print` 最適化

### 3.13 タイマー管理 (`/admin/timer-presets`)
- タイマーの CRUD + 複製（複製は一覧の末尾に追加）
- 基本設定（試合時間・方向・延長）、寝技（カウントアップ/カウントダウン切替）、ポイント・反則、表示テーマ、ブザーをフルカスタマイズ
- **赤白左右入れ替え**: 表示設定セクションの「赤白の左右を入れ替え」チェックボックスで `swap_sides` を切替
- カラー設定: ネイティブカラーピッカー（`type="color"`）で色選択、HEXコード自動表示
- **レイアウトエディタ**: インライン表示（モーダル廃止）。行ベースのビジュアルエディタ。行の追加（目立つ破線ボタン）・削除・並べ替え（D&D、⠿ハンドル）、フォントサイズ（vh数値、上限なし）・高さ・配置を自由設定。▶/▼で展開/折りたたみ。表示ラベル設定はアコーディオン内。スコア項目間隔（`scoreItemGap`）スライダー付き
- **プレビュー横並び**: フォーム（左、スクロール可能）とプレビュー（右、sticky固定）を `grid-cols-2` で横並び表示。モバイルでは縦並びフォールバック
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
  swap_sides BOOLEAN DEFAULT false,  -- 赤白の左右入れ替え
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
| POST | `/api/tts` | OpenAI TTS-1 で音声生成。`{ text, voice, speed }` を受け取り音声 blob を返す。コート画面の TTS prefetch でも使用 |

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
  - 赤白の左右入れ替え機能: `timer_presets.swap_sides` カラム追加。設定UIにチェックボックス追加。タイマー表示画面で `swap_sides=true` の場合に赤白の色・選手名・スコアを左右反転して表示
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
    timer-control-display.test.ts # タイマー操作・表示画面（全角変換・勝利方法ラベル・一本直接実行）
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

- 単体テスト: 406 テスト（16 ファイル）
- API ルートテスト: 211 テスト（10 ファイル）
- E2E テスト: 52 テスト（11 ファイル）
- **合計: 617 単体/API + 52 E2E テスト**
