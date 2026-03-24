-- position の UNIQUE 制約を deferrable に変更（アトミックスワップのため）
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_tournament_id_round_position_key;
ALTER TABLE matches ADD CONSTRAINT matches_tournament_id_round_position_key
  UNIQUE (tournament_id, round, position) DEFERRABLE INITIALLY IMMEDIATE;

-- position=-1 で止まっている壊れたデータを修復
-- 同じ tournament_id + round 内で欠けている position を補完する
DO $$
DECLARE
  r RECORD;
  missing_pos INTEGER;
BEGIN
  FOR r IN
    SELECT id, tournament_id, round
    FROM matches
    WHERE position = -1
  LOOP
    -- 同じ tournament_id + round の position の最大値+1 を仮の値として使い、
    -- 実際には欠けている position を探して設定する
    SELECT MIN(seq) INTO missing_pos
    FROM generate_series(0, 100) AS seq
    WHERE NOT EXISTS (
      SELECT 1 FROM matches
      WHERE tournament_id = r.tournament_id
        AND round = r.round
        AND position = seq
        AND id <> r.id
    );
    UPDATE matches SET position = missing_pos WHERE id = r.id;
    RAISE NOTICE 'Repaired match % → position %', r.id, missing_pos;
  END LOOP;
END $$;

-- アトミックスワップ関数
CREATE OR REPLACE FUNCTION swap_match_positions(match1_id uuid, match2_id uuid)
RETURNS void AS $$
DECLARE
  pos1 INTEGER;
  pos2 INTEGER;
BEGIN
  -- 行ロックを取得しながら現在の position を取得
  SELECT position INTO pos1 FROM matches WHERE id = match1_id FOR UPDATE;
  SELECT position INTO pos2 FROM matches WHERE id = match2_id FOR UPDATE;

  -- 制約を遅延評価にしてトランザクション内でスワップ
  SET CONSTRAINTS matches_tournament_id_round_position_key DEFERRED;
  UPDATE matches SET position = pos2 WHERE id = match1_id;
  UPDATE matches SET position = pos1 WHERE id = match2_id;
  -- トランザクション終了時に制約チェック → 問題なければコミット、あればロールバック
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
