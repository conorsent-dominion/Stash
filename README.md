# Telegram Bookmarks

MVP личной библиотеки ссылок: бот сохраняет URL вместе с заметкой и хэштегами, вытаскивает OpenGraph-заголовок и картинку, а Telegram Mini App показывает коллекцию с живым поиском и фильтрами по тегам.

```
Telegram-чат ──► grammY bot ──► Bookmark service ──► Supabase (Postgres + RLS)
                    │                  │
                    │                  └─ SSRF-safe OpenGraph fetcher
                    │
Telegram WebApp ──► Express API (service role) ────┘
   React + Tailwind
```

## Что реализовано

- **Бот** (`grammY`): принимает ссылку с текстом, достаёт первый URL, выделяет `#хэштеги`, остальной текст сохраняет заметкой, подтягивает `og:title`, `og:image`, `og:description`.
- **Дедупликация**: одна закладка на пару «пользователь + нормализованный URL»; повторная ссылка обновляет заметку и добавляет новые теги.
- **API** (`Express 5`): авторизация по подписанному Telegram `initData`, список с фильтрами/поиском/пагинацией, теги с количеством, удаление.
- **WebApp** (`React 19 + Tailwind 4`): мобильный UI, тема Telegram, поиск с debounce, чипы тегов, skeleton, пустые состояния, безопасное удаление.
- **Безопасность**: HMAC-проверка `initData` (Bot API 8.0 `signature` исключается), 24-часовая свежесть, service-role только на сервере, RLS как второй контур, SSRF-защита, экранирование HTML в ответах бота.
- **Тесты**: 77 unit/integration-тестов на Vitest.

## Структура

```
supabase/migrations/20261018000000_init.sql   схема, индексы, RLS, RPC
apps/server/src/
  auth/                 проверка initData + middleware
  bookmarks/            URL/теги, OpenGraph, репозиторий, сервис
  bot/                  grammY-бот и форматирование ответов
  routes/               /api/items, /api/tags, /api/me
  app.ts, index.ts      Express и запуск polling/webhook
apps/web/src/
  components/           карточки, поиск, теги, состояния
  hooks/useBookmarks.ts debounce, фильтры, пагинация
  lib/                  API-клиент, Telegram SDK, демо-данные
docs/superpowers/plans/ план реализации
```

## 1. Supabase

1. Создайте проект на [supabase.com](https://supabase.com).
2. Откройте **SQL Editor** и выполните целиком `supabase/migrations/20261018000000_init.sql`.
   Либо, если установлен Supabase CLI и проект связан: `supabase db push`.
3. Возьмите в **Project Settings → API**:
   - `Project URL` → `SUPABASE_URL`;
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`.

> Service role обходит RLS и даёт полный доступ. Он используется только сервером и **никогда** не попадает в браузер. RLS-политики при этом включены: прямой доступ anon/authenticated ограничен своими строками.

### Модель данных

| Таблица | Назначение | Ключевые индексы/ограничения |
|---|---|---|
| `users` | Telegram-аккаунты | `unique(telegram_id)` |
| `saved_items` | закладки | `unique(user_id, normalized_url)`, `(user_id, created_at desc, id desc)`, GIN `search_vector` |
| `tags` | теги пользователя | `unique(user_id, slug)`, `(user_id, name)` |
| `saved_item_tags` | many-to-many | PK `(saved_item_id, tag_id)`, индекс `(tag_id) include (saved_item_id)` |

Поиск — `tsvector('simple', title || note || url)` + GIN и префиксный `tsquery` (`диз:*`), поэтому работает по кириллице и латинице без морфологии. Все timestamps — `timestamptz`.

SQL-функции (вызываются только сервером):

- `save_bookmark(...)` — атомарный upsert закладки + тегов;
- `list_saved_items(user, tag, tsquery, limit, offset)` — фид с тегами и `total_count` за один запрос;
- `list_tags(user)` — теги с количеством;
- `delete_saved_item(user, item)` — удаление с проверкой владельца и очисткой осиротевших тегов.

## 2. Telegram-бот

1. Создайте бота у [@BotFather](https://t.me/BotFather): `/newbot`, сохраните токен → `BOT_TOKEN`.
2. Для Mini App нужен **публичный HTTPS-адрес** фронтенда (`WEBAPP_URL`). Локально удобно поднять туннель:
   ```bash
   npx cloudflared tunnel --url http://localhost:3001
   # или: ngrok http 3001
   ```
3. В BotFather: `/mybots → ваш бот → Bot Settings → Menu Button` (или `/newapp`) укажите HTTPS-URL WebApp. Кнопку в `/start` бот добавляет сам, если `WEBAPP_URL` начинается с `https://`.
4. По умолчанию сервер использует long polling — вебхук и публичный API не обязательны для разработки.

## 3. Переменные окружения

```bash
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env
```

`apps/server/.env`:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
BOT_TOKEN=123456:AA...
WEBAPP_URL=https://your-public-webapp.example.com
PORT=8787
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:3001
# Только для локальной разработки без Telegram. В production запрещён.
DEV_TELEGRAM_ID=100000001
# Опционально: webhook-режим
# WEBHOOK_URL=https://api.example.com
# WEBHOOK_SECRET=replace-with-16-plus-random-chars
```

`apps/web/.env`:

```dotenv
# Пусто = тот же origin (в dev работает Vite-прокси на :8787)
VITE_API_URL=
VITE_BOT_URL=https://t.me/your_bot
# 1 = локальные фикстуры без Supabase и бота
VITE_DEMO=0
# 1 = использовать DEV_TELEGRAM_ID вместо initData (только локально)
VITE_DEV_AUTH=0
```

`DEV_TELEGRAM_ID` + `VITE_DEV_AUTH=1` позволяют открыть WebApp в обычном браузере без Telegram: API примет запросы без `initData` и создаст пользователя с этим Telegram ID. Работает только при `NODE_ENV !== production`; в production сервер отклоняет `DEV_TELEGRAM_ID`.

## 4. Запуск

Требования: Node.js 22+.

```bash
npm install
npm run dev          # API :8787 + Vite :3001
```

Для браузера без Telegram: `DEV_TELEGRAM_ID=100000001` в `apps/server/.env` и `VITE_DEV_AUTH=1` в `apps/web/.env`, затем откройте `http://localhost:3001`. Без этого WebApp покажет экран «Откройте из Telegram».

Проверка:

```bash
curl http://localhost:8787/api/health
# {"ok":true,"service":"telegram-bookmarks"}
```

Только UI, без backend:

```bash
cd apps/web
VITE_DEMO=1 npm run dev
# или откройте http://localhost:3001/?demo=1
```

В демо-режиме работают поиск, теги, удаление и карточки, но данные живут в памяти вкладки.

## 5. Проверки

```bash
npm run typecheck
npm test
npm run build
```

- Сервер: `vitest run`, сборка `tsc`.
- Веб: `vitest run` (format helpers), `tsc --noEmit && vite build`.
- SQL-миграция проверяется в Supabase SQL Editor (локального Postgres в CI нет).

## Статус проверки

В среде, где собирался проект, не было доступа к npm registry и браузера. Поэтому реальные `npm install`, `vitest`, `vite build`/Tailwind, миграция в Supabase и Telegram E2E **не запускались**. Проверено статически и локальным раннером: `tsc` для сервера и web-исходников (с временными type-стабами отсутствующих пакетов), сборка сервера в `dist`, бандл web-исходников через Bun, 77 тестов через Bun-совместимый раннер. После `npm install` прогоните `npm run typecheck && npm test && npm run build` и выполните миграцию в Supabase — это обязательные шаги приёмки.

## API

Все `/api/*`, кроме `/health`, требуют заголовок `X-Telegram-Init-Data` с сырой строкой `Telegram.WebApp.initData`.

| Метод | Путь | Ответ |
|---|---|---|
| `GET` | `/api/health` | `{ ok, service }` |
| `GET` | `/api/me` | `{ user }` |
| `GET` | `/api/items?tag=&q=&limit=30&offset=0` | `{ items, total, limit, offset }` |
| `GET` | `/api/tags` | `{ tags: [{ id, name, slug, itemCount }] }` |
| `DELETE` | `/api/items/:id` | `{ ok: true }` или `404` |

`limit` — 1…100, `offset` — 0…100000, `q` — до 200 символов, `tag` — slug из `/api/tags`.

Ошибки: `{ error: { code, message } }`; коды `missing_init_data`, `invalid_signature`, `expired`, `validation_error`, `not_found`, `origin_not_allowed`.

## Как сохраняется ссылка

1. Бот берёт первый `http(s)`/`www` URL (включая скрытые `text_link`).
2. Убирает URL и хэштеги из текста → заметка (до 5000 символов).
3. Теги нормализуются в slug (`#UI Kit` → `ui-kit`), до 10 штук.
4. OpenGraph-фетчер проверяет протокол, hostname и **каждый** DNS-адрес (private/loopback/link-local/metadata запрещены), затем идёт по редиректам (макс. 3), таймаут 5 с, лимит 512 КБ.
5. Если сайт недоступен/не HTML — закладка всё равно сохраняется, заголовок = hostname.
6. SQL-функция делает upsert по `(user_id, normalized_url)`, обновляет заметку/заголовок и добавляет теги.

## Безопасность

- `initData`: HMAC-SHA256, секрет `HMAC("WebAppData", bot_token)`, поля сортируются, `hash` и `signature` исключаются, сравнение constant-time, `auth_date` не старше 24 часов.
- Каждый запрос скоупится по `user.id`, полученному из проверенного `initData`; ID пользователя нельзя передать с клиента.
- RLS включён и форсирован для всех четырёх таблиц; authenticated видит только свои строки.
- CORS — allowlist из `WEBAPP_URL` + `ALLOWED_ORIGINS`.
- Ответы с персональными данными: `Cache-Control: private, no-store`.
- Бот экранирует пользовательский HTML; React экранирует по умолчанию.
- SSRF: блокируются private/loopback/link-local/metadata IPv4/IPv6 и IPv4-mapped формы, проверяются все DNS-ответы и каждый редирект. Остаточный риск DNS rebinding между проверкой и запросом для MVP принят.

## Деплой

- **API/бот**: любой Node-хостинг (Fly.io, Railway, Render) с переменными из `apps/server/.env`. Для webhook задайте `WEBHOOK_URL` (публичный HTTPS-базис API) и `WEBHOOK_SECRET`; сервер сам вызовет `setWebhook` на `/telegram/webhook`.
- **WebApp**: статическая сборка `apps/web/dist` (Vercel/Netlify/Cloudflare Pages). Задайте `VITE_API_URL` на публичный API, если он не на том же origin. `WEBAPP_URL` в BotFather и сервере должен совпадать с HTTPS-адресом фронтенда.
- Приложение можно не публиковать в каталоге Mini Apps — достаточно Menu Button в боте.

## Ограничения MVP

- Нет редактирования заметки из WebApp: повторная ссылка в боте обновляет заметку, новые теги добавляются.
- Нет шаринга коллекций, экспорта, OCR, вложений и загрузки превью в Storage (храним внешний URL).
- Поиск без морфологии: `диз:*` найдёт «дизайн», но не «дизайнерский» по корню; для этого нужен `russian`/`pg_trgm`-словарь.
- Нет rate limiting и фоновых job'ов — для публичного масштаба добавить.
- Превью грузятся с внешних сайтов; часть CDN может блокировать hotlink, тогда показывается градиентная заглушка.

## Troubleshooting

| Симптом | Причина |
|---|---|
| `401 missing_init_data` | WebApp открыт не из Telegram; используйте бота или `DEV_TELEGRAM_ID` в dev |
| `401 invalid_signature` | `BOT_TOKEN` не от того бота / initData собран вручную |
| `401 expired` | `initData` старше 24 часов — переоткройте Mini App |
| Нет кнопки «Открыть библиотеку» | `WEBAPP_URL` не HTTPS или чат не private |
| Картинки не видны | сайт блокирует hotlink/CSP; это не влияет на сохранение |
| `403 origin_not_allowed` | добавьте origin фронтенда в `ALLOWED_ORIGINS` |

## Лицензия

MIT — используйте как основу для своего сервиса.
