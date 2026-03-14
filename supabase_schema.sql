-- 空手大会アナウンスシステム Supabase スキーマ
-- Supabase Dashboard > SQL Editor で実行してください

create table dojos (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

create table fighters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  dojo_id uuid references dojos(id) on delete cascade,
  created_at timestamptz default now()
);

create table tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  court text not null,
  status text not null default 'preparing',
  created_at timestamptz default now()
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references tournaments(id) on delete cascade,
  round int not null,
  position int not null,
  fighter1_id uuid references fighters(id) on delete set null,
  fighter2_id uuid references fighters(id) on delete set null,
  winner_id uuid references fighters(id) on delete set null,
  status text not null default 'waiting',
  created_at timestamptz default now(),
  unique(tournament_id, round, position)
);

-- RLS を無効化（個人用途のため）
alter table dojos disable row level security;
alter table fighters disable row level security;
alter table tournaments disable row level security;
alter table matches disable row level security;
