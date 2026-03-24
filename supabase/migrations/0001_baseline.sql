-- ============================================================
-- 0001_baseline.sql
-- 初期スキーマ（現在の実装に合わせたベースライン）
-- ============================================================

-- 流派マスタ
create table if not exists dojos (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  name_reading text,
  created_at timestamptz default now()
);

-- 選手マスタ（対戦表作成時にエントリーから自動生成）
create table if not exists fighters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_reading text,
  family_name text,
  given_name text,
  family_name_reading text,
  given_name_reading text,
  dojo_id uuid references dojos(id) on delete set null,
  affiliation text,           -- 「流派　道場」形式
  affiliation_reading text,   -- TTS 用読み仮名
  weight numeric,
  height numeric,
  age_info text,
  experience text,
  created_at timestamptz default now()
);

-- ルール（部門・クラス）
create table if not exists rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- 大会（イベント）
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date date,
  court_count int not null default 1,
  status text not null default 'preparing', -- 'preparing' | 'ongoing' | 'finished'
  is_active boolean not null default false,
  max_weight_diff numeric,
  max_height_diff numeric,
  created_at timestamptz default now()
);

-- イベント・ルール紐付け
create table if not exists event_rules (
  event_id uuid references events(id) on delete cascade,
  rule_id uuid references rules(id) on delete cascade,
  primary key (event_id, rule_id)
);

-- トーナメント（コートごとの対戦表）
create table if not exists tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  court text not null,
  status text not null default 'preparing', -- 'preparing' | 'ongoing' | 'finished'
  event_id uuid references events(id) on delete cascade,
  default_rules text,
  max_weight_diff numeric,
  max_height_diff numeric,
  created_at timestamptz default now()
);

-- 対戦（マッチ）
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references tournaments(id) on delete cascade,
  round int not null,
  position int not null,
  fighter1_id uuid references fighters(id) on delete set null,
  fighter2_id uuid references fighters(id) on delete set null,
  winner_id uuid references fighters(id) on delete set null,
  status text not null default 'waiting', -- 'waiting' | 'ready' | 'ongoing' | 'done'
  match_label text,
  rules text,
  created_at timestamptz default now(),
  unique(tournament_id, round, position)
);

-- エントリー（参加申し込み）
create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  family_name text not null,
  given_name text,
  family_name_reading text,
  given_name_reading text,
  school_name text,
  school_name_reading text,
  dojo_name text,
  dojo_name_reading text,
  weight numeric,
  height numeric,
  birth_date date,
  age int,
  grade text,
  experience text,
  is_seed boolean default false,  -- 廃止予定（0002で削除）
  memo text,
  admin_memo text,
  fighter_id uuid references fighters(id) on delete set null,
  created_at timestamptz default now()
);

-- エントリー・ルール紐付け
create table if not exists entry_rules (
  entry_id uuid references entries(id) on delete cascade,
  rule_id uuid references rules(id) on delete cascade,
  primary key (entry_id, rule_id)
);

-- RLS 無効化（個人利用のため）
alter table dojos disable row level security;
alter table fighters disable row level security;
alter table rules disable row level security;
alter table events disable row level security;
alter table event_rules disable row level security;
alter table tournaments disable row level security;
alter table matches disable row level security;
alter table entries disable row level security;
alter table entry_rules disable row level security;
