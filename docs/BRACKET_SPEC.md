# 対戦表作成 仕様書

> **ステータス**: ドラフト
> **最終更新**: 2026-03-27
> **対象プロジェクト**: karate-announce
> **対象範囲**: 対戦表作成のビジネスロジック（フィルタリング・ペアリング・確定・欠場処理）

---

## 1. 概要

### 1.1 目的
参加者（エントリー）から対戦組み合わせを作成し、トーナメント形式またはワンマッチ形式の試合構造を生成する。体重・身長の互換性チェック、希望試合数の管理、欠場者の自動処理を含む。

### 1.2 対象画面
`/admin/events/[id]` の Step ② 対戦表作成。コートごとにトーナメント/ワンマッチを作成し、確定操作でDBに永続化する。

### 1.3 関連仕様書
| 仕様書 | 関連内容 |
|--------|---------|
| BRACKET_VIEW_SPEC.md | トーナメント表の描画（SVG・カードレイアウト） |
| MATCH_LABEL_SPEC.md | 試合番号の管理 |
| COURT_SPEC.md | 試合進行（勝者確定・勝ち上がり） |
| EVENT_ADMIN_SPEC.md | イベント管理・参加者管理 |

---

## 2. データモデル

### 2.1 `tournaments` テーブル
| カラム | 型 | デフォルト | 説明 |
|--------|-----|---------|------|
| id | uuid | gen_random_uuid() | PK |
| name | text | NOT NULL | トーナメント名 |
| court | text | NOT NULL | コート番号（文字列） |
| type | text | 'tournament' | `tournament` / `one_match` |
| status | text | 'preparing' | `preparing` / `ongoing` / `finished` |
| event_id | uuid | NULL | FK → events |
| default_rules | text | NULL | デフォルトルール名 |
| sort_order | integer | 0 | 表示順序 |
| max_weight_diff | numeric | NULL | 体重差の許容上限（kg） |
| max_height_diff | numeric | NULL | 身長差の許容上限（cm） |
| filter_min_weight | numeric | NULL | フィルタ: 最小体重 |
| filter_max_weight | numeric | NULL | フィルタ: 最大体重 |
| filter_min_age | integer | NULL | フィルタ: 最小年齢 |
| filter_max_age | integer | NULL | フィルタ: 最大年齢 |
| filter_sex | text | NULL | フィルタ: 性別 |
| filter_experience | text | NULL | フィルタ: 経験 |
| filter_grade | text | NULL | フィルタ: 段級 |
| filter_min_height | numeric | NULL | フィルタ: 最小身長 |
| filter_max_height | numeric | NULL | フィルタ: 最大身長 |
| created_at | timestamptz | now() | |

### 2.2 `matches` テーブル（主要カラム）
| カラム | 型 | デフォルト | 説明 |
|--------|-----|---------|------|
| id | uuid | gen_random_uuid() | PK |
| tournament_id | uuid | NOT NULL | FK → tournaments |
| round | integer | NOT NULL | ラウンド番号（1 = 1回戦） |
| position | integer | NOT NULL | ラウンド内の位置（0始まり） |
| fighter1_id | uuid | NULL | FK → fighters（赤側） |
| fighter2_id | uuid | NULL | FK → fighters（白側） |
| winner_id | uuid | NULL | FK → fighters |
| status | text | 'waiting' | `waiting` / `ready` / `ongoing` / `done` |
| match_label | text | NULL | 試合番号ラベル（「第1試合」等） |
| rules | text | NULL | 適用ルール名 |
| result_method | text | NULL | 勝利方法 |
| result_detail | jsonb | NULL | 詳細スコア |
| created_at | timestamptz | now() | |

**UNIQUE 制約**: `(tournament_id, round, position)`

---

## 3. トーナメント vs ワンマッチ

| 項目 | トーナメント | ワンマッチ |
|------|------------|----------|
| `type` | `tournament` | `one_match` |
| ラウンド数 | 複数（2回戦以降を自動生成） | 1のみ |
| ブラケット表示 | BracketView（ツリー構造） | 非表示 |
| 品質バッジ | ◎/△/✕ 表示 | 非表示 |
| 勝ち上がり | 勝者が次ラウンドに自動進出 | なし |
| 不戦勝処理 | 次ラウンドに自動進出 | 勝者として記録 |

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

| フィルタ | 型 | マッチング |
|---------|-----|----------|
| 体重範囲 | min/max (kg) | `min <= weight <= max` |
| 年齢範囲 | min/max (歳) | `min <= age <= max` |
| 身長範囲 | min/max (cm) | `min <= height <= max` |
| 性別 | male / female / 全て | 完全一致 |
| 段級 | テキスト | 部分一致 |
| 経験 | テキスト | 部分一致 |
| 氏名 | テキスト | 大文字小文字無視の部分一致 |

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

| レベル | 記号 | 色 | 条件 |
|--------|------|-----|------|
| OK | ◎ | 緑 | `diff <= max_diff` |
| 警告 | △ | 黄 | `max_diff < diff <= max_diff × 2` |
| 危険 | ✕ | 赤 | `diff > max_diff × 2` |
| 不明 | － | グレー | データなし（体重 or 身長が NULL） |

**設定値**: `max_weight_diff` と `max_height_diff` はイベント設定またはトーナメント個別設定から取得。

---

## 6. ブラケット品質

### 6.1 判定ロジック
対戦数が2のべき乗かどうかでブラケットの品質を判定:

| 対戦数 | 品質 | 表示 |
|--------|------|------|
| 2のべき乗（2, 4, 8, 16, 32） | ✓ 完全 | 緑バッジ |
| 2のべき乗 ±2 以内 | ⚠ 調整推奨 | 黄バッジ + 推奨表示 |
| 上記以外 | ⚠ 不均衡 | 赤バッジ + 推奨表示 |

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
- 確定ボタン: 「確定する（Xトーナメント・Yワンマッチ・計Z対戦）」

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

### 8.1 確定前に戻す
- 「← 確定前に戻る」ボタンで確定済みトーナメントを編集モードに復元
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

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/admin/tournaments` | トーナメント作成（ペア情報 → match 生成） |
| PATCH | `/api/admin/tournaments/{id}` | 更新（sort_order, max_weight_diff 等） |
| DELETE | `/api/admin/tournaments/{id}` | 削除（matches カスケード削除） |

### 12.2 試合 API

| メソッド | パス | 説明 |
|---------|------|------|
| PATCH | `/api/admin/matches/{id}` | 試合更新（winner_id, status, match_label 等） |
| POST | `/api/admin/matches/{id}/replace` | 選手差替。body: `{ slot, entry_id }` |
| POST | `/api/admin/matches/swap` | 試合位置スワップ（RPC: `swap_match_positions`） |
| POST | `/api/admin/matches/batch` | ラベル一括更新。body: `{ updates: [{ id, match_label }] }` |

### 12.3 POST `/api/admin/tournaments` の詳細

**リクエスト**:
```json
{
  "courtName": "男子 65kg以上",
  "courtNum": "1",
  "type": "tournament",
  "pairs": [
    { "e1": { /* Entry */ }, "e2": { /* Entry */ }, "matchLabel": null, "ruleName": "組手3分" }
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
5. トーナメント型の場合、2回戦以降の空 match を生成（`fighter1_id: null, fighter2_id: null, status: "waiting"`）

**レスポンス**: `{ id: "トーナメントID" }`

---

## 13. 決定済み事項

- [x] ペアリング: 体重順ソート → 互換性スコアによる貪欲マッチング
- [x] 互換性スコア: `|Δweight| × 2 + |Δheight| × 0.3`
- [x] 不戦勝: 奇数時は先頭を bye。次ラウンドに自動進出
- [x] ブラケット品質: 2のべき乗チェック、±2以内で黄色警告
- [x] 希望試合数: 確定済み + 編集中の合計で管理
- [x] 欠場処理: 自動不戦勝 + 選手差替 UI
- [x] フィルタ保存: トーナメントレコードに全フィルタ値を永続化（復元可能）
- [x] 表示順序: sort_order による手動並替え（▲▼ボタン）

## 14. 未決事項

（現時点でなし）
