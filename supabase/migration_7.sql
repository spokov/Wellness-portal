-- ============================================================
-- МИГРАЦИЯ 7: по една стойност на параметър/клиент/ден
-- Пусни това в Supabase -> SQL Editor -> New query -> Run
-- ============================================================

-- Ако случайно има повече от един запис за същия клиент+параметър+дата,
-- пази само един от тях (иначе следващата стъпка ще откаже).
with ranked as (
  select id, row_number() over (
    partition by client_id, parameter_id, recorded_at
    order by id
  ) as rn
  from parameter_entries
)
delete from parameter_entries
where id in (select id from ranked where rn > 1);

create unique index if not exists parameter_entries_unique_per_day
  on parameter_entries (client_id, parameter_id, recorded_at);
