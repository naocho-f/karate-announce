-- entries テーブルに is_test フラグを追加
ALTER TABLE entries ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

-- 既存の __test__ エントリーを is_test = true に移行し、admin_memo をクリア
UPDATE entries SET is_test = true, admin_memo = null WHERE admin_memo = '__test__';
