ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS filter_min_weight numeric,
  ADD COLUMN IF NOT EXISTS filter_max_weight numeric,
  ADD COLUMN IF NOT EXISTS filter_min_age int,
  ADD COLUMN IF NOT EXISTS filter_max_age int;
