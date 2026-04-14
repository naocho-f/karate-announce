# 試合番号管理 仕様書

> **ステータス**: ドラフト
> **最終更新**: 2026-03-27
> **対象プロジェクト**: karate-announce
> **対象範囲**: 試合番号（match_label）の割り当て・保存・表示

---

## 1. 概要

### 1.1 目的

各コートの試合にアナウンス・進行用の番号（「Aコート第1試合」等）を割り当てる。自動割り当て・手動クリック・番号解除をサポートし、コートごとに独立した連番を管理する。

### 1.2 対象画面

イベント管理画面 Step ③「試合番号設定」。`MatchLabelEditor` コンポーネントで実装。

### 1.3 関連仕様書

| 仕様書               | 関連内容                                 |
| -------------------- | ---------------------------------------- |
| BRACKET_VIEW_SPEC.md | ブラケット上での番号表示・番号割当モード |
| BRACKET_SPEC.md      | トーナメント作成・不戦勝処理             |
| COURT_SPEC.md        | 試合進行での番号利用                     |
| ANNOUNCE_SPEC.md     | アナウンスでの番号読み上げ               |

---

## 2. データモデル

### 2.1 match_label カラム

`matches` テーブルの `match_label` カラム（text, nullable）に格納。

### 2.1.1 match_number カラム

`matches` テーブルの `match_number` カラム（integer, NOT NULL, DEFAULT 0）。試合番号の数値のみを保持する。`match_label` の保存と同時に設定される。タイマー画面での短縮表示（「B-5」形式）に使用。

### 2.2 ラベル形式

```
{コート名}第{N}試合
```

**例**:

- `Aコート第1試合`
- `コート2第3試合`

**コート名の決定** (`getCourtLabel()`):

- `event.court_names[courtIndex]` が設定済み → そのまま使用（例: `Aコート`）
- 未設定 → `コート{番号}`（例: `コート1`）

### 2.3 ラベルパース

```typescript
// 数値部分の抽出（ソート用）
matchLabelNum(label: string | null): number
  → /(\d+)/ にマッチ → parseInt
  → マッチしない or null → Infinity
```

`lib/match-utils.ts` に定義。試合の表示順ソートに使用。

---

## 3. MatchLabelEditor コンポーネント

### 3.1 Props

| Prop            | 型                    | 説明                                                          |
| --------------- | --------------------- | ------------------------------------------------------------- |
| `eventId`       | `string`              | イベントID                                                    |
| `courtNames`    | `string[] \| null`    | コート名配列                                                  |
| `courtCount`    | `number`              | コート数                                                      |
| `selectedCourt` | `string \| undefined` | 選択中のコート番号（`"1"`, `"2"` 等）。未指定時は全コート表示 |
| `onChanged`     | `() => void`          | 保存完了コールバック（省略可）                                |

### 3.2 内部状態

| 状態          | 型                 | 説明                                |
| ------------- | ------------------ | ----------------------------------- |
| `tournaments` | `TournamentData[]` | 全トーナメントデータ                |
| `order`       | `string[]`         | 割り当て順の match_id 配列          |
| `saving`      | `boolean`          | 保存中フラグ                        |
| `saved`       | `boolean`          | 保存成功フィードバック（2秒間表示） |
| `swappingIds` | `Set<string>`      | スワップ処理中の match_id           |

### 3.3 TournamentData 型

```typescript
type TournamentData = {
  id: string;
  name: string;
  type: "tournament" | "one_match";
  sortOrder: number;
  court: string; // "1", "2", etc.
  matches: BracketMatch[];
  nameMap: Record<string, string>;
};
```

---

## 4. 番号割り当て

### 4.1 スコープ

**コートごとに独立した連番**。コートAは第1〜N試合、コートBは第1〜M試合と独立してカウント。

### 4.2 割り当て番号の計算

```typescript
const assignedNumbers: Record<string, number> = {};
const counters: Record<string, number> = {};
for (const id of order) {
  const court = matchToCourtMap[id];
  counters[court] = (counters[court] ?? 0) + 1;
  assignedNumbers[id] = counters[court];
}
```

`order` 配列の出現順でコートごとにカウントアップ。

### 4.3 不戦勝の除外

不戦勝（bye）試合は番号割り当てから除外:

```typescript
round === 1 && !!fighter1_id && !fighter2_id  →  除外
```

---

## 5. 自動割り当て

### 5.1 autoAssign() アルゴリズム

コートごとに以下の優先順でソートし、`order` 配列を構築:

1. **ラウンド番号** (昇順) — 1回戦 → 2回戦 → ... → 決勝
2. **トーナメント sort_order** (昇順) — コート内の表示順
3. **トーナメントインデックス** (昇順) — 同一 sort_order の場合
4. **試合 position** (昇順) — ラウンド内の位置

### 5.2 処理フロー

```
1. コート1〜courtCount を順に処理
2. 各コートのトーナメントを取得
3. 全試合を収集（bye を除外）
4. 上記の優先順でソート
5. ソート結果を order に追加
```

---

## 6. 手動割り当て

### 6.1 クリック操作

- **未割当の試合をクリック** → `order` 配列の末尾に追加（次の番号が付く）
- **割当済みの試合をクリック** → `order` 配列から削除（番号が解除され、後続の番号が繰り上がる）

### 6.2 UIの案内テキスト

> 試合カードを**タップした順番**にコートごとの番号が振られます（例: Aコート第1試合）。番号をつけたカードをもう一度タップすると解除します。

---

## 7. 保存フロー

### 7.1 ラベル生成

`order` 配列からコートごとの連番ラベルを生成:

```typescript
const labels: Record<string, string> = {};
const counters: Record<string, number> = {};
for (const id of order) {
  const court = matchToCourtMap[id];
  counters[court] = (counters[court] ?? 0) + 1;
  labels[id] = `${getCourtLabel(court, courtNames)}第${counters[court]}試合`;
}
```

### 7.2 API 呼び出し

**全試合**（割り当て済み + 未割り当て）を一括更新:

```
POST /api/admin/matches/batch
Body: {
  updates: [
    { id: "match-id-1", match_label: "Aコート第1試合" },
    { id: "match-id-2", match_label: null },  // 未割り当て → null
    ...
  ]
}
```

### 7.3 後処理

1. データ再読み込み（`preserveOrder: true` で現在の order を維持）
2. 保存成功フィードバック（`saved` フラグを2秒間表示）
3. `onChanged()` コールバック呼び出し

---

## 8. データ読み込み

### 8.1 初期ロード

1. イベントIDで `tournaments` を取得（`sort_order`, `created_at` 順）
2. 全トーナメントの `matches` を取得（`round`, `position` 順）
3. 参照される `fighters` を取得（名前マッピング構築）
4. トーナメントごとにデータを構造化

### 8.2 既存ラベルからの order 復元

初回ロード時、既存の `match_label` からタップ順序を復元:

```
1. match_label が「第N試合」パターンの試合を抽出
2. コート番号 → 試合番号の順でソート
3. ソート結果で order を初期化
```

保存後の再読み込み時（`preserveOrder: true`）は復元をスキップし、現在の `order` を維持。

---

## 9. 付加操作

### 9.1 赤白入替（Fighter Swap）

番号割り当て画面内から、未完了試合の fighter1 ↔ fighter2 を入替可能。

```
PATCH /api/admin/matches/{id}
Body: { fighter1_id: "旧fighter2", fighter2_id: "旧fighter1" }
```

### 9.2 試合位置スワップ（Match Swap）

同一ラウンド内の隣接試合の位置を入替。

```
POST /api/admin/matches/swap
Body: { match1_id: "...", match2_id: "..." }
```

Supabase RPC `swap_match_positions` を使用。

---

## 10. API

### 10.1 POST `/api/admin/matches/batch`

| 項目       | 内容                                                                                  |
| ---------- | ------------------------------------------------------------------------------------- |
| 認証       | `verifyAdminAuth()`                                                                   |
| リクエスト | `{ updates: { id: string; match_label: string \| null; match_number?: number }[] }`   |
| 処理       | 各 match を並列で `UPDATE matches SET match_label = ?, match_number = ? WHERE id = ?` |
| レスポンス | `{ ok: true }`                                                                        |

### 10.2 POST `/api/admin/matches/swap`

| 項目       | 内容                                       |
| ---------- | ------------------------------------------ |
| 認証       | `verifyAdminAuth()`                        |
| リクエスト | `{ match1_id: string, match2_id: string }` |
| 処理       | Supabase RPC `swap_match_positions`        |
| レスポンス | `{ ok: true }`                             |

### 10.3 PATCH `/api/admin/matches/{id}`

| 項目       | 内容                                                        |
| ---------- | ----------------------------------------------------------- |
| 認証       | `verifyAdminAuth()`                                         |
| リクエスト | `{ fighter1_id?, fighter2_id?, match_label?, rules?, ... }` |
| 処理       | `UPDATE matches SET ... WHERE id = ?`                       |
| レスポンス | `{ ok: true }`                                              |

---

## 11. UI レイアウト

### 11.1 ヘッダー

- 操作説明テキスト
- コントロールボタン: 「自動割り当て」「クリア」「保存」
- ステータス: 「X / Y 件割り当て済み」

### 11.2 完了チェック

全試合（bye除く）にラベルが付与済みの場合、緑色の完了メッセージを表示。

### 11.3 コートタブ（Step③）

コート数が2以上の場合、MatchLabelEditor の上部に「全コート」+ 各コート名のタブを表示（`grid` + `gridTemplateColumns` で均等割り）。タブ選択で `selectedCourt` を切り替え、表示するコートをフィルタリングする。デフォルトは「全コート」。

### 11.4 コート別セクション

コートごとにトーナメント一覧を表示。`selectedCourt` が指定されている場合はそのコートのみ表示。各トーナメントは:

- **tournament 型** → `BracketView`（番号割当モード）
- **one_match 型** → `OneMatchNumberCard`（水平カード）

### 11.5 番号バッジ表示

| 状態     | 表示                         |
| -------- | ---------------------------- |
| 割当済み | 青丸 + 白数字                |
| 未割当   | グレー破線丸 + 「+」         |
| bye      | 番号割当不可（クリック無効） |

---

## 12. 利用箇所

### 12.1 管理画面

- ルート: `/admin/events/[id]`（Step ③）
- トーナメント作成済み（Step ②完了後）に有効化
- `onChanged` で親コンポーネントのデータ再読み込みを発火

### 12.2 コート画面での利用

- `match_label` は試合カードのフッターにバッジとして表示
- `matchLabelNum()` で試合の表示順ソートに使用

### 12.3 ライブ画面での利用

- `match_label` の番号順で試合一覧をソート
- アナウンス時に番号を読み上げ

---

## 13. 決定済み事項

- [x] ラベル形式: `{コート名}第{N}試合`
- [x] スコープ: コートごとに独立した連番
- [x] 自動割り当て: ラウンド → sort_order → position の優先順
- [x] 手動割り当て: クリックトグル方式（ドラッグ＆ドロップではない）
- [x] bye 除外: 不戦勝試合は番号割り当て対象外
- [x] 保存: 全試合を一括バッチ更新（割り当て済み + 未割り当て）
- [x] 既存ラベルからの順序復元: 初回ロード時に自動実行

## 14. 未決事項

（現時点でなし）
