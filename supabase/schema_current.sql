-- ============================================================
-- WELLNESS PORTAL — АКТУАЛНА ПЪЛНА СХЕМА
-- За НОВ Supabase проект изпълни само този файл.
-- За съществуващ проект изпълни migration_9.sql и migration_10.sql вместо този файл.
-- ============================================================

begin;

create extension if not exists "pgcrypto";

-- ---------- Акаунти и йерархия ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null check (role in ('admin', 'trainer', 'client')),
  full_name   text,
  username    text,
  email       text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create unique index if not exists profiles_username_unique
  on public.profiles (lower(username))
  where username is not null;
create index if not exists idx_profiles_created_by on public.profiles (created_by);

-- ---------- Клиенти ----------
create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  address     text,
  phone       text,
  email       text,
  photo_url   text, -- legacy fallback; новите снимки използват photo_path
  photo_path  text,
  birth_date  date,
  gender      text check (gender in ('Мъж', 'Жена', 'Друго')),
  height_cm   numeric,
  notes       text,
  owner_id    uuid references public.profiles(id),
  user_id     uuid unique references public.profiles(id),
  created_at  timestamptz not null default now()
);

create index if not exists idx_clients_full_name on public.clients (full_name);
create index if not exists idx_clients_owner_id on public.clients (owner_id);
create index if not exists idx_clients_user_id on public.clients (user_id);

-- ---------- Параметри ----------
create table if not exists public.parameters (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  value_type  text not null check (value_type in ('number', 'text')) default 'number',
  category    text not null check (category in ('tanita', 'body')),
  sort_order  int not null
);

create index if not exists idx_parameters_category_order
  on public.parameters (category, sort_order);

insert into public.parameters (name, value_type, category, sort_order)
select name, 'number', 'tanita', sort_order
from (values
  ('Тегло', 1),
  ('BMI (%)', 2),
  ('Мазнини (%)', 3),
  ('Вътрешни мазнини', 4),
  ('Мускулна маса (кг)', 5),
  ('Индекс на тялото', 6),
  ('Костна маса (кг)', 7),
  ('Базов метаболизъм (ккал)', 8),
  ('Метаболитна възраст', 9),
  ('Вода в тялото (%)', 10)
) as v(name, sort_order)
where not exists (select 1 from public.parameters where category = 'tanita');

insert into public.parameters (name, value_type, category, sort_order)
select name, 'number', 'body', sort_order
from (values
  ('Обиколка Бюст (см)', 1),
  ('Обиколка Ръка (см)', 2),
  ('Обиколка Талия (см)', 3),
  ('Обиколка Корем (см)', 4),
  ('Обиколка Ханш (см)', 5),
  ('Обиколка Бедро (см)', 6),
  ('Обиколка Коляно (см)', 7),
  ('Тегло (кг)', 8)
) as v(name, sort_order)
where not exists (select 1 from public.parameters where category = 'body');

-- ---------- История на измерванията ----------
create table if not exists public.parameter_entries (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  parameter_id  uuid not null references public.parameters(id) on delete cascade,
  value         text,
  recorded_at   date not null default current_date
);

create unique index if not exists parameter_entries_unique_per_day
  on public.parameter_entries (client_id, parameter_id, recorded_at);
create index if not exists idx_entries_client_param
  on public.parameter_entries (client_id, parameter_id, recorded_at desc);
create index if not exists idx_entries_client_date
  on public.parameter_entries (client_id, recorded_at desc);

-- ---------- Помощни функции ----------
create or replace function public.current_role_is(r text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = r
  )
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_role_is('admin')
$$;

create or replace function public.is_ancestor_of(ancestor uuid, target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive chain as (
    select id, created_by
    from public.profiles
    where id = target

    union

    select p.id, p.created_by
    from public.profiles p
    join chain c on p.id = c.created_by
  )
  select exists (select 1 from chain where id = ancestor)
$$;

create or replace function public.is_staff_ancestor_of(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_role_is('trainer')
    and public.is_ancestor_of(auth.uid(), target)
$$;

revoke all on function public.current_role_is(text) from public;
revoke all on function public.is_admin() from public;
revoke all on function public.is_ancestor_of(uuid, uuid) from public;
revoke all on function public.is_staff_ancestor_of(uuid) from public;
grant execute on function public.current_role_is(text) to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_ancestor_of(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_staff_ancestor_of(uuid) to authenticated, service_role;

-- Защита от цикъл в йерархията на профилите.
create or replace function public.prevent_profile_hierarchy_cycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.created_by is not null
     and (new.created_by = new.id or public.is_ancestor_of(new.id, new.created_by)) then
    raise exception 'Profile hierarchy cannot contain a cycle';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_profile_hierarchy_cycle() from public;
grant execute on function public.prevent_profile_hierarchy_cycle() to authenticated, service_role;

drop trigger if exists prevent_profile_hierarchy_cycle_trigger on public.profiles;
create trigger prevent_profile_hierarchy_cycle_trigger
before insert or update of created_by on public.profiles
for each row execute function public.prevent_profile_hierarchy_cycle();

-- Треньорите могат да редактират клиентски данни, но не и да подменят
-- owner_id/user_id или да посочат снимка от чужда папка.
create or replace function public.protect_client_relationships()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role'
     and not public.is_admin()
     and (
       new.owner_id is distinct from old.owner_id
       or new.user_id is distinct from old.user_id
     ) then
    raise exception 'Client ownership and account links can only be changed by an administrator';
  end if;

  if new.photo_path is distinct from old.photo_path
     and new.photo_path is not null
     and split_part(new.photo_path, '/', 1) <> new.id::text then
    raise exception 'Invalid client photo path';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_client_relationships() from public;
grant execute on function public.protect_client_relationships() to authenticated, service_role;

drop trigger if exists protect_client_relationships_trigger on public.clients;
create trigger protect_client_relationships_trigger
before update on public.clients
for each row execute function public.protect_client_relationships();

-- Свързаният клиентски запис е източникът на клиентската информация за акаунта.
create or replace function public.sync_linked_client_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.user_id is not null then
    update public.profiles
    set full_name = new.full_name,
        email = coalesce(new.email, email)
    where id = new.user_id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_linked_client_profile() from public;
grant execute on function public.sync_linked_client_profile() to authenticated, service_role;

drop trigger if exists sync_linked_client_profile_trigger on public.clients;
create trigger sync_linked_client_profile_trigger
after insert or update of full_name, email, user_id on public.clients
for each row execute function public.sync_linked_client_profile();

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.parameters enable row level security;
alter table public.parameter_entries enable row level security;

-- Profiles
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select
  using (
    id = auth.uid()
    or public.is_admin()
    or public.is_staff_ancestor_of(id)
  );

drop policy if exists "profiles_update" on public.profiles;
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update
  using (public.is_admin())
  with check (public.is_admin());

-- Няма insert/delete policy за profiles — използва се Edge Function.

-- Clients
drop policy if exists "clients_select" on public.clients;
create policy "clients_select" on public.clients
  for select
  using (
    public.is_admin()
    or owner_id = auth.uid()
    or public.is_staff_ancestor_of(owner_id)
    or user_id = auth.uid()
  );

drop policy if exists "clients_insert" on public.clients;
drop policy if exists "clients_delete" on public.clients;

drop policy if exists "clients_update" on public.clients;
create policy "clients_update" on public.clients
  for update
  using (
    public.is_admin()
    or owner_id = auth.uid()
    or public.is_staff_ancestor_of(owner_id)
  )
  with check (
    public.is_admin()
    or owner_id = auth.uid()
    or public.is_staff_ancestor_of(owner_id)
  );

-- Parameters
drop policy if exists "parameters_select" on public.parameters;
create policy "parameters_select" on public.parameters
  for select using (auth.uid() is not null);

drop policy if exists "parameters_insert" on public.parameters;
create policy "parameters_insert" on public.parameters
  for insert with check (public.is_admin());

drop policy if exists "parameters_update" on public.parameters;
create policy "parameters_update" on public.parameters
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "parameters_delete" on public.parameters;
create policy "parameters_delete" on public.parameters
  for delete using (public.is_admin());

-- Entries
drop policy if exists "entries_select" on public.parameter_entries;
create policy "entries_select" on public.parameter_entries
  for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.clients c
      where c.id = parameter_entries.client_id
        and (c.owner_id = auth.uid() or public.is_staff_ancestor_of(c.owner_id))
    )
    or exists (
      select 1 from public.clients c
      where c.id = parameter_entries.client_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "entries_insert" on public.parameter_entries;
create policy "entries_insert" on public.parameter_entries
  for insert
  with check (
    public.is_admin()
    or exists (
      select 1 from public.clients c
      where c.id = parameter_entries.client_id
        and (c.owner_id = auth.uid() or public.is_staff_ancestor_of(c.owner_id))
    )
    or exists (
      select 1
      from public.clients c
      join public.parameters p on p.id = parameter_entries.parameter_id
      where c.id = parameter_entries.client_id
        and c.user_id = auth.uid()
        and p.category = 'body'
    )
  );

drop policy if exists "entries_update" on public.parameter_entries;
create policy "entries_update" on public.parameter_entries
  for update
  using (
    public.is_admin()
    or exists (
      select 1 from public.clients c
      where c.id = parameter_entries.client_id
        and (c.owner_id = auth.uid() or public.is_staff_ancestor_of(c.owner_id))
    )
    or exists (
      select 1
      from public.clients c
      join public.parameters p on p.id = parameter_entries.parameter_id
      where c.id = parameter_entries.client_id
        and c.user_id = auth.uid()
        and p.category = 'body'
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.clients c
      where c.id = parameter_entries.client_id
        and (c.owner_id = auth.uid() or public.is_staff_ancestor_of(c.owner_id))
    )
    or exists (
      select 1
      from public.clients c
      join public.parameters p on p.id = parameter_entries.parameter_id
      where c.id = parameter_entries.client_id
        and c.user_id = auth.uid()
        and p.category = 'body'
    )
  );

drop policy if exists "entries_delete" on public.parameter_entries;
create policy "entries_delete" on public.parameter_entries
  for delete
  using (
    public.is_admin()
    or exists (
      select 1 from public.clients c
      where c.id = parameter_entries.client_id
        and (c.owner_id = auth.uid() or public.is_staff_ancestor_of(c.owner_id))
    )
    or exists (
      select 1
      from public.clients c
      join public.parameters p on p.id = parameter_entries.parameter_id
      where c.id = parameter_entries.client_id
        and c.user_id = auth.uid()
        and p.category = 'body'
    )
  );

-- ---------- Private Storage за снимки ----------
insert into storage.buckets (id, name, public)
values ('client-photos', 'client-photos', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "public_read_photos" on storage.objects;
drop policy if exists "auth_read_photos" on storage.objects;
create policy "auth_read_photos" on storage.objects
  for select
  using (
    bucket_id = 'client-photos'
    and auth.role() = 'authenticated'
    and exists (
      select 1
      from public.clients c
      where (c.photo_path = name or c.id::text = (storage.foldername(name))[1])
        and (
          public.is_admin()
          or c.owner_id = auth.uid()
          or public.is_staff_ancestor_of(c.owner_id)
          or c.user_id = auth.uid()
        )
    )
  );

drop policy if exists "public_upload_photos" on storage.objects;
drop policy if exists "staff_upload_photos" on storage.objects;
create policy "staff_upload_photos" on storage.objects
  for insert
  with check (
    bucket_id = 'client-photos'
    and (public.is_admin() or public.current_role_is('trainer'))
    and exists (
      select 1
      from public.clients c
      where c.id::text = (storage.foldername(name))[1]
        and (
          public.is_admin()
          or c.owner_id = auth.uid()
          or public.is_staff_ancestor_of(c.owner_id)
        )
    )
  );

drop policy if exists "staff_update_photos" on storage.objects;
create policy "staff_update_photos" on storage.objects
  for update
  using (
    bucket_id = 'client-photos'
    and (public.is_admin() or public.current_role_is('trainer'))
    and exists (
      select 1
      from public.clients c
      where (c.photo_path = name or c.id::text = (storage.foldername(name))[1])
        and (
          public.is_admin()
          or c.owner_id = auth.uid()
          or public.is_staff_ancestor_of(c.owner_id)
        )
    )
  )
  with check (
    bucket_id = 'client-photos'
    and (public.is_admin() or public.current_role_is('trainer'))
    and exists (
      select 1
      from public.clients c
      where c.id::text = (storage.foldername(name))[1]
        and (
          public.is_admin()
          or c.owner_id = auth.uid()
          or public.is_staff_ancestor_of(c.owner_id)
        )
    )
  );

drop policy if exists "public_delete_photos" on storage.objects;
drop policy if exists "staff_delete_photos" on storage.objects;
create policy "staff_delete_photos" on storage.objects
  for delete
  using (
    bucket_id = 'client-photos'
    and (public.is_admin() or public.current_role_is('trainer'))
    and exists (
      select 1
      from public.clients c
      where (c.photo_path = name or c.id::text = (storage.foldername(name))[1])
        and (
          public.is_admin()
          or c.owner_id = auth.uid()
          or public.is_staff_ancestor_of(c.owner_id)
        )
    )
  );

commit;
