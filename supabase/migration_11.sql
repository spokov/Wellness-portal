-- ============================================================
-- WELLNESS PORTAL — MIGRATION 11
-- Поправка на дублирани клиентски записи и надеждна смяна на роли.
-- Изпълни след migration_10.sql.
-- ============================================================

begin;

-- Обединява два клиентски записа без загуба на история.
-- p_target_client_id остава, p_source_client_id се премахва след прехвърляне.
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

-- Почиства съществуващите данни за всички trainer/client акаунти.
do $$
declare
  account_id uuid;
begin
  for account_id in
    select id
    from public.profiles
    where role in ('trainer', 'client')
    order by created_at, id
  loop
    perform public.ensure_single_client_for_account(account_id);
  end loop;
end;
$$;

-- При по-стари бази колоната може да е била добавена с IF NOT EXISTS,
-- без реално да се създаде UNIQUE ограничението. Този индекс го гарантира.
create unique index if not exists clients_user_id_unique
  on public.clients (user_id)
  where user_id is not null;

commit;
