-- 寝技タイマー累積モード
ALTER TABLE timer_presets ADD COLUMN IF NOT EXISTS newaza_accumulate BOOLEAN DEFAULT false;
