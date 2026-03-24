-- events テーブルにコート名配列を追加
ALTER TABLE events ADD COLUMN IF NOT EXISTS court_names text[];
