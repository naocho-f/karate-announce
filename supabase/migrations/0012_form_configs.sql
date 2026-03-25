-- ============================================================
-- 0012_form_configs.sql
-- エントリーフォーム カスタマイズ機能
-- ============================================================

-- フォーム設定（大会ごとに1つ）
create table if not exists form_configs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  version int not null default 1,
  is_ready boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id)
);

-- フィールドごとの設定
create table if not exists form_field_configs (
  id uuid primary key default gen_random_uuid(),
  form_config_id uuid not null references form_configs(id) on delete cascade,
  field_key text not null,
  visible boolean not null default true,
  required boolean not null default false,
  sort_order int not null default 0,
  has_other_option boolean not null default false,
  custom_choices jsonb,  -- [{"label":"持参","value":"own"}, ...] or null (use defaults)
  unique(form_config_id, field_key)
);

-- 注意書き（フィールドに紐づく or フォーム先頭/末尾）
create table if not exists form_notices (
  id uuid primary key default gen_random_uuid(),
  form_config_id uuid not null references form_configs(id) on delete cascade,
  anchor_type text not null default 'field',        -- 'form_start' | 'field' | 'form_end'
  anchor_field_key text,                             -- anchor_type='field' のとき紐づけ先
  sort_order int not null default 0,                 -- 同一アンカー内の並び順
  text_content text,                                 -- 注意書きテキスト
  scrollable_text text,                              -- スクロール表示テキスト（規約用）
  link_url text,                                     -- リンクURL
  link_label text,                                   -- リンクの表示テキスト
  require_consent boolean not null default false,    -- 同意チェック必須か
  consent_label text,                                -- 「上記内容に表明・承諾いたします」等
  created_at timestamptz not null default now()
);

-- 注意書きに添付する画像
create table if not exists form_notice_images (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references form_notices(id) on delete cascade,
  storage_path text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- entries テーブル拡張
alter table entries add column if not exists extra_fields jsonb default '{}';
alter table entries add column if not exists form_version int;
alter table entries add column if not exists is_withdrawn boolean default false;

-- fighters テーブル拡張
alter table fighters add column if not exists extra_fields jsonb default '{}';

-- RLS 無効化（個人利用のため）
alter table form_configs disable row level security;
alter table form_field_configs disable row level security;
alter table form_notices disable row level security;
alter table form_notice_images disable row level security;

-- Supabase Storage バケット（注意書き画像用）
insert into storage.buckets (id, name, public)
values ('form-notice-images', 'form-notice-images', true)
on conflict (id) do nothing;

-- Storage ポリシー: 誰でも読み取り可、認証済みユーザーがアップロード可
create policy "Public read form-notice-images" on storage.objects
  for select using (bucket_id = 'form-notice-images');

create policy "Auth upload form-notice-images" on storage.objects
  for insert with check (bucket_id = 'form-notice-images');

create policy "Auth delete form-notice-images" on storage.objects
  for delete using (bucket_id = 'form-notice-images');
