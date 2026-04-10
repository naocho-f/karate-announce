# トーナメント表描画 仕様書

> **ステータス**: ドラフト
> **最終更新**: 2026-03-27
> **対象プロジェクト**: karate-announce
> **対象範囲**: トーナメントブラケットの描画・操作UI（BracketView コンポーネント）

---

## 1. 概要

### 1.1 目的

トーナメント形式の対戦表をツリー構造で描画し、試合の開始・勝者設定・訂正・欠場処理等の操作UIを提供する。コート画面と管理画面の両方で使用される共通コンポーネント。

### 1.2 対象コンポーネント

| ファイル                            | 役割                                       |
| ----------------------------------- | ------------------------------------------ |
| `lib/bracket-view.tsx`              | メイン描画コンポーネント（BracketView）    |
| `lib/bracket.ts`                    | ブラケット生成・勝ち上がりロジック         |
| `lib/tournament.ts`                 | ラウンド名称・合計ラウンド数ユーティリティ |
| `lib/match-utils.ts`                | 試合ラベルのパースユーティリティ           |
| `components/match-label-editor.tsx` | 試合番号割り当てUI + ワンマッチカード      |

### 1.3 関連仕様書

| 仕様書              | 関連内容                                               |
| ------------------- | ------------------------------------------------------ |
| BRACKET_SPEC.md     | 対戦表作成のビジネスロジック（ペアリング・確定フロー） |
| COURT_SPEC.md       | コート画面での試合進行操作                             |
| TIMER_SPEC.md       | 試合タイマー・判定結果記録                             |
| MATCH_LABEL_SPEC.md | 試合番号の管理・一括割り当て                           |

---

## 2. データ型

### 2.1 BracketMatch

```typescript
type BracketMatch = {
  id: string;
  round: number; // ラウンド番号（1 = 1回戦）
  position: number; // ラウンド内位置（0始まり）
  fighter1_id: string | null; // 赤側
  fighter2_id: string | null; // 白側
  winner_id: string | null;
  status: string; // "waiting" | "ready" | "ongoing" | "done"
  match_label: string | null; // 「第1試合」等
};
```

### 2.2 BracketView Props

| Prop                 | 型                                                 | 必須 | 説明                                          |
| -------------------- | -------------------------------------------------- | ---- | --------------------------------------------- |
| `matches`            | `BracketMatch[]`                                   | Yes  | 全試合データ                                  |
| `nameMap`            | `Record<string, string>`                           | Yes  | fighter_id → 表示名                           |
| `affiliationMap`     | `Record<string, string>`                           | No   | fighter_id → 所属名                           |
| `withdrawnIds`       | `Set<string>`                                      | No   | 欠場中の fighter_id セット                    |
| `fighterEntryMap`    | `Record<string, string>`                           | No   | fighter_id → entry_id マッピング              |
| `processingMatchIds` | `Set<string>`                                      | No   | 処理中の match_id セット                      |
| `mutedMatchIds`      | `Set<string>`                                      | No   | ミュート中の match_id セット                  |
| `assignedNumbers`    | `Record<string, number>`                           | No   | match_id → 割り当て番号（番号割当モード）     |
| `nextMatchId`        | `string`                                           | No   | 次に開始する試合ID（ハイライト用）            |
| `hasOngoingMatch`    | `boolean`                                          | No   | 進行中試合の有無（ready試合の開始ボタン制御） |
| `onSetWinner`        | `(matchId, fighterId) => void`                     | No   | 勝者設定ハンドラ                              |
| `onCorrectWinner`    | `(matchId, fighterId) => void`                     | No   | 勝者訂正ハンドラ                              |
| `onMatchClick`       | `(matchId) => void`                                | No   | 試合開始ハンドラ                              |
| `onNumberClick`      | `(matchId) => void`                                | No   | 番号割当クリックハンドラ                      |
| `onReannounceStart`  | `(matchId) => void`                                | No   | 試合開始再アナウンスハンドラ                  |
| `onReannounceWinner` | `(matchId) => void`                                | No   | 勝者再アナウンスハンドラ                      |
| `onWithdrawnToggle`  | `(matchId, fighterId, entryId, withdrawn) => void` | No   | 欠場切替ハンドラ                              |
| `onSwapWithNext`     | `(round, matchId) => void`                         | No   | 次試合とのスワップハンドラ                    |
| `onSwapFighters`     | `(matchId) => void`                                | No   | 赤白入替ハンドラ                              |
| `onToggleMute`       | `(matchId) => void`                                | No   | ミュート切替ハンドラ                          |

---

## 3. レイアウトアルゴリズム

### 3.1 定数

| 定数                | 値    | 説明                       |
| ------------------- | ----- | -------------------------- |
| `BRACKET_CARD_W`    | 172px | カード幅                   |
| `BRACKET_CARD_H`    | 120px | カード高さ（48 + 48 + 24） |
| `BRACKET_FIGHTER_H` | 48px  | 選手スロット高さ           |
| `BRACKET_FOOTER_H`  | 24px  | フッター高さ               |
| `BRACKET_GAP_W`     | 40px  | ラウンド間の水平間隔       |
| `BRACKET_COL_W`     | 212px | 列幅（172 + 40）           |
| `BRACKET_BASE_SLOT` | 120px | 1回戦の垂直スロット高さ    |

### 3.2 位置計算

```
slotH(round)       = BRACKET_BASE_SLOT × 2^(round-1)
centerY(round, pos) = pos × slotH(round) + slotH(round) / 2
cardTop(round, pos) = pos × slotH(round) + (slotH(round) - BRACKET_CARD_H) / 2
cardLeft(round)     = (round - 1) × BRACKET_COL_W
totalHeight         = totalSlots × BRACKET_BASE_SLOT
totalWidth          = maxRound × BRACKET_COL_W - BRACKET_GAP_W
```

- 各ラウンドの垂直スペースは前ラウンドの2倍（指数的拡大）
- カードはスロット内で垂直中央配置
- 水平方向はラウンド番号に応じた固定列

### 3.3 コンテナ

```tsx
<div className="overflow-x-auto pb-4">
  <div style={{ position: "relative", width: totalWidth, height: totalHeight }}>
    {/* SVG接続線 */}
    {/* Match Cards（absolute positioning） */}
  </div>
</div>
```

- 水平スクロール対応（`overflow-x-auto`）
- 全カードは `position: absolute` + インラインスタイルで配置

---

## 4. SVG 接続線

### 4.1 描画方式

ブラケット全体にかぶせるSVGオーバーレイ（`pointer-events: none`）で、隣接ラウンド間のH字型パスを描画。

### 4.2 パス計算

各試合について、次ラウンドの親試合への接続線を生成:

```
x1     = cardLeft(round) + BRACKET_CARD_W        // 現在カードの右端
y1     = centerY(round, position)                  // 現在カードの中心Y
xMid   = x1 + BRACKET_GAP_W / 2                   // 中間地点
x2     = cardLeft(round + 1)                       // 親カードの左端
y2     = centerY(round + 1, floor(position / 2))   // 親カードの中心Y

パス: M x1,y1 → H xMid → V y2 → H x2
```

### 4.3 スタイル

- 線色: `#4b5563`（gray-600）
- 線幅: 1.5px
- SVGは `position: absolute; top: 0; left: 0` でコンテナ全体をカバー

---

## 5. ラウンド名称

### 5.1 roundLabel() ユーティリティ

`lib/bracket-view.tsx` 内で定義。ラウンド番号と総ラウンド数から日本語名を生成:

| 条件                        | 表示     |
| --------------------------- | -------- |
| `totalRounds - round === 0` | 決勝     |
| `totalRounds - round === 1` | 準決勝   |
| `totalRounds - round === 2` | 準々決勝 |
| その他                      | 第N回戦  |

### 5.2 ヘッダー表示

各ラウンドの上部に灰色テキストでラウンド名を表示。位置は `cardLeft(round)` に合わせる。

---

## 6. 試合カード

### 6.1 構造

```
┌──────────────────────────┐
│ 🔴 [▶] 選手名1          [棄]│  ← fighter1スロット (48px)
│    所属名                    │
├──────────────────────────┤
│ ⚪ [▶] 選手名2          [棄]│  ← fighter2スロット (48px)
│    所属名                    │
├──────────────────────────┤
│ [第1試合]  [↕次][⇅赤白][📢] │  ← フッター (24px)
└──────────────────────────┘
```

### 6.2 選手スロット

**表示要素**:

1. **色バッジ**: 赤（`bg-red-700/80`）/白（`bg-gray-500/60`）の7px丸
2. **勝者矢印**: 勝者の場合、緑色の「▶」を表示
3. **選手名**: truncate で省略表示
4. **所属名**: 9px テキストで選手名の下に表示（欠場時は非表示）
5. **欠場切替ボタン**: 右端に配置（条件付き表示）

**選手名のスタイル**:
| 状態 | スタイル |
|------|---------|
| 勝者 | 緑色 + 太字 |
| 欠場 | グレー + 取り消し線 |
| 未確定（次ラウンド待ち） | グレー + イタリック |
| 通常 | 白色 |

**未確定スロットのラベル** (`pendingSlotLabel()`):
| 条件 | 表示 |
|------|------|
| 1回戦 + 選手なし | 「不戦勝」 |
| N回戦 + 選手なし | 「第X試合の勝者」or「ラウンド名 第X試合勝者」 |

### 6.3 フッター

フッターには試合状態に応じて以下の要素が表示される:

**試合ラベルバッジ**: `match_label` が設定済みの場合
| 状態 | 色 |
|------|-----|
| nextMatch | 青背景 |
| ongoing | 黄背景 |
| done / その他 | 暗灰色 |

**操作ボタン**:
| ボタン | 表示条件 | 機能 |
|--------|---------|------|
| ↕次 | NOT done, NOT ongoing, ラウンド内最後でない | 次試合とスワップ |
| ⇅赤白 | NOT done, NOT ongoing | fighter1 ↔ fighter2 入替 |
| 📢（ongoing時） | ongoing + ハンドラあり | 試合開始再アナウンス |
| 📢（done時） | done + ハンドラあり | 勝者再アナウンス |
| 訂正 | done + ハンドラあり | 勝者訂正モードに切替 |
| 🔇 / 🔊 | NOT done + ハンドラあり | ミュート切替 |

---

## 7. カード状態の視覚表現

### 7.1 ボーダー・シャドウ

| 状態            | ボーダー  | シャドウ       | 透明度 | 特殊効果                 |
| --------------- | --------- | -------------- | ------ | ------------------------ |
| 訂正中          | オレンジ  | オレンジグロー | 100%   | ─                        |
| done            | 緑（dim） | なし           | 100%   | ─                        |
| ongoing         | 黄色      | 黄色グロー     | 100%   | ─                        |
| nextMatch       | 青        | 青グロー       | 100%   | `animate-pulse`          |
| ready（dimmed） | グレー    | なし           | 40%    | hasOngoingMatch 時に減光 |
| デフォルト      | グレー    | なし           | 100%   | ─                        |

### 7.2 オーバーレイ

| 状態                                    | オーバーレイ内容                                  |
| --------------------------------------- | ------------------------------------------------- |
| 処理中（processingMatchIds に含む）     | スピナーアニメーション                            |
| ready + nextMatch + onMatchClick        | 「▶ 試合開始」ボタン（青背景）                    |
| ready + onMatchClick + !hasOngoingMatch | 「▶」ボタンのみ（暗め）                           |
| 訂正中                                  | 「タップで勝者を訂正」テキスト + キャンセルボタン |

### 7.3 番号割当モード

`onNumberClick` が提供されている場合:

- bye でないカードがクリック可能になる
- 未割当: グレーボーダー、ホバーで青
- 割当済み: 青ボーダー
- bye カードは番号割当から除外

---

## 8. 不戦勝（bye）の表示

### 8.1 判定

```typescript
const isBye = (m: BracketMatch) => m.round === 1 && !!m.fighter1_id && !m.fighter2_id;
```

### 8.2 表示

- fighter2 スロットに「不戦勝」と表示（イタリック・グレー）
- カードは `status: "done"` で緑ボーダー
- 勝者（fighter1）に緑矢印 + 緑テキスト
- 番号割当モードでクリック不可

---

## 9. 欠場者の表示

### 9.1 欠場バッジ

- 選手名に取り消し線（`line-through`）
- 赤色の「棄権」バッジ（`bg-red-900 text-red-400`）
- 所属名は非表示

### 9.2 欠場切替ボタン

| 条件     | 表示                                                                |
| -------- | ------------------------------------------------------------------- |
| 表示条件 | NOT done, NOT ongoing, fighter_id あり, entry_id あり, ハンドラあり |
| 欠場中   | 赤背景 + 赤テキスト                                                 |
| 通常     | グレーボーダー、ホバーで赤                                          |

---

## 10. ワンマッチの表示

### 10.1 概要

`type: "one_match"` のトーナメントは BracketView ではなく、専用の `OneMatchNumberCard` コンポーネントで表示。

### 10.2 OneMatchNumberCard

`components/match-label-editor.tsx` に定義。

**構造**: 水平レイアウトで選手名を左右に配置

```
[番号] 選手1名 vs 選手2名 [⇅]
```

**用途**: 試合番号割り当て画面（MatchLabelEditor）で `type === "one_match"` の場合に使用。

---

## 11. ミュート機能

### 11.1 概要

試合ごとにアナウンス音声のミュート/アンミュートを切替可能。

### 11.2 永続化

- `localStorage` に `muted_match_ids` キーで JSON 配列として保存
- ページリロードでも状態が維持される

### 11.3 表示

- フッターのスピーカーアイコン: 🔇（ミュート中）/ 🔊（通常）

---

## 12. 使用箇所

### 12.1 コート画面

- ルート: `/court/[court]`
- 全ハンドラ（試合開始・勝者設定・訂正・欠場・スワップ・ミュート・再アナウンス）を提供
- 3秒ポーリング + visibility change でデータ再取得
- `nextMatchId` でハイライト表示

### 12.2 管理画面（イベント詳細）

- ルート: `/admin/events/[id]`
- 確定済みトーナメントのプレビュー表示
- 試合番号割り当てモード（`onNumberClick` 経由）

### 12.3 試合番号エディタ

- コンポーネント: `MatchLabelEditor`
- BracketView を番号割当モードで表示
- トーナメント型は BracketView、ワンマッチ型は OneMatchNumberCard を使用

---

## 13. 決定済み事項

- [x] 描画方式: HTML/CSS absolute positioning + SVG 接続線
- [x] レイアウト: 指数的垂直拡大（ラウンドごとに2倍）
- [x] カードサイズ: 172px × 120px 固定
- [x] ラウンド名: 決勝・準決勝・準々決勝・第N回戦
- [x] bye カードは番号割当から除外
- [x] ミュート状態は localStorage に永続化
- [x] ワンマッチは専用コンポーネントで水平表示

## 14. 未決事項

（現時点でなし）

---

## オフライン対応

詳細は [OFFLINE_SPEC.md](OFFLINE_SPEC.md) を参照。

勝者設定操作時の「確定待ち」表示（addPendingWinner/removePendingWinner）。サーバー応答前でもローカルで確定待ち状態を表示。
