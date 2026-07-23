-- ============================================================
-- МИГРАЦИЯ 9: защита на ролите, интегритет на акаунтите,
-- частни снимки и индекси
-- Изпълни след migration_8.sql в Supabase SQL Editor.
-- Не изтрива клиенти, история или снимки.
-- След нея качи отново Edge Function manage-account.
-- ============================================================

begin;

-- 1) Пътят до снимката се пази отделно. Съществуващите публични URL адреси
-- се преобразуват до storage path, за да могат да се използват подписани URL-и.
alter table public.clients add column if not exists photo_path text;

update public.clients
set photo_path = regexp_replace(photo_url, '^.*/client-photos/', '')
where photo_path is null
  and photo_url is not null
  and photo_url like '%/client-photos/%';

update public.clients
set photo_url = null
where photo_path is not null;

-- 2) Bucket-ът вече не е публичен. Приложението създава краткотрайни
-- подписани URL адреси само за потребители с достъп до съответния клиент.
insert into storage.buckets (id, name, public)
values ('client-photos', 'client-photos', false)
on conflict (id) do update set public = excluded.public;

-- 3) Критична корекция: обикновен потребител не трябва да може да обновява
-- собствения си ред в profiles, защото колоната role е в същата таблица.
-- Управлението на роли остава през Edge Function; администраторът запазва
-- възможността да редактира йерархията.
drop policy if exists "profiles_update" on public.profiles;
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update
  using (public.is_admin())
  with check (public.is_admin());

-- 4) Създаване и изтриване на клиенти вече се извършват само през
-- manage-account (service role). Това пази auth.users, profiles и clients
-- синхронизирани и не допуска осиротели акаунти.
drop policy if exists "clients_insert" on public.clients;
drop policy if exists "clients_delete" on public.clients;

-- 5) Security-definer функциите използват фиксиран search_path. Рекурсивната
-- заявка използва UNION, за да спира безопасно дори при повреден цикъл.
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

revoke all on function public.current_role_is(text) from public;
revoke all on function public.is_admin() from public;
revoke all on function public.is_ancestor_of(uuid, uuid) from public;
grant execute on function public.current_role_is(text) to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_ancestor_of(uuid, uuid) to authenticated, service_role;

-- 6) Политиките за йерархичен достъп изискват текущият потребител действително
-- да е треньор. Така профил, сменен от trainer към client, не запазва достъп
-- само защото в повредени/стари данни все още има наследници.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select
  using (
    id = auth.uid()
    or public.is_admin()
    or (
      public.current_role_is('trainer')
      and public.is_ancestor_of(auth.uid(), id)
    )
  );

drop policy if exists "clients_select" on public.clients;
create policy "clients_select" on public.clients
  for select
  using (
    public.is_admin()
    or owner_id = auth.uid()
    or (
      public.current_role_is('trainer')
      and public.is_ancestor_of(auth.uid(), owner_id)
    )
    or user_id = auth.uid()
  );

drop policy if exists "clients_update" on public.clients;
create policy "clients_update" on public.clients
  for update
  using (
    public.is_admin()
    or owner_id = auth.uid()
    or (
      public.current_role_is('trainer')
      and public.is_ancestor_of(auth.uid(), owner_id)
    )
  )
  with check (
    public.is_admin()
    or owner_id = auth.uid()
    or (
      public.current_role_is('trainer')
      and public.is_ancestor_of(auth.uid(), owner_id)
    )
  );

drop policy if exists "entries_select" on public.parameter_entries;
create policy "entries_select" on public.parameter_entries
  for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.clients c
      where c.id = parameter_entries.client_id
        and (
          c.owner_id = auth.uid()
          or (
            public.current_role_is('trainer')
            and public.is_ancestor_of(auth.uid(), c.owner_id)
          )
        )
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
        and (
          c.owner_id = auth.uid()
          or (
            public.current_role_is('trainer')
            and public.is_ancestor_of(auth.uid(), c.owner_id)
          )
        )
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
        and (
          c.owner_id = auth.uid()
          or (
            public.current_role_is('trainer')
            and public.is_ancestor_of(auth.uid(), c.owner_id)
          )
        )
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
        and (
          c.owner_id = auth.uid()
          or (
            public.current_role_is('trainer')
            and public.is_ancestor_of(auth.uid(), c.owner_id)
          )
        )
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
        and (
          c.owner_id = auth.uid()
          or (
            public.current_role_is('trainer')
            and public.is_ancestor_of(auth.uid(), c.owner_id)
          )
        )
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

-- 6) Тригер за защитените връзки. Треньор може да редактира данните на свой
-- клиент, но не може през ръчна API заявка да подмени owner_id/user_id или
-- да свърже чужда снимка. Администраторът и service role могат да управляват
-- йерархията и акаунтите.
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

-- 7) Индекси за най-честите RLS и списъчни заявки.
create index if not exists idx_clients_owner_id on public.clients (owner_id);
create index if not exists idx_clients_user_id on public.clients (user_id);
create index if not exists idx_profiles_created_by on public.profiles (created_by);
create index if not exists idx_parameters_category_order on public.parameters (category, sort_order);
create index if not exists idx_entries_client_date on public.parameter_entries (client_id, recorded_at desc);

-- 8) Storage политиките са обвързани с конкретния client id/path, а не само
-- с факта, че потребителят е влязъл. Така клиент не може да изброява или
-- отваря снимки на други клиенти.
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
      where (
          c.photo_path = name
          or c.id::text = (storage.foldername(name))[1]
        )
        and (
          public.is_admin()
          or c.owner_id = auth.uid()
          or (
            public.current_role_is('trainer')
            and public.is_ancestor_of(auth.uid(), c.owner_id)
          )
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
          or public.is_ancestor_of(auth.uid(), c.owner_id)
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
          or public.is_ancestor_of(auth.uid(), c.owner_id)
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
          or public.is_ancestor_of(auth.uid(), c.owner_id)
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
          or public.is_ancestor_of(auth.uid(), c.owner_id)
        )
    )
  );

commit;
