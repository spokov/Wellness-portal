-- ============================================================
-- СХЕМА ЗА БАЗА ДАННИ "Картотека на клиенти"
-- Стартирай това в Supabase -> SQL Editor -> New query -> Run
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- 1. Клиенти (лична информация) ----------
create table if not exists clients (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  address     text,
  phone       text,
  email       text,
  photo_url   text,
  birth_date  date,
  gender      text check (gender in ('Мъж', 'Жена', 'Друго')) ,
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_clients_full_name on clients (full_name);

-- ---------- 2. Дефиниция на 15-те параметъра, в 2 групи ----------
-- "tanita"  -> 10 параметъра (измервания от везна Tanita), отделна страница
-- "body"    -> 5 параметъра (мерки на тялото), отделна страница
-- Имената и типът (число/текст) се редактират от Настройки в приложението.
create table if not exists parameters (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  value_type  text not null check (value_type in ('number', 'text')) default 'text',
  category    text not null check (category in ('tanita', 'body')),
  sort_order  int not null
);

-- Начални 10 параметъра за групата "Tanita измервания" (преименувай при нужда)
insert into parameters (name, value_type, category, sort_order)
select name, 'number', 'tanita', row_number() over ()
from (values
  ('Тегло'),
  ('BMI (%)'),
  ('Мазнини (%)'),
  ('Вътрешни мазнини'),
  ('Мускулна маса (кг)'),
  ('Индекс на тялото'),
  ('Костна маса (кг)'),
  ('Базов метаболизъм (ккал)'),
  ('Метаболитна възраст'),
  ('Вода в тялото (%)')
) as v(name)
where not exists (select 1 from parameters);

-- Начални 5 параметъра за групата "Мерки на тялото"
insert into parameters (name, value_type, category, sort_order)
select name, 'number', 'body', row_number() over ()
from (values
  ('Обиколка Бюст (см)'),
  ('Обиколка Ръка (см)'),
  ('Обиколка Талия (см)'),
  ('Обиколка Корем (см)'),
  ('Обиколка Ханш (см)'),
  ('Обиколка Бедро (см)'),
  ('Обиколка Коляно (см)'),
  ('Тегло (кг)')
) as v(name)
where not exists (select 1 from parameters where category = 'body');

-- ---------- 3. История от стойности по параметър и клиент ----------
-- Всяко ново въведение създава НОВ ред (не презаписва старите), само с ДАТА (без час).
create table if not exists parameter_entries (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  parameter_id  uuid not null references parameters(id) on delete cascade,
  value         text,
  recorded_at   date not null default current_date
);

create index if not exists idx_entries_client_param
  on parameter_entries (client_id, parameter_id, recorded_at desc);

-- ============================================================
-- ВРЕМЕННИ (ОТВОРЕНИ) ПРАВИЛА ЗА ДОСТЪП
-- Приложението засега няма вход с потребител/парола (ще се добави
-- по-късно), затова таблиците са отворени за анонимния ключ.
-- КОГАТО добавиш логин, задължително стесни тези policy-та
-- (напр. auth.uid() is not null) преди да качиш реални клиентски данни.
-- ============================================================
alter table clients enable row level security;
alter table parameters enable row level security;
alter table parameter_entries enable row level security;

drop policy if exists "public_all_clients" on clients;
create policy "public_all_clients" on clients
  for all using (true) with check (true);

drop policy if exists "public_all_parameters" on parameters;
create policy "public_all_parameters" on parameters
  for all using (true) with check (true);

drop policy if exists "public_all_entries" on parameter_entries;
create policy "public_all_entries" on parameter_entries
  for all using (true) with check (true);

-- ============================================================
-- STORAGE (снимки на клиенти)
-- Стъпки в Supabase Dashboard -> Storage:
--   1. Create bucket -> име: "client-photos" -> Public bucket: ON
-- След създаването на bucket-а, изпълни и това:
-- ============================================================
insert into storage.buckets (id, name, public)
values ('client-photos', 'client-photos', true)
on conflict (id) do nothing;

drop policy if exists "public_read_photos" on storage.objects;
create policy "public_read_photos" on storage.objects
  for select using (bucket_id = 'client-photos');

drop policy if exists "public_upload_photos" on storage.objects;
create policy "public_upload_photos" on storage.objects
  for insert with check (bucket_id = 'client-photos');

drop policy if exists "public_delete_photos" on storage.objects;
create policy "public_delete_photos" on storage.objects
  for delete using (bucket_id = 'client-photos');
