-- karate-announce database schema
-- Generated from Supabase: 2026-03-28
-- Project: xkrjltbtikbgeimtjvga


create table bug_reports (
  id uuid not null default gen_random_uuid(),
  what_did text not null,
  what_happened text not null,
  what_expected text,
  page_url text not null,
  user_agent text,
  viewport text,
  app_version text,
  created_at timestamptz default now(),
  status text default 'open'::text,
  resolution text,
  fixed_in_version text
);

create table custom_field_defs (
  id uuid not null default gen_random_uuid(),
  form_config_id uuid not null,
  field_key text not null,
  label text not null,
  field_type text not null,
  choices jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table dojos (
  id uuid not null default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now(),
  name_reading text
);

create table entries (
  id uuid not null default gen_random_uuid(),
  event_id uuid,
  family_name text not null,
  given_name text,
  family_name_reading text,
  given_name_reading text,
  dojo_name text,
  weight numeric,
  height numeric,
  age_info text,
  experience text,
  fighter_id uuid,
  created_at timestamptz default now(),
  school_name text,
  birth_date date,
  age integer,
  grade text,
  school_name_reading text,
  dojo_name_reading text,
  memo text,
  admin_memo text,
  is_withdrawn boolean not null default false,
  is_test boolean not null default false,
  extra_fields jsonb default '{}'::jsonb,
  form_version integer,
  sex text
);

create table entry_rules (
  entry_id uuid not null,
  rule_id uuid not null
);

create table event_fighter_rules (
  event_id uuid not null,
  fighter_id uuid not null,
  rule_id uuid not null
);

create table event_fighters (
  event_id uuid not null,
  fighter_id uuid not null,
  seed_number integer
);

create table event_rules (
  event_id uuid not null,
  rule_id uuid not null
);

create table events (
  id uuid not null default gen_random_uuid(),
  name text not null,
  court_count integer not null default 1,
  status text not null default 'preparing'::text,
  created_at timestamptz default now(),
  is_active boolean default false,
  max_weight_diff numeric,
  max_height_diff numeric,
  event_date date,
  court_names text[],
  entry_closed boolean not null default false,
  entry_close_at timestamptz,
  banner_image_path text,
  ogp_image_path text,
  email_subject_template text,
  email_body_template text,
  venue_info text,
  notification_emails text[]
);

create table fighters (
  id uuid not null default gen_random_uuid(),
  name text not null,
  dojo_id uuid,
  created_at timestamptz default now(),
  name_reading text,
  weight numeric,
  height numeric,
  age_info text,
  experience text,
  family_name text,
  given_name text,
  family_name_reading text,
  given_name_reading text,
  affiliation text,
  affiliation_reading text,
  extra_fields jsonb default '{}'::jsonb
);

create table form_configs (
  id uuid not null default gen_random_uuid(),
  event_id uuid not null,
  version integer not null default 0,
  is_ready boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table form_field_configs (
  id uuid not null default gen_random_uuid(),
  form_config_id uuid not null,
  field_key text not null,
  visible boolean not null default true,
  required boolean not null default false,
  sort_order integer not null default 0,
  has_other_option boolean not null default false,
  custom_choices jsonb,
  custom_label text
);

create table form_notice_images (
  id uuid not null default gen_random_uuid(),
  notice_id uuid not null,
  storage_path text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table form_notices (
  id uuid not null default gen_random_uuid(),
  form_config_id uuid not null,
  anchor_type text not null default 'field'::text,
  anchor_field_key text,
  sort_order integer not null default 0,
  text_content text,
  scrollable_text text,
  link_url text,
  link_label text,
  require_consent boolean not null default false,
  consent_label text,
  created_at timestamptz not null default now()
);

create table matches (
  id uuid not null default gen_random_uuid(),
  tournament_id uuid,
  round integer not null,
  position integer not null,
  fighter1_id uuid,
  fighter2_id uuid,
  winner_id uuid,
  status text not null default 'waiting'::text,
  created_at timestamptz default now(),
  match_label text,
  rules text,
  result_method text,
  result_detail jsonb
);

create table rules (
  id uuid not null default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now(),
  name_reading text,
  description text,
  timer_preset_id uuid
);

create table settings (
  key text not null,
  value jsonb not null,
  updated_at timestamptz default now()
);

create table timer_logs (
  id uuid not null default gen_random_uuid(),
  match_id uuid not null,
  action text not null,
  payload jsonb default '{}'::jsonb,
  elapsed_ms integer not null default 0,
  created_at timestamptz default now()
);

create table timer_presets (
  id uuid not null default gen_random_uuid(),
  name text not null,
  event_id uuid,
  rule_id uuid,
  match_duration integer default 120,
  timer_direction text default 'countdown'::text,
  has_extension boolean default false,
  extension_duration integer default 60,
  extension_mode text default 'sudden_death'::text,
  allow_draw boolean default false,
  newaza_enabled boolean default false,
  newaza_duration integer default 30,
  newaza_limit_type text default 'unlimited'::text,
  newaza_max_count integer default 0,
  newaza_free_release integer default 0,
  show_points boolean default true,
  show_wazaari boolean default true,
  wazaari_points integer default 0,
  show_ippon boolean default true,
  ippon_wins boolean default true,
  point_win_threshold integer default 0,
  show_fouls boolean default true,
  foul_to_point_start integer default 0,
  foul_point_value integer default 1,
  foul_loss_count integer default 0,
  foul_vs_point_priority text default 'foul_priority'::text,
  show_player_names boolean default true,
  show_match_number boolean default true,
  color_left text default '#DC2626'::text,
  color_right text default '#FFFFFF'::text,
  color_left_name text default '赤'::text,
  color_right_name text default '白'::text,
  theme_bg_color text default '#000000'::text,
  theme_timer_color text default '#00FF00'::text,
  theme_timer_warn_color text default '#FF0000'::text,
  theme_warn_threshold integer default 10,
  theme_show_decimals boolean default false,
  theme_font_family text default 'digital'::text,
  theme_divider_color text default '#333333'::text,
  buzzer_on_time_up text default 'auto'::text,
  buzzer_on_newaza text default 'auto'::text,
  buzzer_sound text default 'default'::text,
  buzzer_custom_path text,
  swap_sides boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  layout jsonb
);

create table tournaments (
  id uuid not null default gen_random_uuid(),
  name text not null,
  court text not null,
  status text not null default 'preparing'::text,
  created_at timestamptz default now(),
  event_id uuid,
  default_rules text,
  max_weight_diff numeric,
  max_height_diff numeric,
  sort_order integer not null default 0,
  filter_min_weight numeric,
  filter_max_weight numeric,
  filter_min_age integer,
  filter_max_age integer,
  filter_sex text,
  type text not null default 'tournament'::text,
  filter_experience text,
  filter_grade text,
  filter_min_grade text,
  filter_max_grade text,
  filter_min_height real,
  filter_max_height real
);

