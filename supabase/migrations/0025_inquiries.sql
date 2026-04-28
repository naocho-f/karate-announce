-- ============================================================
-- 0025_inquiries.sql
-- 問い合わせフォームのデータ蓄積
-- ============================================================

create table if not exists inquiries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete set null,
  name text,
  email text,
  subject text,
  body text not null,
  ip_address inet,
  user_agent text,
  responded_at timestamptz,
  responded_note text,
  created_at timestamptz not null default now()
);

alter table inquiries disable row level security;

create index if not exists idx_inquiries_created_at on inquiries (created_at desc);
create index if not exists idx_inquiries_unresponded on inquiries (responded_at) where responded_at is null;
