-- 勝者設定 RPC: match 更新 + 次ラウンド配置 + トーナメント完了をアトミックに実行
--
-- handleSetWinner: p_result_method / p_result_detail は NULL
-- handleFinishTimer: p_result_method / p_result_detail を含む
CREATE OR REPLACE FUNCTION set_match_winner(
  p_match_id uuid,
  p_winner_id uuid,
  p_tournament_id uuid,
  p_round integer,
  p_rounds integer,
  p_position integer,
  p_result_method text DEFAULT NULL,
  p_result_detail jsonb DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  next_position INTEGER;
  next_field TEXT;
  next_match RECORD;
  other_filled uuid;
BEGIN
  -- 1. 対象 match を done に更新
  UPDATE matches
  SET winner_id    = p_winner_id,
      status       = 'done',
      result_method = COALESCE(p_result_method, result_method),
      result_detail = COALESCE(p_result_detail, result_detail),
      updated_at   = now()
  WHERE id = p_match_id;

  -- 2. 最終ラウンドならトーナメントを finished に
  IF p_round = p_rounds THEN
    UPDATE tournaments SET status = 'finished' WHERE id = p_tournament_id;
    RETURN;
  END IF;

  -- 3. 次ラウンドのマッチに勝者を配置
  next_position := p_position / 2;  -- integer division = floor
  IF p_position % 2 = 0 THEN
    next_field := 'fighter1_id';
  ELSE
    next_field := 'fighter2_id';
  END IF;

  SELECT id, status, fighter1_id, fighter2_id
  INTO next_match
  FROM matches
  WHERE tournament_id = p_tournament_id
    AND round = p_round + 1
    AND position = next_position
  FOR UPDATE;

  IF next_match IS NOT NULL
     AND next_match.status <> 'done'
     AND next_match.status <> 'ongoing'
  THEN
    -- 相手スロットが埋まっているか判定
    IF p_position % 2 = 0 THEN
      other_filled := next_match.fighter2_id;
    ELSE
      other_filled := next_match.fighter1_id;
    END IF;

    IF next_field = 'fighter1_id' THEN
      UPDATE matches
      SET fighter1_id = p_winner_id,
          status = CASE WHEN other_filled IS NOT NULL THEN 'ready' ELSE 'waiting' END
      WHERE id = next_match.id;
    ELSE
      UPDATE matches
      SET fighter2_id = p_winner_id,
          status = CASE WHEN other_filled IS NOT NULL THEN 'ready' ELSE 'waiting' END
      WHERE id = next_match.id;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
