# 対戦表作成 仕様書

> **ステータス**: ドラフト
> **最終更新**: 2026-03-28
> **対象プロジェクト**: karate-announce
> **対象範囲**: 対戦表作成のビジネスロジック（フィルタリング・ペアリング・確定・欠場処理）

---

## 1. 概要

### 1.1 目的

参加者（エントリー）から対戦組み合わせを作成し、トーナメント形式またはワンマッチ形式の試合構造を生成する。体重・身長の互換性チェック、希望試合数の管理、欠場者の自動処理を含む。

### 1.2 対象画面

`/admin/events/[id]` の Step ② 対戦表作成。コートに依存せずトーナメント/ワンマッチを作成し、後からコート割当・並び順を調整する。確定操作でDBに永続化する。

### 1.3 関連仕様書

| 仕様書               | 関連内容                                      |
| -------------------- | --------------------------------------------- |
| BRACKET_VIEW_SPEC.md | トーナメント表の描画（SVG・カードレイアウト） |
| MATCH_LABEL_SPEC.md  | 試合番号の管理                                |
| COURT_SPEC.md        | 試合進行（勝者確定・勝ち上がり）              |
| EVENT_ADMIN_SPEC.md  | イベント管理・参加者管理                      |

---

## 2. データモデル

### 2.1 `tournaments` テーブル

| カラム            | 型          | デフォルト        | 説明                                                     |
| ----------------- | ----------- | ----------------- | -------------------------------------------------------- |
| id                | uuid        | gen_random_uuid() | PK                                                       |
| name              | text        | NOT NULL          | トーナメント名                                           |
| court             | text        | NOT NULL          | コート番号（文字列）。空文字 `""` は「未割当」を意味する |
| type              | text        | 'tournament'      | `tournament` / `one_match`                               |
| status            | text        | 'preparing'       | `preparing` / `ongoing` / `finished`                     |
| event_id          | uuid        | NULL              | FK → events                                              |
| default_rules     | text        | NOT NULL          | デフォルトルール名（必須）                               |
| sort_order        | integer     | 0                 | 表示順序                                                 |
| max_weight_diff   | numeric     | NULL              | 体重差の許容上限（kg）                                   |
| max_height_diff   | numeric     | NULL              | 身長差の許容上限（cm）                                   |
| filter_min_weight | numeric     | NULL              | フィルタ: 最小体重                                       |
| filter_max_weight | numeric     | NULL              | フィルタ: 最大体重                                       |
| filter_min_age    | integer     | NULL              | フィルタ: 最小年齢                                       |
| filter_max_age    | integer     | NULL              | フィルタ: 最大年齢                                       |
| filter_sex        | text        | NULL              | フィルタ: 性別                                           |
| filter_experience | text        | NULL              | フィルタ: 経験                                           |
| filter_grade      | text        | NULL              | フィルタ: 段級（レガシー）                               |
| filter_min_grade  | text        | NULL              | フィルタ: 年代区分下限                                   |
| filter_max_grade  | text        | NULL              | フィルタ: 年代区分上限                                   |
| filter_min_height | numeric     | NULL              | フィルタ: 最小身長                                       |
| filter_max_height | numeric     | NULL              | フィルタ: 最大身長                                       |
| created_at        | timestamptz | now()             |                                                          |

### 2.2 `matches` テーブル（主要カラム）

| カラム        | 型          | デフォルト        | 説明                                     |
| ------------- | ----------- | ----------------- | ---------------------------------------- |
| id            | uuid        | gen_random_uuid() | PK                                       |
| tournament_id | uuid        | NOT NULL          | FK → tournaments                         |
| round         | integer     | NOT NULL          | ラウンド番号（1 = 1回戦）                |
| position      | integer     | NOT NULL          | ラウンド内の位置（0始まり）              |
| fighter1_id   | uuid        | NULL              | FK → fighters（赤側）                    |
| fighter2_id   | uuid        | NULL              | FK → fighters（白側）                    |
| winner_id     | uuid        | NULL              | FK → fighters                            |
| status        | text        | 'waiting'         | `waiting` / `ready` / `ongoing` / `done` |
| match_label   | text        | NULL              | 試合番号ラベル（「第1試合」等）          |
| rules         | text        | NULL              | 適用ルール名                             |
| result_method | text        | NULL              | 勝利方法                                 |
| result_detail | jsonb       | NULL              | 詳細スコア                               |
| created_at    | timestamptz | now()             |                                          |

**UNIQUE 制約**: `(tournament_id, round, position)`

---

## 3. トーナメント vs ワンマッチ

| 項目           | トーナメント                | ワンマッチ     |
| -------------- | --------------------------- | -------------- |
| `type`         | `tournament`                | `one_match`    |
| ラウンド数     | 複数（2回戦以降を自動生成） | 1のみ          |
| ブラケット表示 | BracketView（ツリー構造）   | 非表示         |
| 品質バッジ     | ◎/△/✕ 表示                  | 非表示         |
| 勝ち上がり     | 勝者が次ラウンドに自動進出  | なし           |
| 不戦勝処理     | 次ラウンドに自動進出        | 勝者として記録 |

### 3.1 UI アーキテクチャ

- **BracketSection**: Step ② のメインコンテナ。サブタブ「対戦表」「振り分けルール」を切り替え
- **TournamentEditor**: トーナメント一覧＋作成フォーム。コートに依存しないフラットな構造
- **GroupSection**: 1つのトーナメント/ワンマッチの編集（フィルタ・ペアリング）
- **ExistingTournamentSection**: 確定済みトーナメントの表示。コート選択ドロップダウン付き

**トーナメント作成フロー**:

1. 「＋ トーナメントを追加」をクリック → 作成フォームが開く
2. フィルタ・ペアリングで対戦組を決定
3. 「登録する」→ POST /api/admin/tournaments（`court: ""` = 未割当で作成）
4. 一覧に追加される。コートドロップダウンでコートを割り当て

**コート割当**:

- 各トーナメントカードにコート選択ドロップダウンを表示
- 選択肢: 「未割当」+ 各コート（`event.court_count`, `event.court_names` から生成）
- 変更時: PATCH /api/admin/tournaments/{id} で `court` を更新
- 未割当（`court: ""`）のトーナメントにはオレンジのバッジで警告表示

**並び順**:

- 全トーナメントをグローバルな `sort_order` 順で表示
- ▲/▼ ボタンで隣接トーナメントと sort_order をスワップ
- 同じ sort_order の場合は `created_at` をフォールバック

**コート自動振り分け**:

- 未割当トーナメントが存在する場合に「コート自動振り分け」ボタンを表示
- アルゴリズム: グリーディ法で各コートの試合数が均等になるよう振り分け
  1. 各コートの現在の試合数を `countActualMatches` で集計
  2. 未割当トーナメントを試合数の多い順にソート（大きいものから配置）
  3. 最も試合数が少ないコートに順番に割り当て
- PATCH `/api/admin/tournaments/{id}` で `court` を一括更新

---

## 4. フィルタリング

### 4.1 参加者プールの構築

確定済みトーナメントと編集中グループの割り当てを考慮して、利用可能な参加者をフィルタリングする。

**除外条件**:

1. `is_withdrawn === true`（欠場者）
2. 希望試合数に達した参加者（`extra_fields.desired_match_count` と実際の割り当て数を比較）
3. デフォルトルール選択時、そのルールに未登録の参加者

**割り当て数の計算**:

- 確定済み: 各トーナメントの match から fighter_id を収集
- 編集中: 現在のグループの pairs から entry を収集
- 合計が `desired_match_count` 以上なら除外

### 4.2 グループ内フィルタ

各グループ（トーナメント/ワンマッチ）に個別のフィルタを適用:

| フィルタ | 型                   | マッチング                 |
| -------- | -------------------- | -------------------------- |
| 体重範囲 | min/max (kg)         | `min <= weight <= max`     |
| 年齢範囲 | min/max (歳)         | `min <= age <= max`        |
| 身長範囲 | min/max (cm)         | `min <= height <= max`     |
| 性別     | male / female / 全て | 完全一致                   |
| 年代区分 | min/max (ラベル)     | 下記参照                   |
| 経験     | テキスト             | 部分一致                   |
| 氏名     | テキスト             | 大文字小文字無視の部分一致 |

#### 年代区分フィルタの詳細

年代区分には学年ベース（小1〜高3）と年齢ベース（一般・シニア等）の2種類がある。

- **学年ベース同士**: `gradeToNumber()` で数値化して範囲比較
- **年齢ベース区分がフィルタに含まれる場合**: エントリーの `age`（年齢）で比較する
  - 下限に年齢ベース区分を選択 → その区分の `minAge` を下限値として使用
  - 上限に年齢ベース区分を選択 → その区分の `maxAge` を上限値として使用
  - エントリーの grade が学年ベースでも、age フィールドがあれば年齢で比較する
- **学年ベースがフィルタで年齢ベースがエントリー**: エントリーの `age` を学年の概算年齢と比較して判定する。概算年齢は `gradeToNumber + 5`（下限）/ `gradeToNumber + 6`（上限）で算出（例: 高3=12 → 上限18歳）。age が null の場合は除外
- **UI**: 下限・上限のセレクトは常に両方表示する（年齢ベース区分選択時も非表示にしない）。セレクトのバツ（クリア）ボタンは表示しない

### 4.2.1 選手リストのソート順

フィルタ済みの選手リストは以下の優先順位でソートする:

1. **体重フィルタ設定時** → 体重昇順
2. **年齢フィルタ設定時** → 年齢昇順
3. **年代フィルタ設定時** → 学年順
4. **身長フィルタ設定時** → 身長昇順
5. **デフォルト（フィルタなし）** → 年齢昇順
6. 同値のフォールバック → 氏名順（日本語ロケール）

### 4.3 フィルタからの自動命名

フィルタ設定値からトーナメント名を自動生成:

```
[性別] [年齢範囲] [体重範囲] [身長範囲] [段級] [経験]
```

**例**:

- `女子 15〜18歳 55〜65kg` → 性別・年齢・体重フィルタ設定時
- `男子 65kg以上` → 性別・体重下限のみ設定時
- `30歳以下` → 年齢上限のみ設定時

名前を手動編集すると自動命名は停止する。

---

## 5. ペアリングアルゴリズム

### 5.1 処理手順

1. **ソート**: 参加者を体重昇順でソート（体重未設定は末尾）
2. **奇数処理**: 参加者が奇数の場合、先頭1名を不戦勝（bye）として抽出
3. **貪欲マッチング**: 残りの参加者から互換性スコアが最も低いペアを順次作成

### 5.2 互換性スコア

```
score = |weight1 - weight2| × 2 + |height1 - height2| × 0.3
```

- 体重差を身長差の約6.7倍重視
- スコアが低いほど好ましいマッチング

### 5.3 互換性判定（◎△✕）

体重・身長それぞれについて判定し、最も悪い結果を採用:

| レベル | 記号 | 色     | 条件                              |
| ------ | ---- | ------ | --------------------------------- |
| OK     | ◎    | 緑     | `diff <= max_diff`                |
| 警告   | △    | 黄     | `max_diff < diff <= max_diff × 2` |
| 危険   | ✕    | 赤     | `diff > max_diff × 2`             |
| 不明   | －   | グレー | データなし（体重 or 身長が NULL） |

**設定値**: `max_weight_diff` と `max_height_diff` はイベント設定またはトーナメント個別設定から取得。

---

## 6. ブラケット品質

### 6.1 判定ロジック

対戦数が2のべき乗かどうかでブラケットの品質を判定:

| 対戦数                       | 品質       | 表示                |
| ---------------------------- | ---------- | ------------------- |
| 2のべき乗（2, 4, 8, 16, 32） | ✓ 完全     | 緑バッジ            |
| 2のべき乗 ±2 以内            | ⚠ 調整推奨 | 黄バッジ + 推奨表示 |
| 上記以外                     | ⚠ 不均衡   | 赤バッジ + 推奨表示 |

### 6.2 推奨表示

```
⚠ 11対戦 — ブラケットが不規則
推奨: 8対戦（16名以下）または 16対戦（32名以下）
あと5ペア（10名）追加で16対戦になります
```

---

## 7. 確定フロー

### 7.1 確定前の状態

- グループ（トーナメント/ワンマッチ）はUIのローカル状態で管理
- DBには未保存
- 登録ボタン: 「登録する（Xトーナメント・Yワンマッチ・計Z対戦）」
- 1ペアのトーナメントは自動で `type: "one_match"` に変更して保存
- 複数グループ一括作成時、グループインデックスを `sortOrder` として API に渡し表示順を保持

### 7.2 確定処理

1. **編集中の既存トーナメントがある場合**: `DELETE /api/admin/tournaments/{id}` で削除（matches もカスケード削除）
2. **各グループに対して**: `POST /api/admin/tournaments` を実行
   - `ensureFighterFromEntry()` で全参加者の Fighter レコードを作成/取得
   - 1回戦の matches を INSERT（両選手あり → `status: "ready"`、片方のみ → `status: "waiting"`）
   - 挿入後、bye の match を検出し `winner_id` を設定、`status: "done"` に更新（2ステップ処理）
   - 不戦勝の勝者を次ラウンドの該当スロットに自動配置（隣接ペアも不戦勝なら `status: "ready"`、片方のみなら `"waiting"`）
   - トーナメント型の場合、2回戦以降の空 match を生成
3. **ローカル状態リセット**: グループをクリア、編集モード解除
4. **データ再読み込み**: サーバーから最新状態を取得

### 7.3 不戦勝（bye）の処理

- 1回戦で片方の選手のみ → 初期 INSERT 時は `status: "waiting"`、その後 `winner_id` を設定し `status: "done"` に更新
- 勝者を次ラウンドの対応スロットに配置:
  - position `i` の勝者 → 次ラウンドの position `floor(i/2)` の `fighter{i%2 === 0 ? 1 : 2}_id` に設定

---

## 8. 取消・編集フロー

### 8.1 登録前に戻す

- 「← 登録前に戻る」ボタンで確定済みトーナメントを編集モードに復元
- **復元処理**:
  1. 1回戦の matches から fighter_id → entry を逆引き
  2. ペア情報を再構築
  3. フィルタ設定をトーナメントレコードから復元
  4. 編集フォームにセット
- **保持される情報**: ペアリング、フィルタ設定、ルール設定
- **失われる情報**: 2回戦以降の match データ（再確定時に再生成）

### 8.2 トーナメント削除

- 確認ダイアログ: 「このトーナメントを削除しますか？」
- `DELETE /api/admin/tournaments/{id}` → matches もカスケード削除
- UI から即座に除去

---

## 9. 欠場処理

### 9.1 欠場検出

確定済みトーナメントに対して、以下を自動検出:

- `entries.is_withdrawn === true` かつ `fighter_id` が設定済み
- 該当 fighter_id が未完了試合（`status !== "done"` かつ `status !== "ongoing"`）に含まれる

### 9.2 自動不戦勝処理

検出された試合に対して:

1. 欠場していない方の選手を `winner_id` に設定
2. `status` を `"done"` に更新
3. 「欠場」バッジ（取り消し線）と「不戦勝」バッジを表示

### 9.3 選手差替

確定済み試合の選手を別の参加者に差し替え:

**API**: `POST /api/admin/matches/{id}/replace`

**リクエスト**:

```json
{
  "slot": "fighter1",
  "entry_id": "新しい参加者のエントリーID"
}
```

**処理**:

1. エントリーから `ensureFighterFromEntry()` で Fighter を作成/取得
2. match の該当スロットを更新
3. 対戦相手が存在すれば `status: "ready"`、なければ `"waiting"`

### 9.4 参加者変更の警告

トーナメント確定後に参加者に変更があった場合（新規追加・欠場）、黄色の警告バナーを表示:

```
⚠ 参加者に変更があります（新規3名追加 / 欠場2名）
```

---

## 10. 表示順序管理

### 10.1 sort_order

- 各トーナメントに `sort_order` を付与
- コート内の表示順序を制御
- ▲▼ボタンで隣接トーナメントとスワップ

### 10.2 スワップ処理

- 2つのトーナメントの `sort_order` を交換
- `PATCH /api/admin/tournaments/{id}` × 2 を並列実行
- 楽観的 UI 更新（即座にローカル状態を反映、API 完了後にサーバーから再取得）

---

## 11. ダッシュボード

### 11.1 割り当てサマリー

- 全参加者数 vs 割り当て済み数
- ルール別の内訳
- 希望試合数の充足状況（「N名がM試合不足」）

### 11.2 分割提案

参加者プールを分析し、トーナメント分割の提案を表示:

**分析軸**:
| 軸 | 閾値リスト | 分割方法 |
|----|-----------|---------|
| 体重 | 45, 50, 55, 60, 65, 70, 75, 80 (kg) | `< 閾値` vs `>= 閾値` |
| 年齢 | 15, 18, 20, 25, 30, 31, 35, 40, 45 (歳) | `< 閾値` vs `>= 閾値` |
| 性別 | ─ | 男子 vs 女子 |
| 身長 | 155, 160, 165, 170, 175, 180 (cm) | `< 閾値` vs `>= 閾値` |
| 経験 | 3, 5, 7, 10 (年) | `< 閾値` vs `>= 閾値`（「N年」パターンを正規表現で抽出） |

**バランスの評価**:
| 評価 | 条件 |
|------|------|
| ◎ | `|below - above| <= 1` |
| △ | `|below - above| <= max(2, total × 0.25)` |
| ✕ | 上記以外 |

◎または△の提案がある場合はそれらのみ表示（✕を除外）。◎△がない場合は✕も含めて表示。

---

## 12. API

### 12.1 トーナメント API

| メソッド | パス                          | 説明                                      |
| -------- | ----------------------------- | ----------------------------------------- |
| POST     | `/api/admin/tournaments`      | トーナメント作成（ペア情報 → match 生成） |
| PATCH    | `/api/admin/tournaments/{id}` | 更新（sort_order, max_weight_diff 等）    |
| DELETE   | `/api/admin/tournaments/{id}` | 削除（matches カスケード削除）            |

### 12.2 試合 API

| メソッド | パス                              | 説明                                                       |
| -------- | --------------------------------- | ---------------------------------------------------------- |
| PATCH    | `/api/admin/matches/{id}`         | 試合更新（winner_id, status, match_label 等）              |
| POST     | `/api/admin/matches/{id}/replace` | 選手差替。body: `{ slot, entry_id }`                       |
| POST     | `/api/admin/matches/swap`         | 試合位置スワップ（RPC: `swap_match_positions`）            |
| POST     | `/api/admin/matches/batch`        | ラベル一括更新。body: `{ updates: [{ id, match_label }] }` |

### 12.3 POST `/api/admin/tournaments` の詳細

**リクエスト**:

```json
{
  "courtName": "男子 65kg以上",
  "courtNum": "1",
  "type": "tournament",
  "pairs": [
    {
      "e1": {
        /* Entry */
      },
      "e2": {
        /* Entry */
      },
      "matchLabel": null,
      "ruleName": "組手3分"
    }
  ],
  "eventId": "uuid",
  "sortOrder": 0,
  "defaultRuleName": "組手3分",
  "maxWeightDiff": 5,
  "maxHeightDiff": 15,
  "filterMinWeight": 65,
  "filterMaxWeight": null,
  "filterSex": "male"
}
```

**処理**:

1. `tournaments` レコード挿入
2. 各ペアの Entry から `ensureFighterFromEntry()` で Fighter 作成
3. 1回戦 matches を挿入（両選手あり → `status: "ready"`、片方のみ → `status: "waiting"`）
4. bye の match を検出し `winner_id` を設定、`status: "done"` に更新
5. 不戦勝の勝者を次ラウンドに配置（隣接ペアも不戦勝なら `status: "ready"`、片方のみなら `"waiting"`）
6. トーナメント型の場合、2回戦以降の空 match を生成（`fighter1_id: null, fighter2_id: null, status: "waiting"`）

**レスポンス**: `{ id: "トーナメントID" }`

---

## 13. 振り分けルール（bracket_rules）

### 13.1 `bracket_rules` テーブルスキーマ

| カラム          | 型          | デフォルト        | 説明                                          |
| --------------- | ----------- | ----------------- | --------------------------------------------- |
| id              | uuid        | gen_random_uuid() | PK                                            |
| event_id        | uuid        | NOT NULL          | FK → events ON DELETE CASCADE                 |
| name            | text        | NOT NULL          | ルール名（例: "小学生軽量級", "大人無差別"）  |
| rule_id         | uuid        | NULL              | FK → rules（対象の競技ルール。NULL=全ルール） |
| min_age         | integer     | NULL              | 年齢下限（NULL=制限なし）                     |
| max_age         | integer     | NULL              | 年齢上限                                      |
| min_weight      | numeric     | NULL              | 体重下限                                      |
| max_weight      | numeric     | NULL              | 体重上限                                      |
| min_height      | real        | NULL              | 身長下限                                      |
| max_height      | real        | NULL              | 身長上限                                      |
| min_grade       | text        | NULL              | 年代下限（例: "小1"、NULL=制限なし）          |
| max_grade       | text        | NULL              | 年代上限（例: "小4"、NULL=制限なし）          |
| max_grade_diff  | integer     | NULL              | 最大学年差（小学生用、NULL=制限なし）         |
| max_weight_diff | numeric     | NULL              | トーナメント内の最大体重差                    |
| max_height_diff | numeric     | NULL              | トーナメント内の最大身長差                    |
| sex_filter      | text        | NULL              | "male" / "female" / NULL（両方）              |
| court_num       | integer     | NULL              | 基本割り当てコート（NULL=自動）               |
| sort_order      | integer     | 0                 | 処理優先順序（小さいほど先）                  |
| created_at      | timestamptz | now()             |                                               |

### 13.2 振り分けルール API

| メソッド | パス                                    | 説明                                              |
| -------- | --------------------------------------- | ------------------------------------------------- |
| GET      | `/api/admin/bracket-rules?event_id=xxx` | 振り分けルール一覧取得（sort_order 昇順）         |
| POST     | `/api/admin/bracket-rules`              | 振り分けルール新規作成。`event_id` と `name` 必須 |
| PUT      | `/api/admin/bracket-rules/[id]`         | 振り分けルール更新。body のフィールドのみ更新     |
| DELETE   | `/api/admin/bracket-rules/[id]`         | 振り分けルール削除                                |

**認証**: 全エンドポイントで `verifyAdminAuth` による認証が必要（未認証は 401）。

### 13.3 AutoCreateDialog（振り分けルールで対戦表作成）

**UIフロー**:

1. 「登録済み振り分けルールで対戦表を作成（N名）」ボタン押下でモーダルダイアログ表示
2. 登録済みの振り分けルール一覧をチェックボックスで表示、有効/無効切替可能
3. 「振り分けプレビュー」ボタンで選手のグループ分け結果とコート別試合数を表示
4. 「この内容で対戦表を作成する」で各グループをトーナメントとして一括作成

**振り分けルールが0件の場合**: 「振り分けルールを登録する」ボタンを表示し、押下で振り分けルールサブタブに遷移。

### 13.4 振り分けロジック（`lib/auto-bracket.ts`）

**`groupEntriesByRules(entries, bracketRules, entryRuleIds)`**:

1. `sort_order` 順にルールを処理
2. 各ルールの条件（年齢・体重・身長・性別・年代範囲・競技ルール）に合致する未割当選手をグループ化
3. `min_grade`/`max_grade` で年代範囲フィルタ（例: 小1〜小4。`gradeToNumber()` で数値比較）。`max_grade_diff` がある場合は学年差でサブグループに分割（学年の数値変換: 小1=1, ..., 小6=6, 中1=7, ..., 中3=9, 高1=10, ...）
4. どのルールにも合致しない選手は「未分類」グループに追加

**`assignCourts(groups, courtCount)`**:

- `courtNum` 指定のグループは固定コート
- `courtNum` が null のグループは試合数が最小のコートに自動割り当て

### 13.5 時間見積もり（`lib/time-estimate.ts`）

**計算式**:

```
perMatchSec = matchDurationSec + (hasExtension ? extensionDurationSec × 0.5 : 0) + intervalSec
totalMinutes = ceil(matchCount × perMatchSec / 60)
```

- 延長時間: 全試合が延長するわけではないため50%分を加算
- 端数は切り上げ

**表示仕様**:

- `formatTimeEstimate()`: 分数を「約N時間M分」形式にフォーマット。開始時刻（`startTime`）指定時は終了予定時刻も算出
- `roundedNowHHMM()`: 現在時刻（JST）を30分刻みに丸めてデフォルト開始時刻として使用
- `countActualMatches()`: 両選手が揃っている実試合数を算出（不戦勝を除外）
- 表示例: 「全16試合 — 推定 約45分（10:00開始 → 10:45終了予定）」

### 13.6 参加者分布パネル（RuleDistributionPanel）

- DashboardPanel の下、コート別対戦表の上に1つ表示。イベント全体の参加者をルール別に分けて分布を表示
- ルールが設定されている場合はルールごとにセクション分け（ダブルエントリーの選手は `entryRuleIds` で両方のルールに含まれる）。ルール未設定の場合は全参加者で1セクション
- 「💡 参加者の分布（N名）」ボタンで折りたたみ/展開を切り替え
- `computeSuggestions()`（`lib/suggestions.ts`）の結果を軸（体重・年齢・性別・身長・経験）ごとにグルーピングして表示
- 各提案をピル形式で表示: バランス指標（◎/△/✕）＋分割ラベル＋人数
- 選手プルダウン（`e1Options`/`e2Options`）にもフィルタ条件が適用され、条件に合致しない選手は選択肢に表示されない
- 表示のみ（対戦表作成のアクションなし）。振り分けルール作成の参考情報として利用

### 13.7 ルール絞込

- 対戦表作成画面の上部にルール絞込ドロップダウンを表示
- 「すべて」（デフォルト）または特定のルールを選択可能
- ルール選択時:
  - `filteredEntries` を該当ルールに申し込んだ参加者のみに絞り込み
  - 未割当選手はルール別グルーピングせずフラット表示（ダブルエントリーの選手が他ルールのグループに分散して混乱するのを防ぐ）
  - ダブルエントリーの選手は該当ルールに申し込んでいれば表示対象

---

## 14. 決定済み事項

- [x] ペアリング: 体重順ソート → 互換性スコアによる貪欲マッチング
- [x] 互換性スコア: `|Δweight| × 2 + |Δheight| × 0.3`
- [x] 不戦勝: 奇数時は先頭を bye。次ラウンドに自動進出
- [x] ブラケット品質: 2のべき乗チェック、±2以内で黄色警告
- [x] 希望試合数: 確定済み + 編集中の合計で管理
- [x] 欠場処理: 自動不戦勝 + 選手差替 UI
- [x] フィルタ保存: トーナメントレコードに全フィルタ値を永続化（復元可能）
- [x] 表示順序: sort_order による手動並替え（▲▼ボタン）

## 15. 未決事項

（現時点でなし）
