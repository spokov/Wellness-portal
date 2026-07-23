# Wellness Portal 2.0

Уеб портал за управление на клиенти, треньори, Tanita измервания и мерки на
тялото. Приложението използва React/Vite за интерфейса и Supabase за вход,
PostgreSQL база, Row Level Security, Storage и защитена Edge Function.

## Основни възможности

- роли **администратор**, **треньор** и **клиент**;
- йерархия от треньори и под-треньори;
- клиентски профили, контакти, височина, бележки и частни снимки;
- Tanita измервания и мерки на тялото с история по дати;
- редактиране, изтриване, CSV импорт/експорт и принтиране;
- референтно оцветяване за процента мазнини по пол и възраст;
- интерфейс на български и английски;
- адаптивна работа на телефон, таблет и компютър.

## Какво е подобрено във версия 2.0

- затворен е критичен RLS път, чрез който потребител можеше да промени
  собствената си роля;
- създаването и изтриването на клиентски акаунти се извършва само през
  `manage-account`, за да не остават несвързани записи;
- снимките са в **private** bucket и се показват чрез краткотрайни signed URL-и;
- Storage политиките проверяват достъпа до конкретния клиент;
- добавена е защита срещу цикли в йерархията и подмяна на `owner_id`/`user_id`;
- подобрени са валидирането, обработката на грешки и управлението на сесията;
- CSV импортът разпознава запетая/точка и разделител запетая/точка и запетая;
- CSV експортът не допуска формулна инжекция при отваряне в Excel;
- добавени са търсене, сортиране, статистика и обновяване на списъка с клиенти;
- модалните прозорци поддържат Escape, backdrop close и блокиране на фоновия scroll;
- подобрени са достъпността, мобилната навигация и печатните изгледи;
- възрастта се изчислява точно спрямо рождения ден, а не приблизително по дни.

## Технологии

- React 18
- React Router 6
- Vite 5
- Tailwind CSS 3
- Supabase Auth, Postgres, Storage и Edge Functions

---

# Инсталация в нов Supabase проект

## 1. Създай базата

В Supabase отвори **SQL Editor → New query** и изпълни целия файл:

```text
supabase/schema_current.sql
```

За нов проект това е единственият SQL файл, който трябва да изпълниш. Не
изпълнявай старите `migration_2.sql`–`migration_9.sql` след него.

## 2. Създай първия администратор

1. Supabase Dashboard → **Authentication → Users → Add user**.
2. Създай потребител с технически имейл, например:
   `admin@clientdb.local`.
3. Включи **Auto Confirm User** и копирай User UID.
4. В SQL Editor изпълни:

```sql
insert into public.profiles (id, role, full_name, username, email)
values (
  'ПОСТАВИ-USER-UID-ТУК',
  'admin',
  'Име на администратора',
  'admin',
  'admin@clientdb.local'
);
```

След това входът в сайта е с потребителско име `admin` и зададената парола.

## 3. Качи Edge Function

Инсталирай Supabase CLI и свържи проекта:

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase functions deploy manage-account --no-verify-jwt
```

Supabase предоставя автоматично `SUPABASE_URL`, `SUPABASE_ANON_KEY` и
`SUPABASE_SERVICE_ROLE_KEY` на функцията. Не поставяй service role ключ във
frontend `.env` файла.

По желание можеш да ограничиш CORS до един домейн:

```bash
supabase secrets set ALLOWED_ORIGIN=https://your-domain.example
supabase functions deploy manage-account --no-verify-jwt
```

## 4. Настрой frontend средата

Копирай `.env.example` като `.env` и попълни публичните настройки от
**Project Settings → API**:

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
```

## 5. Стартирай локално

```bash
npm install
npm run dev
```

Production проверка:

```bash
npm run build
npm run preview
```

---

# Обновяване на съществуваща инсталация

## Проект, който вече е стигнал до `migration_8.sql`

1. Направи backup на базата.
2. Изпълни в SQL Editor:

```text
supabase/migration_9.sql
```

3. Качи отново функцията:

```bash
supabase functions deploy manage-account --no-verify-jwt
```

4. Деплойни новия frontend код.
5. Провери входа с администратор, треньор и клиент.

`migration_9.sql` не трие клиенти, измервания или снимки. Той добавя
`photo_path`, прави bucket-а private, мигрира съществуващите photo URL адреси,
затваря опасните RLS политики и добавя индекси/защитни тригери.

## По-стара база

Първо изпълни само липсващите миграции в числов ред до `migration_8.sql`, след
това `migration_9.sql`, и накрая deploy на `manage-account`.

**Важно:** `supabase/schema.sql` е запазен само като историческа начална схема
за стари инсталации. За нов проект използвай `supabase/schema_current.sql`.

---

# Деплой на frontend

## Netlify

- Build command: `npm run build`
- Publish directory: `dist`
- Добави `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` като environment variables.

`netlify.toml` вече съдържа SPA redirect към `index.html`.

## Vercel

Импортирай repository-то като Vite проект и добави същите две environment
variables. `vercel.json` съдържа необходимия SPA rewrite.

---

# Сигурност и експлоатация

- Никога не поставяй `SUPABASE_SERVICE_ROLE_KEY` във frontend кода или хостинг
  environment variables с префикс `VITE_`.
- Използвай пароли с поне 8 символа; за реална продукционна среда е разумно да
  приложиш още по-строга политика в Supabase Auth.
- Преди всяка SQL миграция направи backup.
- След промяна на `supabase/functions/manage-account/index.ts` винаги изпълнявай
  нов `supabase functions deploy manage-account --no-verify-jwt`.
- Снимките са ограничени до JPG, PNG или WebP и максимум 5 MB.
- CSV импортът е ограничен до 2 MB и отхвърля невалидни/бъдещи дати.

# Полезни файлове

```text
src/                                  React приложението
src/lib/auth.jsx                      сесия и потребителски профил
src/lib/clientPhoto.jsx               private Storage и signed URL-и
src/lib/csv.js                        безопасен CSV импорт/експорт
supabase/schema_current.sql           пълна схема за нов проект
supabase/migration_9.sql              обновяване на съществуващ проект
supabase/functions/manage-account/    защитено управление на акаунти
TECHNICAL_REPORT_BG.md                 технически анализ на версия 2.0
```

## Обновяване до версия 2.2

След `migration_9.sql` изпълнете `supabase/migration_10.sql`, след което публикувайте отново Edge Function-а:

```bash
supabase functions deploy manage-account --no-verify-jwt
```

Миграцията създава или свързва един клиентски запис за всеки акаунт с роля `trainer` или `client`.
