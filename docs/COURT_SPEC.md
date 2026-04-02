# コート画面・試合進行 仕様書

> **ステータス**: ドラフト
> **最終更新**: 2026-03-27
> **対象プロジェクト**: karate-announce
> **対象範囲**: コート画面の表示・操作、試合進行ロジック、ライブ画面

---

## 1. 概要

### 1.1 目的
コートごとの試合進行を管理する画面。試合の開始・勝者設定・訂正・欠場処理・アナウンスをリアルタイムに操作する。審判・進行係が使用するメイン操作画面。

### 1.2 対象ルート
| ルート | 画面 | 目的 |
|--------|------|------|
| `/court/[court]` | コート操作画面 | 試合進行（読み書き） |
| `/court` | コート一覧画面 | コート選択 |
| `/live` | ライブ画面 | 全コート閲覧（読み取り専用） |

### 1.3 関連仕様書
| 仕様書 | 関連内容 |
|--------|---------|
| BRACKET_VIEW_SPEC.md | トーナメント描画コンポーネント |
| BRACKET_SPEC.md | トーナメント作成・ペアリング |
| MATCH_LABEL_SPEC.md | 試合番号の割り当て |
| ANNOUNCE_SPEC.md | TTS アナウンス |
| TIMER_SPEC.md | 試合タイマー・判定結果記録 |

---

## 2. データモデル（試合進行関連）

### 2.1 試合ステータス
```
waiting → ready → ongoing → done
```

| ステータス | 意味 |
|-----------|------|
| `waiting` | 選手が揃っていない（勝ち上がり待ち） |
| `ready` | 両選手が揃い試合開始可能 |
| `ongoing` | 試合進行中 |
| `done` | 試合終了（勝者確定済み） |

### 2.2 トーナメントステータス
```
preparing → ongoing → finished
```

| ステータス | 遷移条件 |
|-----------|---------|
| `preparing` | 初期状態 |
| `ongoing` | 最初の試合が開始された時 |
| `finished` | 決勝戦の勝者が確定した時 |

---

## 3. コート操作画面

### 3.1 ページ構成
- **ヘッダー**: ← ホームへ戻るリンク + コート表示名 + タイマー操作パネル（2列グリッドのカード形式で「⏱ タイマー表示画面を開く」「🎮 操作パネルを開く」を配置。別窓で `/timer/{court}` と `/timer/{court}/control` を開く）
- **ステータスバナー**:
  - 全試合終了 → 緑バナー「全試合終了」
  - 試合中あり → 黄バナー「試合中」（該当試合へジャンプ）
  - 次の試合あり → 青バナー「次の試合」（該当試合へジャンプ）
- **トーナメント一覧**: `status !== "finished"` のトーナメントを表示
- 各トーナメントは `BracketView` コンポーネントで描画

### 3.2 コート表示名
```typescript
event.court_names[courtIndex]?.trim() || `コート${courtNum}`
```
イベント設定のコート名が優先、未設定時はデフォルト名。

### 3.3 完了トーナメントの非表示
`status === "finished"` のトーナメントはコート画面から自動的に除外。全トーナメントが finished の場合、「全試合終了」バナーが表示。

---

## 4. データ読み込みとポーリング

### 4.1 読み込みフロー
```
1. アクティブイベント取得（is_active = true）
2. コート番号でトーナメント取得（status != "finished"、sort_order + created_at 順）
3. 全トーナメントの試合取得（round + position 順）
4. 参照される fighter_id を収集
5. エントリー取得（欠場状態を含む）
6. 変更検出（JSON比較で前回と差分があれば更新、なければスキップ）
7. Fighter詳細取得（名前・所属情報）
8. 状態組み立て（withdrawnIds, fighterEntryMap 等）
```

### 4.2 ポーリング
- **間隔**: 3秒（`setInterval(load, 3000)`）
- **可視性復帰**: `visibilitychange` イベントで即時再読み込み
- **変更検出**: matches と entries の JSON シリアライズを比較し、差分がなければ再レンダリングをスキップ

### 4.3 Supabase Realtime
- **コート画面**: Realtime 不使用（ポーリングのみ）
- **ライブ画面**: Realtime + ポーリングのハイブリッド

---

## 5. 試合操作

### 5.1 試合開始（start）
**トリガー**: BracketView の試合開始ボタンクリック

**API**:
```
PATCH /api/court/matches/{id}
Body: { action: "start", tournamentId: "..." }
```

**処理**:
1. `matches.status` → `"ongoing"` に更新
2. `tournaments.status` → `"ongoing"` に更新（tournamentId 指定時）

**後処理**:
1. データ再読み込み
2. ミュートでなければ試合開始アナウンス実行

### 5.2 勝者設定（set_winner）
**トリガー**: ongoing 試合で選手名クリック

**API**:
```
PATCH /api/court/matches/{id}
Body: { action: "set_winner", winnerId: "...", round: N, rounds: M, position: P }
```

**処理**:
1. `winner_id` を設定、`status` → `"done"`
2. 次ラウンドへの勝ち上がり（最終ラウンドでない場合）:
   - `nextPosition = floor(position / 2)`
   - position が偶数 → 次試合の `fighter1_id` に配置
   - position が奇数 → 次試合の `fighter2_id` に配置
   - 次試合の両スロットが埋まれば `status` → `"ready"`、片方のみなら `"waiting"`
3. 最終ラウンドの場合: `tournaments.status` → `"finished"`

**後処理**:
1. データ再読み込み
2. ミュートでなければ勝者アナウンス実行

### 5.3 勝者訂正（correct_winner）
**トリガー**: 「訂正」ボタン → 訂正モード → 選手名クリック

**API**:
```
PATCH /api/court/matches/{id}
Body: { action: "correct_winner", winnerId: "...", round: N, rounds: M, position: P }
```

**処理**:
1. `winner_id` を更新（`status` は変更なし、`done` のまま）
2. 次ラウンドの試合が `ongoing` または `done` でない場合のみ、次ラウンドの選手を更新
   - 既に進行・完了している試合には影響しない（安全策）
   - 次試合の両スロットが埋まれば `status` → `"ready"`、片方のみなら `"waiting"`

**set_winner との違い**:
- status を変更しない（既に done）
- 次ラウンドへの伝搬に条件あり（既に進行中の試合は上書きしない）

### 5.4 選手差替（replace）
**API**:
```
PATCH /api/court/matches/{id}
Body: { action: "replace", slot: "f1" | "f2", newFighterId: "..." }
```

**処理**:
1. 指定スロットの fighter_id を更新
2. 両選手が揃えば `status: "ready"`、片方のみなら `status: "waiting"`

### 5.5 試合情報編集（edit）
**API**:
```
PATCH /api/court/matches/{id}
Body: { action: "edit", matchLabel: "...", rules: "..." }
```

### 5.6 試合位置スワップ（swap_with）
**API**:
```
PATCH /api/court/matches/{id}
Body: { action: "swap_with", otherMatchId: "..." }
```

**処理**: 3ステップで position を交換（UNIQUE 制約回避）:
1. 自分の position → 99999（仮値）
2. 相手の position → 自分の元position
3. 自分の position → 相手の元position

### 5.7 タイマー結果書き戻し（finish_timer）
**トリガー**: タイマー操作画面から試合終了時に呼び出し

**API**:
```
PATCH /api/court/matches/{id}
Body: { action: "finish_timer", winnerId: "..." | null, tournamentId: "...", round: N, rounds: M, position: P, resultMethod: "...", resultDetail: {...} }
```

**処理**:
1. `winner_id`、`status` → `"done"`、`result_method`、`result_detail` を更新
2. 勝者がいる場合、次ラウンドへの勝ち上がり（`set_winner` と同じロジック）
3. 決勝で勝者がいる場合: `tournaments.status` → `"finished"`
4. 勝者なし（引き分け）の場合: `status` → `"done"` のみ（次ラウンドへの伝搬なし）

**set_winner との違い**:
- `result_method`（ippon, decision, draw 等）と `result_detail`（得点詳細）を記録
- 勝者なし（`winnerId: null`）を許容（引き分け）

---

## 6. 欠場処理

### 6.1 欠場切替
**API**:
```
PATCH /api/court/entries/{id}
Body: { is_withdrawn: boolean }
```

### 6.2 欠場の影響
- BracketView で欠場者に取り消し線 + 「棄権」バッジ
- 未完了試合で欠場者がいる場合、対戦相手が自動的に不戦勝に設定可能
- 詳細は BRACKET_SPEC.md セクション9を参照

---

## 7. アナウンス連携

### 7.1 自動アナウンス
| イベント | アナウンス内容 |
|---------|--------------|
| 試合開始 | 試合ラベル + ルール + 両選手名・所属 |
| 勝者確定 | 勝者名・所属 |

### 7.2 ミュート制御
- 試合ごとにミュート/アンミュート切替可能
- `localStorage` の `muted_match_ids` キーに JSON 配列で永続化
- ミュート中は試合開始・勝者アナウンスをスキップ

### 7.3 再アナウンス
- 「📢」ボタンで試合開始/勝者のアナウンスを再実行
- ongoing 試合: 試合開始の再アナウンス
- done 試合: 勝者の再アナウンス

### 7.4 TTS 設定
- `localStorage` の `tts_voice`、`tts_speed` で音声・速度を制御
- TTS API: `POST /api/tts`

### 7.5 TTS 事前読み込み（prefetch）
- 次の試合（`courtNextMatch`）が確定した時点で、アナウンステキストを事前に `/api/tts` に POST して音声を生成
- `buildMatchStartText` でテキストを組み立て、`prefetchTts` で送信（再生はしない）
- 同じ試合の二重リクエストは `prefetchedRef` で防止
- prefetch の失敗は無視する（本番のアナウンス時に再リクエストされるため）

---

## 8. ライブ画面

### 8.1 概要
全コートの試合状況を閲覧する読み取り専用画面。観客・配信用。

### 8.2 表示
- タブで各コートを切替（コート数 > 1 の場合）
- 各コートの「現在の試合」「次の試合」を表示
- 試合一覧を `matchLabelNum()` でソート

### 8.3 データ更新
- **Supabase Realtime**: `matches` テーブルの変更を購読
- **ポーリング**: 5秒間隔（Realtime のフォールバック）
- 操作ボタンなし（読み取り専用）

---

## 9. コート一覧画面

### 9.1 概要
`/court` ルートで全コートのパネルを表示。ユーザーがコートを選択して操作画面に遷移。

### 9.2 表示条件
- アクティブイベント（`is_active = true`）がない場合、ロック状態を表示
- 各コートのトーナメント一覧を `CourtPanel` コンポーネントで表示

---

## 10. API

### 10.1 PATCH `/api/court/matches/{id}`

| 項目 | 内容 |
|------|------|
| 認証 | なし（コート画面は公開） |
| リクエスト | `{ action, tournamentId?, winnerId?, round?, rounds?, position?, slot?, newFighterId?, matchLabel?, rules?, otherMatchId? }` |
| アクション | `start`, `set_winner`, `correct_winner`, `replace`, `edit`, `swap_with`, `finish_timer` |
| レスポンス | `{ ok: true }` |

### 10.2 PATCH `/api/court/entries/{id}`

| 項目 | 内容 |
|------|------|
| 認証 | なし |
| リクエスト | `{ is_withdrawn: boolean }` |
| レスポンス | `{ ok: true }` |

---

## 11. 状態管理

### 11.1 ページ状態
| 状態 | 型 | 説明 |
|------|-----|------|
| `isEventActive` | `boolean \| null` | null=読み込み中、false=非アクティブ |
| `courtDisplayName` | `string` | コート表示名 |
| `tournaments` | `Tournament[]` | 未完了トーナメント |
| `matchesMap` | `Record<string, Match[]>` | tournament_id → 試合配列 |
| `fighters` | `Record<string, Fighter>` | fighter_id → 詳細情報 |
| `withdrawnFighterIds` | `Set<string>` | 欠場中の fighter_id |
| `fighterEntryMap` | `Record<string, string>` | fighter_id → entry_id |
| `processingMatchIds` | `Set<string>` | API 呼び出し中の match_id |
| `mutedMatchIds` | `Set<string>` | ミュート中の match_id |

### 11.2 localStorage キー
| キー | 内容 |
|------|------|
| `muted_match_ids` | ミュート中の match_id 配列（JSON） |
| `tts_voice` | TTS 音声名 |
| `tts_speed` | TTS 再生速度 |

---

## 12. 決定済み事項

- [x] ポーリング方式: 3秒間隔 + visibility change
- [x] コート画面は Realtime 不使用（ポーリングのみ）
- [x] ライブ画面は Realtime + 5秒ポーリングのハイブリッド
- [x] 完了トーナメントはコート画面から自動非表示
- [x] 勝者訂正は次ラウンドが未進行の場合のみ伝搬
- [x] 試合位置スワップは3ステップ（UNIQUE制約回避）
- [x] ミュート状態は localStorage に永続化
- [x] コート画面の API は認証なし（公開）

## 13. 未決事項

- [ ] コート画面・コートAPIに認証を追加（現状は開発・テスト期間中のため認証なし。本番では認証必須にする。認証なしで公開するのはライブ速報ページ `/live` のみ）
