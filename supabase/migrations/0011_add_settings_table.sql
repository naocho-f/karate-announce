-- グローバル設定テーブル（アナウンステンプレートなど）
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
