-- ============================================================
-- МИГРАЦИЯ 4: вход с потребители + 3 роли (админ / треньор / клиент)
-- Пусни това в Supabase -> SQL Editor -> New query -> Run
-- ============================================================

-- ---------- 1. Профили (свързани към Supabase Auth) ----------
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null check (role in ('admin', 'trainer', 'client')),
  full_name   text,
  email       text,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------- 2. Клиентски записи: чий са и дали имат собствен вход ----------
-- owner_id -> треньорът (или админ), който е създал/управлява записа
-- user_id  -> ако този клиент има собствен вход, тук е неговият profiles.id
alter table clients add column if not exists owner_id uuid references profiles(id);
alter table clients add column if not exists user_id  uuid unique references profiles(id);

-- ---------- 3. Помощни функции за проверка на роля и йерархия ----------
create or replace function current_role_is(r text)
returns boolean language sql stable security definer as $$
  select exists (select 1 from profiles where id = auth.uid() and role = r)
$$;

create or replace function is_admin()
returns boolean language sql stable security definer as $$
  select current_role_is('admin')
$$;

-- Вярно, ако "ancestor" е създал "target" - директно или през верига от треньори
create or replace function is_ancestor_of(ancestor uuid, target uuid)
returns boolean language sql stable security definer as $$
  with recursive chain as (
    select id, created_by from profiles where id = target
    union all
    select p.id, p.created_by from profiles p join chain c on p.id = c.created_by
  )
  select exists (select 1 from chain where id = ancestor)
$$;

-- ---------- 4. RLS: profiles ----------
alter table profiles enable row level security;

drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles for select
  using (id = auth.uid() or is_admin() or is_ancestor_of(auth.uid(), id));

drop policy if exists "profiles_update" on profiles;
create policy "profiles_update" on profiles for update
  using (id = auth.uid() or is_admin() or is_ancestor_of(auth.uid(), id));

-- Създаването/изтриването на профили става само през сървърната функция
-- (manage-account), с service role ключ - затова тук няма insert/delete policy
-- за обикновени потребители.

-- ---------- 5. RLS: clients ----------
alter table clients enable row level security;
drop policy if exists "public_all_clients" on clients;

drop policy if exists "clients_select" on clients;
create policy "clients_select" on clients for select
  using (
    is_admin()
    or owner_id = auth.uid()
    or is_ancestor_of(auth.uid(), owner_id)
    or user_id = auth.uid()
  );

drop policy if exists "clients_insert" on clients;
create policy "clients_insert" on clients for insert
  with check (
    (is_admin() or current_role_is('trainer'))
    and (owner_id = auth.uid() or is_admin())
  );

drop policy if exists "clients_update" on clients;
create policy "clients_update" on clients for update
  using (is_admin() or owner_id = auth.uid() or is_ancestor_of(auth.uid(), owner_id));

drop policy if exists "clients_delete" on clients;
create policy "clients_delete" on clients for delete
  using (is_admin() or owner_id = auth.uid() or is_ancestor_of(auth.uid(), owner_id));

-- ---------- 6. RLS: parameters (обща таксономия - само админ управлява) ----------
alter table parameters enable row level security;
drop policy if exists "public_all_parameters" on parameters;

drop policy if exists "parameters_select" on parameters;
create policy "parameters_select" on parameters for select using (auth.uid() is not null);

drop policy if exists "parameters_insert" on parameters;
create policy "parameters_insert" on parameters for insert with check (is_admin());

drop policy if exists "parameters_update" on parameters;
create policy "parameters_update" on parameters for update using (is_admin());

drop policy if exists "parameters_delete" on parameters;
create policy "parameters_delete" on parameters for delete using (is_admin());

-- ---------- 7. RLS: parameter_entries ----------
alter table parameter_entries enable row level security;
drop policy if exists "public_all_entries" on parameter_entries;

drop policy if exists "entries_select" on parameter_entries;
create policy "entries_select" on parameter_entries for select
  using (
    is_admin()
    or exists (
      select 1 from clients c where c.id = parameter_entries.client_id
        and (c.owner_id = auth.uid() or is_ancestor_of(auth.uid(), c.owner_id))
    )
    or exists (
      select 1 from clients c where c.id = parameter_entries.client_id and c.user_id = auth.uid()
    )
  );

-- Треньор/админ: пълен достъп до записите на своите клиенти.
-- Клиент: може да пише само по параметри от групата "body" (мерки на тялото),
-- и само за собствения си запис (client.user_id = auth.uid()).
drop policy if exists "entries_insert" on parameter_entries;
create policy "entries_insert" on parameter_entries for insert
  with check (
    is_admin()
    or exists (
      select 1 from clients c where c.id = parameter_entries.client_id
        and (c.owner_id = auth.uid() or is_ancestor_of(auth.uid(), c.owner_id))
    )
    or exists (
      select 1 from clients c
      join parameters p on p.id = parameter_entries.parameter_id
      where c.id = parameter_entries.client_id and c.user_id = auth.uid() and p.category = 'body'
    )
  );

drop policy if exists "entries_update" on parameter_entries;
create policy "entries_update" on parameter_entries for update
  using (
    is_admin()
    or exists (
      select 1 from clients c where c.id = parameter_entries.client_id
        and (c.owner_id = auth.uid() or is_ancestor_of(auth.uid(), c.owner_id))
    )
    or exists (
      select 1 from clients c
      join parameters p on p.id = parameter_entries.parameter_id
      where c.id = parameter_entries.client_id and c.user_id = auth.uid() and p.category = 'body'
    )
  );

drop policy if exists "entries_delete" on parameter_entries;
create policy "entries_delete" on parameter_entries for delete
  using (
    is_admin()
    or exists (
      select 1 from clients c where c.id = parameter_entries.client_id
        and (c.owner_id = auth.uid() or is_ancestor_of(auth.uid(), c.owner_id))
    )
    or exists (
      select 1 from clients c
      join parameters p on p.id = parameter_entries.parameter_id
      where c.id = parameter_entries.client_id and c.user_id = auth.uid() and p.category = 'body'
    )
  );

-- ---------- 8. Storage (снимки) - вече изисква вход ----------
drop policy if exists "public_read_photos" on storage.objects;
drop policy if exists "auth_read_photos" on storage.objects;
create policy "auth_read_photos" on storage.objects for select
  using (bucket_id = 'client-photos' and auth.role() = 'authenticated');

drop policy if exists "public_upload_photos" on storage.objects;
drop policy if exists "staff_upload_photos" on storage.objects;
create policy "staff_upload_photos" on storage.objects for insert
  with check (bucket_id = 'client-photos' and (is_admin() or current_role_is('trainer')));

drop policy if exists "public_delete_photos" on storage.objects;
drop policy if exists "staff_delete_photos" on storage.objects;
create policy "staff_delete_photos" on storage.objects for delete
  using (bucket_id = 'client-photos' and (is_admin() or current_role_is('trainer')));

-- ============================================================
-- 9. СЪЗДАВАНЕ НА ПЪРВИЯ АДМИН (еднократно, ръчно)
-- ============================================================
-- Виж README.md ("Създай първия администраторски акаунт") за пълните
-- стъпки - след migration_5.sql акаунтите вход с потребителско име, не с
-- реален имейл.
