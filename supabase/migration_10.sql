-- ============================================================
-- WELLNESS PORTAL — MIGRATION 10
-- Един клиентски профил за всеки trainer/client акаунт.
-- Изпълни след migration_9.sql.
-- ============================================================

begin;

-- Свързва съществуващите несвързани клиентски записи, когато има еднозначно
-- съвпадение по име и собственик. Това запазва вече въведената информация.
with candidates as (
  select
    p.id as user_id,
    c.id as client_id,
    count(*) over (partition by p.id) as matches
  from public.profiles p
  join public.clients c
    on c.user_id is null
   and lower(trim(c.full_name)) = lower(trim(coalesce(p.full_name, p.username)))
   and c.owner_id is not distinct from p.created_by
  where p.role in ('trainer', 'client')
    and not exists (select 1 from public.clients linked where linked.user_id = p.id)
)
update public.clients c
set user_id = candidates.user_id
from candidates
where c.id = candidates.client_id
  and candidates.matches = 1;

-- Създава липсващ клиентски запис за всеки trainer/client акаунт.
insert into public.clients (full_name, email, owner_id, user_id)
select
  coalesce(nullif(trim(p.full_name), ''), p.username, 'Потребител'),
  p.email,
  p.created_by,
  p.id
from public.profiles p
where p.role in ('trainer', 'client')
  and not exists (
    select 1 from public.clients c where c.user_id = p.id
  );

-- Поддържа името и имейла на акаунта синхронизирани с клиентската информация.
-- Синхронизира текущите свързани записи още при миграцията.
update public.profiles p
set full_name = c.full_name,
    email = coalesce(c.email, p.email)
from public.clients c
where c.user_id = p.id
  and p.role in ('trainer', 'client');

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

commit;
