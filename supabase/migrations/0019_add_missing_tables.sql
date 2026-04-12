-- ============================================================
-- 0019_add_missing_tables.sql
-- 本番DBに存在するがマイグレーション未記録だったテーブルを追加
-- 注: 本番DBでは既に存在するため実行不要。新環境構築時は
--     supabase_schema.sql を使用するため、このファイルは履歴用。
-- ============================================================

-- 振り分けルール（全自動対戦表作成用）
CREATE TABLE IF NOT EXISTS bracket_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  rule_id uuid REFERENCES rules(id),
  min_age integer,
  max_age integer,
  min_weight numeric,
  max_weight numeric,
  min_height real,
  max_height real,
  min_grade text,
  max_grade text,
  max_grade_diff integer,
  max_weight_diff numeric,
  max_height_diff numeric,
  sex_filter text,
  court_num integer,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 冪等性キー（重複リクエスト防止）
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key text PRIMARY KEY,
  response_status integer NOT NULL,
  response_body jsonb,
  created_at timestamptz DEFAULT now()
);

-- イベント・選手紐付け（対戦表作成時）
CREATE TABLE IF NOT EXISTS event_fighters (
  event_id uuid NOT NULL REFERENCES events(id),
  fighter_id uuid NOT NULL REFERENCES fighters(id),
  seed_number integer
);

-- イベント・選手・ルール紐付け
CREATE TABLE IF NOT EXISTS event_fighter_rules (
  event_id uuid NOT NULL REFERENCES events(id),
  fighter_id uuid NOT NULL REFERENCES fighters(id),
  rule_id uuid NOT NULL REFERENCES rules(id)
);
