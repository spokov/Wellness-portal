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


-- ---------- Обединяване на клиентски записи и смяна на роли ----------
create or replace function public.merge_client_records(
  p_target_client_id uuid,
  p_source_client_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  source_row public.clients%rowtype;
begin
  if p_target_client_id is null
     or p_source_client_id is null
     or p_target_client_id = p_source_client_id then
    return;
  end if;

  select *
  into source_row
  from public.clients
  where id = p_source_client_id
  for update;

  if not found then
    return;
  end if;

  perform 1
  from public.clients
  where id = p_target_client_id
  for update;

  if not found then
    raise exception 'Target client % does not exist', p_target_client_id;
  end if;

  update public.clients as target
  set
    full_name = case
      when nullif(trim(target.full_name), '') is null then source_row.full_name
      else target.full_name
    end,
    address = coalesce(nullif(trim(target.address), ''), source_row.address),
    phone = coalesce(nullif(trim(target.phone), ''), source_row.phone),
    email = case
      when nullif(trim(target.email), '') is null
        or lower(target.email) like '%@clientdb.local'
      then coalesce(nullif(trim(source_row.email), ''), target.email)
      else target.email
    end,
    photo_url = coalesce(nullif(trim(target.photo_url), ''), source_row.photo_url),
    photo_path = coalesce(nullif(trim(target.photo_path), ''), source_row.photo_path),
    birth_date = coalesce(target.birth_date, source_row.birth_date),
    gender = coalesce(target.gender, source_row.gender),
    height_cm = coalesce(target.height_cm, source_row.height_cm),
    notes = coalesce(nullif(trim(target.notes), ''), source_row.notes)
  where target.id = p_target_client_id;

  insert into public.parameter_entries (client_id, parameter_id, value, recorded_at)
  select p_target_client_id, parameter_id, value, recorded_at
  from public.parameter_entries
  where client_id = p_source_client_id
  on conflict (client_id, parameter_id, recorded_at)
  do update set value = case
    when public.parameter_entries.value is null
      or trim(public.parameter_entries.value) = ''
    then excluded.value
    else public.parameter_entries.value
  end;

  delete from public.parameter_entries
  where client_id = p_source_client_id;

  delete from public.clients
  where id = p_source_client_id;
end;
$$;

-- Гарантира точно един client запис за trainer/client акаунт.
-- Функцията се използва и от Edge Function-а преди смяна на роля.
create or replace function public.ensure_single_client_for_account(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  account_row public.profiles%rowtype;
  canonical_id uuid;
  duplicate_id uuid;
  shadow_id uuid;
  shadow_count integer := 0;
  canonical_is_minimal boolean := false;
begin
  select *
  into account_row
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'Account % does not exist', p_user_id;
  end if;

  if account_row.role not in ('trainer', 'client') then
    return null;
  end if;

  -- Избира най-пълния запис, като предпочита този с повече измервания.
  select scored.id
  into canonical_id
  from (
    select
      c.id,
      c.created_at,
      count(pe.id) as entry_count,
      (
        (case when nullif(trim(c.phone), '') is not null then 1 else 0 end) +
        (case when nullif(trim(c.address), '') is not null then 1 else 0 end) +
        (case when c.birth_date is not null then 1 else 0 end) +
        (case when c.height_cm is not null then 1 else 0 end) +
        (case when nullif(trim(c.notes), '') is not null then 1 else 0 end) +
        (case when nullif(trim(c.photo_path), '') is not null then 1 else 0 end) +
        (case when nullif(trim(c.photo_url), '') is not null then 1 else 0 end)
      ) as completeness
    from public.clients c
    left join public.parameter_entries pe on pe.client_id = c.id
    where c.user_id = p_user_id
    group by c.id, c.created_at
  ) as scored
  order by scored.entry_count desc, scored.completeness desc, scored.created_at asc, scored.id
  limit 1;

  if canonical_id is null then
    insert into public.clients (full_name, email, owner_id, user_id)
    values (
      coalesce(nullif(trim(account_row.full_name), ''), account_row.username, 'Потребител'),
      account_row.email,
      account_row.created_by,
      account_row.id
    )
    returning id into canonical_id;
  end if;

  -- Обединява всички неправомерно дублирани записи със същия user_id.
  for duplicate_id in
    select id
    from public.clients
    where user_id = p_user_id
      and id <> canonical_id
    order by created_at, id
  loop
    perform public.merge_client_records(canonical_id, duplicate_id);
  end loop;

  -- migration_10 може да е създала нов минимален linked запис, докато старият
  -- несвързан клиентски запис е останал със същото име и собственик.
  -- Обединяваме го само при еднозначно и безопасно съвпадение.
  select
    not exists (
      select 1 from public.parameter_entries pe where pe.client_id = c.id
    )
    and nullif(trim(c.phone), '') is null
    and nullif(trim(c.address), '') is null
    and c.birth_date is null
    and c.height_cm is null
    and nullif(trim(c.notes), '') is null
    and nullif(trim(c.photo_path), '') is null
    and nullif(trim(c.photo_url), '') is null
  into canonical_is_minimal
  from public.clients c
  where c.id = canonical_id;

  if canonical_is_minimal then
    select count(*), (array_agg(candidate.id order by candidate.created_at, candidate.id))[1]
    into shadow_count, shadow_id
    from public.clients candidate
    join public.clients canonical on canonical.id = canonical_id
    where candidate.user_id is null
      and candidate.id <> canonical.id
      and candidate.owner_id is not distinct from canonical.owner_id
      and lower(trim(candidate.full_name)) = lower(trim(canonical.full_name))
      and candidate.created_at <= canonical.created_at;

    if shadow_count = 1 and shadow_id is not null then
      perform public.merge_client_records(canonical_id, shadow_id);
    end if;
  end if;

  update public.clients
  set
    full_name = coalesce(nullif(trim(account_row.full_name), ''), full_name),
    owner_id = coalesce(account_row.created_by, owner_id),
    user_id = p_user_id
  where id = canonical_id;

  return canonical_id;
end;
$$;

-- Извършва смяната на роля атомарно: йерархията, собствеността и
-- свързаният клиентски запис се обновяват в една транзакция.
create or replace function public.change_account_role(
  p_target_user_id uuid,
  p_new_role text,
  p_fallback_owner_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_row public.profiles%rowtype;
  new_owner_id uuid;
  linked_client_id uuid;
begin
  if p_new_role not in ('trainer', 'client') then
    raise exception 'Can only switch between trainer and client';
  end if;

  select *
  into target_row
  from public.profiles
  where id = p_target_user_id
  for update;

  if not found then
    raise exception 'Account % does not exist', p_target_user_id;
  end if;

  if target_row.role = 'admin' then
    raise exception 'Cannot change an administrator role';
  end if;

  new_owner_id := coalesce(target_row.created_by, p_fallback_owner_id);
  if new_owner_id is null then
    raise exception 'The account does not have a valid parent';
  end if;

  linked_client_id := public.ensure_single_client_for_account(p_target_user_id);
  if linked_client_id is null then
    raise exception 'The account does not have a linked client record';
  end if;

  if target_row.role <> p_new_role and p_new_role = 'client' then
    update public.clients
    set owner_id = new_owner_id
    where owner_id = p_target_user_id
      and id <> linked_client_id;

    update public.profiles
    set created_by = new_owner_id
    where created_by = p_target_user_id;
  end if;

  update public.clients
  set
    full_name = coalesce(nullif(trim(target_row.full_name), ''), target_row.username, full_name),
    owner_id = new_owner_id,
    user_id = p_target_user_id
  where id = linked_client_id;

  update public.profiles
  set role = p_new_role
  where id = p_target_user_id;

  return linked_client_id;
end;
$$;

revoke all on function public.merge_client_records(uuid, uuid) from public;
revoke all on function public.ensure_single_client_for_account(uuid) from public;
revoke all on function public.change_account_role(uuid, text, uuid) from public;
grant execute on function public.merge_client_records(uuid, uuid) to service_role;
grant execute on function public.ensure_single_client_for_account(uuid) to service_role;
grant execute on function public.change_account_role(uuid, text, uuid) to service_role;

commit;
