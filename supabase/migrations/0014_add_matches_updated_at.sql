-- matches テーブルに楽観ロック用の updated_at カラムを追加
ALTER TABLE matches ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
