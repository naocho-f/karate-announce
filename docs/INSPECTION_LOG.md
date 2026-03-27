# 既存機能点検・リファクタ実行ログ

> **実施日**: 2026-03-27
> **実施者**: Claude Code
> **方針**: 各仕様書とコードを照合し、不整合・バグ・改善点を洗い出して修正

---

## 点検状況

| # | 対象 | ステータス | 検出件数 | 修正件数 |
|---|------|----------|---------|---------|
| 1 | EVENT_ADMIN_SPEC vs コード | 完了 | 2 | 2 |
| 2 | ENTRY_FORM_SPEC vs コード | 完了 | 3 | 3 |
| 3 | FORM_CONFIG_SPEC vs コード | 完了 | 0 | 0 |
| 4 | BRACKET_SPEC vs コード | 完了 | 2 | 2 |
| 5 | COURT_SPEC vs コード | 完了 | 5 | 5 |
| 6 | ANNOUNCE_SPEC vs コード | 完了 | 0 | 0 |
| 7 | コード品質（横断） | 完了 | 2 | 0 |

---

## 検出事項と対応

### 1. EVENT_ADMIN_SPEC vs コード

#### 1-1. 入力バリデーション不足（低リスク・見送り）
- **場所**: `app/api/admin/events/route.ts`, `app/api/admin/dojos/route.ts`, `app/api/admin/rules/route.ts`
- **内容**: イベント・道場・ルール作成APIで `name` が空文字でも作成可能
- **判断**: 管理画面の入力欄にはフロントで `required` があり実害なし。将来的にバックエンドバリデーション追加を検討

#### 1-2. is_active 切り替えの UUID ワークアラウンド（低リスク・見送り）
- **場所**: `app/admin/events/[id]/page.tsx`
- **内容**: 既存のアクティブイベントを非アクティブにするため、存在しない UUID でフィルタする回避策
- **判断**: RPC関数を作るのが理想だが、現状動作している。マルチテナント化時に要修正

### 2. ENTRY_FORM_SPEC vs コード

#### 2-1. [修正済] 403 エラーメッセージが汎用的
- **場所**: `app/entry/[eventId]/page.tsx` L542-546
- **修正内容**: 403 → "参加受付は終了しました。"、その他 → "送信に失敗しました。もう一度お試しください。"

#### 2-2. [修正済] organization_kana に dbColumn 欠落
- **場所**: `lib/form-fields.ts` L150-158
- **修正内容**: `dbColumn: "school_name_reading"` を追加（`branch_kana` の `dbColumn: "dojo_name_reading"` に合わせた対称修正）

#### 2-3. 道場自動作成の競合（低リスク・見送り）
- **場所**: `app/api/public/entry/route.ts`
- **内容**: 同名道場の同時作成でレースコンディションの可能性。ただし `name` ユニーク制約があり、重複時は DB エラーで再試行すれば済む
- **判断**: 発生頻度が極めて低く、実害も限定的なため見送り

### 3. FORM_CONFIG_SPEC vs コード
指摘事項なし。

### 4. BRACKET_SPEC vs コード

#### 4-1. [修正済] 不戦勝の次ラウンド status が常に "ready"
- **場所**: `app/api/admin/tournaments/route.ts` L140
- **修正内容**: 隣接ペアも不戦勝か確認し、両スロット埋まる場合のみ `status: "ready"`、片方のみなら `status: "waiting"` に修正

#### 4-2. [修正済] set_winner/correct_winner の次ラウンド status が常に "ready"
- **場所**: `app/api/court/matches/[id]/route.ts` L39, L95
- **修正内容**: 次ラウンドの試合で相手スロットが埋まっているか確認し、両者揃った場合のみ `status: "ready"`、片方のみなら `status: "waiting"` に修正

### 5. COURT_SPEC vs コード

#### 5-1〜5-5. [修正済] fetch の res.ok チェック欠落（5箇所）
- **場所**: `app/court/[court]/page.tsx` — start, setWinner, toggleWithdrawal, correctWinner, swapWithNext
- **修正内容**: 全 fetch 呼び出しに `res.ok` チェックと `alert()` エラー通知を追加

### 6. ANNOUNCE_SPEC vs コード
指摘事項なし。

### 7. コード品質（横断）

#### 7-1. 認証ハッシュの実装差異（観察のみ）
- **場所**: `proxy.ts`（Web Crypto API）vs `lib/admin-auth.ts`（Node crypto）
- **内容**: 同じ SHA-256 + ソルトだが異なる API で実装。結果は同一なので問題なし
- **判断**: 現状で正常動作。統一するメリットは小さいため見送り

#### 7-2. コート API 認証なし（設計として認識済み）
- **場所**: `app/api/court/matches/[id]/route.ts`, `app/api/court/entries/[id]/route.ts`
- **内容**: COURT_SPEC の未決事項として既に記載済み。本番前に認証追加が必要

---

## 修正サマリー

| ファイル | 修正内容 |
|---------|---------|
| `app/entry/[eventId]/page.tsx` | 403 エラー時に受付終了メッセージ表示、form-config fetch に res.ok チェック追加 |
| `lib/form-fields.ts` | organization_kana に `dbColumn: "school_name_reading"` 追加 |
| `app/api/admin/tournaments/route.ts` | 不戦勝処理を順次実行に変更（race condition 修正）、次ラウンド status を DB 参照で決定 |
| `app/api/court/matches/[id]/route.ts` | set_winner/correct_winner の次ラウンド status を明示的カラム指定で判定（テンプレートリテラル排除） |
| `app/court/[court]/page.tsx` | 5箇所の fetch に res.ok チェック + エラー通知追加 |
| `app/api/public/entry/route.ts` | 道場自動作成時に `name_reading` も保存 |

**ビルド確認**: `npm run build` 成功（エラーなし）

---

## 再レビュー（2回目）

2回目の全体レビューで追加検出・修正した事項:

| # | 重要度 | 内容 | 対応 |
|---|--------|------|------|
| R1 | Critical | 不戦勝の `Promise.all` で同一 round-2 match に並列書き込み → race condition | 順次実行 (`for` ループ) に変更、DB参照で status 決定 |
| R2 | High | `.select()` にテンプレートリテラル使用 + `as Record` による型キャスト | 明示的カラム名 `"id, fighter1_id, fighter2_id"` に変更、三項演算子で直接参照 |
| R3 | Medium | 道場自動作成時に `name_reading` が保存されない | `entry.school_name_reading` を insert に追加 |
| R4 | Medium | form-config fetch の `res.ok` チェック欠落 | チェック追加（エラー時は catch に落とす） |
