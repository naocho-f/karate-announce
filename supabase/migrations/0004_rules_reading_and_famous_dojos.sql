-- rules テーブルに name_reading カラムを追加
ALTER TABLE rules ADD COLUMN IF NOT EXISTS name_reading TEXT;

-- 有名な流派をあらかじめ登録（既存の場合はスキップ）
INSERT INTO dojos (name, name_reading) VALUES
  ('極真会館', 'きょくしんかいかん'),
  ('新極真会', 'しんきょくしんかい'),
  ('芦原会館', 'あしはらかいかん'),
  ('正道会館', 'せいどうかいかん'),
  ('士道館', 'しどうかん'),
  ('大山空手', 'おおやまかいかん'),
  ('松濤館流', 'しょうとうかんりゅう'),
  ('剛柔流', 'ごうじゅうりゅう'),
  ('糸東流', 'しとうりゅう'),
  ('和道流', 'わどうりゅう'),
  ('上地流', 'うえちりゅう'),
  ('少林寺流', 'しょうりんじりゅう')
ON CONFLICT (name) DO NOTHING;
