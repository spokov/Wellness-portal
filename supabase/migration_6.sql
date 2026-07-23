-- ============================================================
-- МИГРАЦИЯ 6: височина на клиента
-- Пусни това в Supabase -> SQL Editor -> New query -> Run
-- ============================================================

alter table clients add column if not exists height_cm numeric;
