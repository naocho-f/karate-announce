-- ============================================================
-- 0013_add_indexes.sql
-- 頻繁にクエリされるカラムにインデックスを追加
-- ============================================================

-- entries
CREATE INDEX IF NOT EXISTS idx_entries_event_id ON entries (event_id);

-- tournaments
CREATE INDEX IF NOT EXISTS idx_tournaments_event_id ON tournaments (event_id);

-- matches
CREATE INDEX IF NOT EXISTS idx_matches_tournament_id ON matches (tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_fighter1_id ON matches (fighter1_id);
CREATE INDEX IF NOT EXISTS idx_matches_fighter2_id ON matches (fighter2_id);
CREATE INDEX IF NOT EXISTS idx_matches_winner_id ON matches (winner_id);

-- entry_rules
CREATE INDEX IF NOT EXISTS idx_entry_rules_entry_id ON entry_rules (entry_id);
CREATE INDEX IF NOT EXISTS idx_entry_rules_rule_id ON entry_rules (rule_id);

-- event_rules
CREATE INDEX IF NOT EXISTS idx_event_rules_event_id ON event_rules (event_id);
CREATE INDEX IF NOT EXISTS idx_event_rules_rule_id ON event_rules (rule_id);

-- form_field_configs
CREATE INDEX IF NOT EXISTS idx_form_field_configs_form_config_id ON form_field_configs (form_config_id);

-- form_notices
CREATE INDEX IF NOT EXISTS idx_form_notices_form_config_id ON form_notices (form_config_id);

-- form_notice_images
CREATE INDEX IF NOT EXISTS idx_form_notice_images_notice_id ON form_notice_images (notice_id);

-- bug_reports
CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports (status);

-- timer_logs
CREATE INDEX IF NOT EXISTS idx_timer_logs_match_id ON timer_logs (match_id);

-- ============================================================
-- CHECK 制約
-- ============================================================

-- bug_reports.status の値を制限
ALTER TABLE bug_reports
  DROP CONSTRAINT IF EXISTS chk_bug_reports_status;
ALTER TABLE bug_reports
  ADD CONSTRAINT chk_bug_reports_status
  CHECK (status IN ('open', 'in_progress', 'resolved', 'wontfix'));
