-- ================================================================
-- 試合開始ブザー設定カラム追加
-- ================================================================

ALTER TABLE timer_presets ADD COLUMN IF NOT EXISTS buzzer_on_start text NOT NULL DEFAULT 'off';
ALTER TABLE timer_presets ADD COLUMN IF NOT EXISTS buzzer_sound_start text NOT NULL DEFAULT 'mid-square-single';
ALTER TABLE timer_presets ADD COLUMN IF NOT EXISTS buzzer_duration_start numeric NOT NULL DEFAULT 1.5;
ALTER TABLE timer_presets ADD COLUMN IF NOT EXISTS buzzer_repeat_start integer NOT NULL DEFAULT 1;
