# 論理削除（ソフトデリート）仕様

## 概要

管理画面での誤削除を防止するため、データの物理削除を行わず論理削除（`deleted_at` カラムによるマーキング）を採用する。

## 対象テーブル

| テーブル          | 一覧画面       | 備考           |
| ----------------- | -------------- | -------------- |
| events            | イベント一覧   | 親エンティティ |
| tournaments       | イベント詳細内 | events配下     |
| entries           | イベント詳細内 | events配下     |
| bracket_rules     | イベント詳細内 | events配下     |
| form_notices      | フォーム設定内 | events配下     |
| custom_field_defs | フォーム設定内 | events配下     |
| timer_presets     | タイマー一覧   | 設定           |
| dojos             | 道場一覧       | 設定           |
| rules             | ルール一覧     | 設定           |

## 動作仕様

### 削除操作

- 削除ボタン押下時、レコードを物理削除せず `deleted_at` に現在時刻（UTC）をセットする
- 既存のカスケード削除（matches、entry_rules等の子テーブル）は発動しない（親を物理削除しないため）

### 表示ルール

| 状態                   | 条件                                                      | 表示                                  |
| ---------------------- | --------------------------------------------------------- | ------------------------------------- |
| 通常                   | `deleted_at IS NULL`                                      | 通常表示                              |
| 削除済み（24時間以内） | `deleted_at IS NOT NULL` かつ `deleted_at > NOW() - 24h`  | グレーアウト表示 + 「削除取消」ボタン |
| 削除済み（24時間超過） | `deleted_at IS NOT NULL` かつ `deleted_at <= NOW() - 24h` | 非表示（一覧から除外）                |

### 削除取消

- 「削除取消」ボタン押下時、`deleted_at` を `NULL` に戻す
- 24時間以内であればユーザーが自力で復元可能
- 24時間経過後は画面から非表示になるため、DB直接操作でのみ復元可能

### 子データの扱い

- 親テーブル（events等）を論理削除した場合、子テーブル（tournaments、entries等）はそのまま残す
- 親への画面遷移動線が消えるため、子データに個別対応は不要
- ただし子テーブル自身にも `deleted_at` があるため、イベント詳細画面内での個別削除・取消も可能

## API仕様

### 削除（既存エンドポイントの変更）

各テーブルの `DELETE /api/admin/{resource}/{id}` を以下に変更：

- リクエスト: `DELETE /api/admin/{resource}/{id}`（変更なし）
- 処理: `UPDATE {table} SET deleted_at = NOW() WHERE id = {id}`
- レスポンス: `200 OK`

### 削除取消（新規エンドポイント）

各テーブルに `PATCH /api/admin/{resource}/{id}/restore` を追加：

- リクエスト: `PATCH /api/admin/{resource}/{id}/restore`
- 処理: `UPDATE {table} SET deleted_at = NULL WHERE id = {id}`
- 条件: `deleted_at` が24時間以内のレコードのみ（超過は404）
- レスポンス: `200 OK`

### 一覧取得（既存エンドポイントの変更）

各テーブルのSELECTクエリに以下のフィルタを追加：

- 管理画面: `deleted_at IS NULL OR deleted_at > NOW() - INTERVAL '24 hours'`（24時間以内の削除済みも含む）
- 公開画面: `deleted_at IS NULL`（削除済みは一切表示しない）

## UI仕様

### グレーアウト表示

削除済み（24時間以内）のアイテムは以下のスタイルで表示：

- `opacity-50` で半透明化
- 削除ボタンの代わりに「削除取消」ボタンを表示
- 表示位置は変えない（通常アイテムと同じリスト内）

### SELECTクエリのフィルタ

管理画面では Supabase JS クライアントで以下のフィルタを使用：

```typescript
const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
query.or(`deleted_at.is.null,deleted_at.gt.${cutoff}`);
```

公開画面では：

```typescript
query.is("deleted_at", null);
```

### 対象コンポーネント

| コンポーネント                              | エンティティ                    | クエリ方式    |
| ------------------------------------------- | ------------------------------- | ------------- |
| components/events-panel.tsx                 | events                          | Supabase直接  |
| components/timer-presets-panel.tsx          | timer_presets                   | fetch API経由 |
| components/settings-panel.tsx               | dojos, rules                    | Supabase直接  |
| app/admin/events/[id]/page.tsx              | tournaments, entries            | Supabase直接  |
| components/bracket-rules-panel.tsx          | bracket_rules                   | fetch API経由 |
| app/admin/events/[id]/form-config-panel.tsx | form_notices, custom_field_defs | fetch API経由 |

## DBマイグレーション

```sql
ALTER TABLE events ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE tournaments ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE entries ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE bracket_rules ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE form_notices ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE custom_field_defs ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE timer_presets ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE dojos ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE rules ADD COLUMN deleted_at TIMESTAMPTZ;
```
