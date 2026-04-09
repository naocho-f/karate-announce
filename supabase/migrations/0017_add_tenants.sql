-- ================================================================
-- マルチテナント Phase 1: tenants テーブル + tenant_id カラム追加
-- 既存機能への影響: なし（DEFAULT 値で全既存データにデフォルトテナントを割り当て）
-- ================================================================

-- 1. tenants テーブル作成
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$')
    CHECK (slug NOT IN ('admin','login','signup','platform','select-tenant','api','t','offline')),
  name text NOT NULL,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'standard', 'pro')),
  custom_domain text UNIQUE,
  settings jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  tts_usage_count int DEFAULT 0,
  tts_usage_reset_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. デフォルトテナント作成 + 11 テーブルに tenant_id 追加
DO $$
DECLARE
  default_id uuid;
BEGIN
  -- デフォルトテナント（柔空会）を作成
  INSERT INTO tenants (slug, name) VALUES ('jukukai', '柔空会')
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO default_id FROM tenants WHERE slug = 'jukukai';

  -- 11 テーブルに tenant_id カラム追加（DEFAULT 付き NOT NULL）
  -- PostgreSQL 11+ では DEFAULT 付き ADD COLUMN は即座に完了（テーブルリライトなし）
  -- DEFAULT は Phase 4a（tenantInsert 導入時）まで維持する
  EXECUTE format('ALTER TABLE events ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT %L REFERENCES tenants(id)', default_id);
  EXECUTE format('ALTER TABLE dojos ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT %L REFERENCES tenants(id)', default_id);
  EXECUTE format('ALTER TABLE fighters ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT %L REFERENCES tenants(id)', default_id);
  EXECUTE format('ALTER TABLE rules ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT %L REFERENCES tenants(id)', default_id);
  EXECUTE format('ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT %L REFERENCES tenants(id)', default_id);
  EXECUTE format('ALTER TABLE matches ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT %L REFERENCES tenants(id)', default_id);
  EXECUTE format('ALTER TABLE entries ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT %L REFERENCES tenants(id)', default_id);
  EXECUTE format('ALTER TABLE bracket_rules ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT %L REFERENCES tenants(id)', default_id);
  EXECUTE format('ALTER TABLE timer_presets ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT %L REFERENCES tenants(id)', default_id);
  EXECUTE format('ALTER TABLE form_configs ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT %L REFERENCES tenants(id)', default_id);
  EXECUTE format('ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT %L REFERENCES tenants(id)', default_id);
END $$;

-- 3. matches の tenant_id 自動設定トリガー（tournaments から引き継ぐ）
CREATE OR REPLACE FUNCTION set_match_tenant_id()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO STRICT v_tenant_id
  FROM tournaments WHERE id = NEW.tournament_id;
  NEW.tenant_id := v_tenant_id;
  RETURN NEW;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    RAISE EXCEPTION 'set_match_tenant_id: tournament_id=% が見つかりません', NEW.tournament_id;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_match_tenant_id ON matches;
CREATE TRIGGER trg_match_tenant_id
  BEFORE INSERT ON matches
  FOR EACH ROW EXECUTE FUNCTION set_match_tenant_id();

-- 4. entries の tenant_id 自動設定トリガー（events から引き継ぐ）
CREATE OR REPLACE FUNCTION set_entry_tenant_id()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO STRICT v_tenant_id
  FROM events WHERE id = NEW.event_id;
  NEW.tenant_id := v_tenant_id;
  RETURN NEW;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    RAISE EXCEPTION 'set_entry_tenant_id: event_id=% が見つかりません', NEW.event_id;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_entry_tenant_id ON entries;
CREATE TRIGGER trg_entry_tenant_id
  BEFORE INSERT ON entries
  FOR EACH ROW EXECUTE FUNCTION set_entry_tenant_id();

-- 5. インデックス
CREATE INDEX IF NOT EXISTS idx_events_tenant_id ON events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dojos_tenant_id ON dojos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fighters_tenant_id ON fighters(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rules_tenant_id ON rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_tenant_id ON tournaments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_matches_tenant_id ON matches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_entries_tenant_id ON entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bracket_rules_tenant_id ON bracket_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_timer_presets_tenant_id ON timer_presets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_form_configs_tenant_id ON form_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bug_reports_tenant_id ON bug_reports(tenant_id);
