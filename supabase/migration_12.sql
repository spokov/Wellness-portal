-- Wellness Portal 2.5
-- Двуезични имена на параметрите (български + английски).
-- Изпълнете след migration_11.sql.

begin;

alter table public.parameters
  add column if not exists name_en text;

alter table public.parameters
  alter column name_en set default '';

-- Запазва четимо име и за потребителски параметри, които нямат автоматичен превод.
update public.parameters
set name_en = name
where name_en is null or btrim(name_en) = '';

-- Стандартни Tanita параметри.
update public.parameters
set name_en = case name
  when 'Тегло' then 'Weight'
  when 'BMI (%)' then 'BMI (%)'
  when 'Мазнини (%)' then 'Body fat (%)'
  when 'Вътрешни мазнини' then 'Visceral fat'
  when 'Мускулна маса (кг)' then 'Muscle mass (kg)'
  when 'Индекс на тялото' then 'Physique rating'
  when 'Костна маса (кг)' then 'Bone mass (kg)'
  when 'Базов метаболизъм (ккал)' then 'Basal metabolic rate (kcal)'
  when 'Метаболитна възраст' then 'Metabolic age'
  when 'Вода в тялото (%)' then 'Body water (%)'
  else name_en
end
where category = 'tanita';

-- Стандартни мерки на тялото.
update public.parameters
set name_en = case name
  when 'Обиколка Бюст (см)' then 'Bust circumference (cm)'
  when 'Обиколка Ръка (см)' then 'Arm circumference (cm)'
  when 'Обиколка Талия (см)' then 'Waist circumference (cm)'
  when 'Обиколка Корем (см)' then 'Abdomen circumference (cm)'
  when 'Обиколка Ханш (см)' then 'Hip circumference (cm)'
  when 'Обиколка Бедро (см)' then 'Thigh circumference (cm)'
  when 'Обиколка Коляно (см)' then 'Knee circumference (cm)'
  when 'Тегло (кг)' then 'Weight (kg)'
  else name_en
end
where category = 'body';

alter table public.parameters
  alter column name_en set not null;

commit;
