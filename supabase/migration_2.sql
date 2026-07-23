-- ============================================================
-- МИГРАЦИЯ 2: групи от параметри + дата вместо дата+час
-- Пусни това в Supabase -> SQL Editor -> New query -> Run
-- (безопасно е, не трие съществуващи клиенти или история)
-- ============================================================

-- 1) Записваме само дата, без час, за всяко ново вписване
alter table parameter_entries
  alter column recorded_at type date using recorded_at::date,
  alter column recorded_at set default current_date;

-- 2) Добавяме колона "category", за да разделим 15-те параметъра
--    на 2 групи: първите 10 (по sort_order) -> tanita, последните 5 -> body
alter table parameters add column if not exists category text;

update parameters set category = 'tanita' where sort_order <= 10 and category is null;
update parameters set category = 'body'   where sort_order  > 10 and category is null;

alter table parameters alter column category set not null;

alter table parameters drop constraint if exists parameters_category_check;
alter table parameters add constraint parameters_category_check
  check (category in ('tanita', 'body'));

-- 3) Пренареждаме sort_order да е 1..10 в tanita и 1..5 в body
--    (така всяка група се показва подредена на своята страница)
update parameters p
set sort_order = sub.rn
from (
  select id, row_number() over (partition by category order by sort_order) as rn
  from parameters
) sub
where p.id = sub.id;

-- 4) По желание: ако параметрите все още имат старите генерични имена
--    ("Параметър 1" ... "Параметър 15"), ги заменяме с по-смислени
--    по подразбиране. Ако вече си ги преименувал в Настройки, тази
--    стъпка НЕ ги пипа (WHERE условието пази само още непреименуваните).
update parameters set name = v.new_name
from (values
  ('Параметър 1',  'Тегло (кг)'),
  ('Параметър 2',  'ИТМ (BMI)'),
  ('Параметър 3',  'Телесни мазнини (%)'),
  ('Параметър 4',  'Мускулна маса (%)'),
  ('Параметър 5',  'Костна маса (кг)'),
  ('Параметър 6',  'Вода в тялото (%)'),
  ('Параметър 7',  'Висцерални мазнини'),
  ('Параметър 8',  'Базов метаболизъм (ккал)'),
  ('Параметър 9',  'Метаболитна възраст'),
  ('Параметър 10', 'Физическа оценка'),
  ('Параметър 11', 'Обиколка гърди (см)'),
  ('Параметър 12', 'Обиколка талия (см)'),
  ('Параметър 13', 'Обиколка ханш (см)'),
  ('Параметър 14', 'Обиколка ръка (см)'),
  ('Параметър 15', 'Обиколка бедро (см)')
) as v(old_name, new_name)
where parameters.name = v.old_name;
