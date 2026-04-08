-- イベントのアクティブ化をアトミックに実行する RPC
-- 他の全イベントを非アクティブにしてから対象を有効化（単一トランザクション）
CREATE OR REPLACE FUNCTION activate_event(p_event_id uuid)
RETURNS void AS $$
BEGIN
  -- 全イベントを一旦非アクティブ化
  UPDATE events SET is_active = false WHERE is_active = true;
  -- 対象を有効化
  UPDATE events SET is_active = true WHERE id = p_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
