-- 寝技解除・タイムアップ時にメインタイマーも自動停止するオプション
ALTER TABLE timer_presets ADD COLUMN IF NOT EXISTS newaza_stops_main boolean DEFAULT false;
