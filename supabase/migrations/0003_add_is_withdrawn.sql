-- ============================================================
-- 0003_add_is_withdrawn.sql
-- entries に欠場フラグを追加
-- ============================================================

alter table entries add column if not exists is_withdrawn boolean not null default false;
