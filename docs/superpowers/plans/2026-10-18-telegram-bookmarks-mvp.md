# Telegram Bookmarks MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline execution was requested by the user). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Рабочий MVP сервиса закладок: бот сохраняет ссылки с заметками и хэштегами, Supabase хранит данные, Telegram WebApp показывает библиотеку с поиском и фильтрами.

**Architecture:** Один Node.js/TypeScript-сервис совмещает REST API (Express) и Telegram-бота (grammY). WebApp (React + Tailwind v4) обращается к API, авторизуясь подписанным Telegram `initData`; API проверяет подпись и работает с Supabase через service-role, при этом RLS включён как второй контур защиты. SQL-функции инкапсулируют транзакционное сохранение закладки и выборки с тегами.

**Tech Stack:** PostgreSQL/Supabase, Node 22+, TypeScript 5, Express 5, grammY, `@supabase/supabase-js`, Zod, Vitest, React 19, Vite 6, Tailwind CSS 4. OpenGraph парсится небольшим regex-парсером мета-тегов — без лишней зависимости.

**Spec:** исходное ТЗ пользователя (в этом документе, раздел «Требования»).

## Global Constraints

- Node.js >= 22, ESM (`"type": "module"`), strict TypeScript.
- Все timestamps — `timestamptz`; идентификаторы — `uuid` (`gen_random_uuid()`); Telegram ID — `bigint`.
- Секреты только в `.env` (не коммитить). В репозитории — `.env.example`.
- `SUPABASE_SERVICE_ROLE_KEY` никогда не попадает во фронтенд.
- Каждый запрос API скоупится по `user.id`, полученному из проверенного `initData`, а не из тела/квери.
- Telegram `initData` проверяется HMAC-SHA256 с `WebAppData` и `auth_date` не старше 24 часов.
- Поиск — регистронезависимый, по заголовку, заметке и URL; поддерживает кириллицу и префиксы слов.
- UI — mobile-first, тёмная/светлая тема через `--tg-theme-*` с fallback, safe-area insets.
- Внешние URL валидируются (http/https, блокировка private/loopback/link-local/metadata IP, таймаут 5 с, лимит 512 КБ HTML).

## Требования (из ТЗ)

1. Supabase: `users`, `saved_items` (`url`, `title`, `preview`, `user_note`, `created_at`), `tags`; хорошие индексы.
2. Bot: принимает пересланный URL + текст/заметку, парсит OpenGraph (`og:title`, `og:image`), выделяет `#хэштеги`.
3. WebApp: фильтр по тегам, живой поиск по заметкам/заголовкам, чистый мобильный UI.

## Review Focus

| Риск | Ожидаемое поведение | Где тест |
|---|---|---|
| Поддельный/просроченный `initData` | 401, чужие данные недоступны | `auth/telegram.test.ts` |
| URL ведёт на `127.0.0.1` / `169.254.169.254` / приватный DNS | запрос отклоняется до сети | `bookmarks/metadata.test.ts` |
| Ссылка без OG-тегов / битая страница | закладка сохраняется с fallback-заголовком (hostname) | `bookmarks/metadata.test.ts` |
| Повторная ссылка с новой заметкой/тегами | одна закладка, заметка обновлена, теги добавлены | `bookmarks/repository.test.ts` (контракт RPC) |
| Кириллический поиск и `#Тег` в разном регистре | находит, теги не дублируются | `bookmarks/url.test.ts` |
| Пустой/огромный текст, XSS в заголовке | лимиты, HTML экранируется в ответах бота и React | `bot/handlers.test.ts`, build |

## File Structure

```
package.json                       # npm workspaces, общие скрипты
.env.example
README.md
supabase/migrations/20261018000000_init.sql
apps/server/
  package.json  tsconfig.json  vitest.config.ts  .env.example
  src/index.ts                     # bootstrap: config, app, bot, listen/webhook
  src/app.ts                       # express app factory
  src/config.ts                    # zod-валидация env
  src/db.ts                        # supabase service-role client
  src/types.ts                     # доменные типы + Database
  src/auth/telegram.ts             # verifyInitData
  src/auth/middleware.ts           # requireTelegramUser (verify + upsert user)
  src/bookmarks/url.ts             # URL/hashtag/note parsing, normalize
  src/bookmarks/metadata.ts        # SSRF-safe fetch + OpenGraph parser (meta tags)
  src/bookmarks/repository.ts      # RPC/PostgREST доступ
  src/bookmarks/service.ts         # сохранение закладки из текста
  src/routes/items.ts              # GET/DELETE /api/items
  src/routes/tags.ts               # GET /api/tags
  src/routes/me.ts                 # GET /api/me
  src/bot/bot.ts                   # createBot
  src/bot/handlers.ts              # /start, /help, текст с URL
  src/__tests__/*.test.ts
apps/web/
  package.json  tsconfig.json  vite.config.ts  index.html  .env.example
  src/main.tsx  src/App.tsx  src/index.css
  src/lib/api.ts  src/lib/telegram.ts  src/lib/format.ts  src/lib/types.ts
  src/lib/demo.ts                  # VITE_DEMO=1: фикстуры для UI-разработки
  src/hooks/useBookmarks.ts
  src/components/Header.tsx  SearchBar.tsx  TagFilter.tsx
  src/components/BookmarkCard.tsx  EmptyState.tsx  Skeleton.tsx
```

---

### Task 1: Workspace scaffold + toolchain

**Files:** Create `package.json`, `.gitignore`, `.env.example`, `apps/server/{package.json,tsconfig.json,vitest.config.ts}`, `apps/web/{package.json,tsconfig.json,vite.config.ts,index.html}`.

**Interfaces:**
- Produces: workspace scripts `npm run dev`, `npm run build`, `npm test`, `npm run typecheck`; packages `@bookmarks/server`, `@bookmarks/web`.

- [ ] **Step 1:** Create workspace manifests and install deps (`npm install`).
- [ ] **Step 2:** Add strict tsconfigs (server: `module: NodeNext`; web: `moduleResolution: Bundler`, `jsx: react-jsx`).
- [ ] **Step 3:** Run `npm run typecheck`; expected: no source yet, exit 0.
- [ ] **Step 4:** Commit `chore: scaffold bookmarks workspace`.

### Task 2: Database schema, indexes, RLS, functions

**Files:** Create `supabase/migrations/20261018000000_init.sql`; проверка — выполнить миграцию в Supabase SQL Editor и прогнать smoke-запросы из раздела «Database smoke» ниже.

**Interfaces (SQL):**
- `public.users(id uuid pk, telegram_id bigint unique, username text, first_name text, last_name text, language_code text, created_at, updated_at)`
- `public.saved_items(id uuid pk, user_id uuid fk, url text, normalized_url text, title text, preview text, description text, user_note text, search_vector tsvector generated, created_at, updated_at)` with `unique(user_id, normalized_url)`.
- `public.tags(id uuid pk, user_id uuid fk, name text, slug text, created_at)` with `unique(user_id, slug)`.
- `public.saved_item_tags(saved_item_id, tag_id)` pk, cascade FKs.
- `public.save_bookmark(p_user_id uuid, p_url text, p_normalized_url text, p_title text, p_preview text, p_description text, p_user_note text, p_tags jsonb) returns public.saved_items`
- `public.list_saved_items(p_user_id uuid, p_tag_slug text, p_tsquery text, p_limit int, p_offset int) returns table(id uuid, url text, title text, preview text, description text, user_note text, created_at timestamptz, tags jsonb, total_count bigint)`
- `public.list_tags(p_user_id uuid) returns table(id uuid, name text, slug text, item_count bigint)`
- `public.delete_saved_item(p_user_id uuid, p_item_id uuid) returns boolean`

- [ ] **Step 1:** Write migration with types, checks, FKs, indexes:
  - `saved_items_user_created_idx (user_id, created_at desc, id desc)`
  - `saved_items_search_idx gin (search_vector)` (`to_tsvector('simple', title||note||url)`)
  - `tags_user_name_idx (user_id, name)`
  - `saved_item_tags_tag_idx (tag_id) include (saved_item_id)`
  - RLS enabled + owner policies on all four tables; `force row level security`.
- [ ] **Step 2:** Database smoke: выполнить миграцию, затем `select save_bookmark(...)` дважды с одним URL и проверить, что в `saved_items` одна строка, а теги добавились; `select * from list_saved_items(...)` возвращает `total_count` и `tags`.
- [ ] **Step 3:** Commit `feat(db): bookmarks schema and RPCs`.

### Task 3: Server config, DB client, domain types

**Files:** `src/config.ts`, `src/db.ts`, `src/types.ts`, `.env.example`.

**Interfaces:**
```ts
export type AppConfig = {
  port: number; nodeEnv: 'development'|'test'|'production';
  supabaseUrl: string; supabaseServiceRoleKey: string;
  botToken: string; webappUrl: string;
  webhookUrl?: string; webhookSecret?: string;
  allowedOrigins: string[]; devTelegramId?: number;
  initDataMaxAgeSeconds: number;
};
export function loadConfig(env?: NodeJS.ProcessEnv): AppConfig;
export function createDb(config: AppConfig): SupabaseClient<Database>;
```
- [ ] **Step 1:** Test missing env → throws with variable names.
- [ ] **Step 2:** Implement zod schema; in `production` require https `WEBAPP_URL`, forbid `ALLOW_DEV_AUTH`.
- [ ] **Step 3:** `npm test -- config`; PASS.
- [ ] **Step 4:** Commit.

### Task 4: Telegram initData verification + auth middleware

**Files:** `src/auth/telegram.ts`, `src/auth/middleware.ts`, tests.

**Interfaces:**
```ts
export type TelegramProfile = { id: number; first_name: string; last_name?: string; username?: string; language_code?: string };
export function verifyInitData(initData: string, botToken: string, opts?: { maxAgeSeconds?: number; now?: number }): TelegramProfile;
export function isFresh(authDate: number, maxAgeSeconds: number, now?: number): boolean;
```
- [ ] **Step 1:** Tests: valid HMAC returns profile; tampered hash → `AuthError('invalid_signature')`; old `auth_date` → `AuthError('expired')`; missing `user`/`hash` → `AuthError('malformed')`.
- [ ] **Step 2:** Implement using `crypto.createHmac('sha256','WebAppData').update(botToken).digest()` then HMAC over sorted `key=value` lines; `timingSafeEqual`.
- [ ] **Step 3:** Middleware: read `x-telegram-init-data`; dev fallback only when `NODE_ENV!=='production' && DEV_TELEGRAM_ID`; upsert user; attach `req.user`; 401 JSON otherwise.
- [ ] **Step 4:** Tests pass; commit.

### Task 5: URL, hashtag, and note parsing

**Files:** `src/bookmarks/url.ts`, tests.

**Interfaces:**
```ts
export function extractFirstUrl(text: string): string | null;
export function extractHashtags(text: string): string[];
export function normalizeTag(raw: string): string;
export function stripUrlsAndHashtags(text: string): string;
export function normalizeUrl(raw: string): string; // lowercase host, drop fragment/utm/trailing slash
export function buildTsQuery(query: string): string | null; // "диз посты" -> "диз:* & пост:*"
```
- [ ] **Step 1:** Failing tests for URL in sentence, URL fragment not treated as hashtag, `#Дизайн #UI_Kit`, dedupe tags case-insensitively, note cleanup, `normalizeUrl` idempotence, tsquery injection (`a & b`, `'`) neutralized.
- [ ] **Step 2:** Implement; cap note at 5000 chars, tags at 10, tag slug 50 chars.
- [ ] **Step 3:** Tests pass; commit.

### Task 6: SSRF-safe OpenGraph fetcher

**Files:** `src/bookmarks/metadata.ts`, tests.

**Interfaces:**
```ts
export type LinkPreview = { url: string; normalizedUrl: string; title: string; preview: string | null; description: string | null };
export function isPublicAddress(ip: string): boolean;
export function parseOpenGraph(html: string, baseUrl: string): { title: string|null; image: string|null; description: string|null };
export async function fetchLinkPreview(rawUrl: string, deps?: { lookup?: Lookup; fetch?: FetchLike }): Promise<LinkPreview>;
```
- [ ] **Step 1:** Tests: private IPv4/IPv6 rejected; `parseOpenGraph` prefers `og:title`/`og:image`, resolves relative image, falls back to `<title>`; fetch timeout/redirect limit with mocked fetch; HTML entities decoded.
- [ ] **Step 2:** Implement manual redirects (max 3), re-validate every hop, 5 s timeout, 512 KB cap, `text/html` only.
- [ ] **Step 3:** Tests pass; commit.

### Task 7: Repository + API routes + bookmark service

**Files:** `src/bookmarks/repository.ts`, `src/bookmarks/service.ts`, `src/routes/{items,tags,me}.ts`, `src/app.ts`, tests.

**Interfaces:**
```ts
export interface BookmarkRepository {
  list(userId: string, f: { tag?: string; q?: string; limit: number; offset: number }): Promise<{ items: Bookmark[]; total: number }>;
  tags(userId: string): Promise<TagWithCount[]>;
  save(userId: string, input: SaveBookmarkInput): Promise<Bookmark>;
  remove(userId: string, id: string): Promise<boolean>;
}
export async function saveBookmarkFromText(repo, userId, text, meta?: FetchPreview): Promise<{ bookmark: Bookmark; tags: string[]; duplicate: boolean }>;
```
- [ ] **Step 1:** HTTP-тесты с fake repo (без supertest, через `app.listen(0)` + fetch): 401 без auth; search/tag passed through; limit clamped; delete other user's id → 404; CORS.
- [ ] **Step 2:** Implement `createApp({config, repo})`; `GET /api/health`, `/api/me`, `/api/items`, `/api/tags`, `DELETE /api/items/:id`; CORS allowlist; JSON errors.
- [ ] **Step 3:** Service parses text, fetches preview, falls back on fetch failure, calls repo.save.
- [ ] **Step 4:** Tests pass; commit.

### Task 8: Telegram bot

**Files:** `src/bot/bot.ts`, `src/bot/handlers.ts`, tests.

**Interfaces:**
```ts
export function createBot(config: AppConfig, deps: { repo: BookmarkRepository; fetchPreview?: typeof fetchLinkPreview }): Bot;
```
- [ ] **Step 1:** Handler tests (inject fake bot API): URL message saves; no URL replies with hint; hashtags stripped from note; HTML escaped in reply; duplicate message says «обновил».
- [ ] **Step 2:** Implement `/start`, `/help`, text handler, inline WebApp button (https only, URL fallback), error reply.
- [ ] **Step 3:** Tests pass; commit.

### Task 9: WebApp UI

**Files:** all `apps/web/src/**`, `vite.config.ts`.

**Interfaces:**
```ts
type Api = { me(): Promise<Me>; items(f: Filters): Promise<ItemsPage>; tags(): Promise<TagWithCount[]>; remove(id: string): Promise<void> };
export function createApi(baseUrl: string, initData: string): Api;
export function useBookmarks(api: Api): { ... };
```
- [ ] **Step 1:** Tailwind v4 + Telegram theme tokens; mobile layout: sticky header/search, horizontal tag chips, cards.
- [ ] **Step 2:** `useBookmarks`: debounce 250 ms, abort in-flight requests, tag filter, pagination «Показать ещё», retry state.
- [ ] **Step 3:** Card: preview image (fallback gradient), domain, relative date, note line-clamp, tags clickable, open external link, delete confirm via Telegram `showConfirm`.
- [ ] **Step 4:** Demo fixtures behind `VITE_DEMO=1`, banner «Демо-режим».
- [ ] **Step 5:** `npm run build -w @bookmarks/web`; PASS.
- [ ] **Step 6:** Screenshot at 390×844 via dev server and inspect.
- [ ] **Step 7:** Commit.

### Task 10: Bootstrap, docs, end-to-end smoke

**Files:** `src/index.ts`, `README.md`, env examples.

- [ ] **Step 1:** Bootstrap: load config, create db/repo, Express app, bot; long polling in dev, webhook at `/telegram/webhook` when configured; graceful SIGINT/SIGTERM.
- [ ] **Step 2:** README (RU): Supabase project + migration, BotFather, env, `npm run dev`, WebApp URL, deploy notes, API table, security model, limitations.
- [ ] **Step 3:** Run `npm run typecheck && npm test && npm run build`.
- [ ] **Step 4:** Start API + web demo, check health endpoint and screenshot.
- [ ] **Step 5:** Commit `feat: telegram bookmarks mvp`.

## Verification commands

```bash
npm install
npm run typecheck
npm test
npm run build
```

Expected: 0 type errors, 77 Vitest tests pass, server `dist` and web `dist` built.

## Verification status

- Выполнено в среде без доступа к npm registry: серверный `tsc` (с временными type-стабами для отсутствующих пакетов) — 0 ошибок; `tsc` для web-исходников — 0 ошибок; сервер собран в `dist`; 77 тестов прогнаны через Bun-совместимый раннер.
- Не выполнено: `npm install`, реальный `vitest`, `vite build`/Tailwind, запуск Supabase и браузерный скриншот — в окружении нет сети к registry и нет браузера. Эти шаги нужно прогнать локально по README.

## Database smoke (Supabase SQL Editor)

```sql
-- после миграции, подставив свой user id
select public.save_bookmark(
  '<user-uuid>', 'https://example.com/a', 'https://example.com/a',
  'Example', null, null, 'заметка', '[{"name":"Дизайн","slug":"дизайн"}]'::jsonb
);
select public.save_bookmark(
  '<user-uuid>', 'https://example.com/a', 'https://example.com/a',
  'Example', null, null, 'обновлённая заметка', '[{"name":"Чтение","slug":"чтение"}]'::jsonb
);
select count(*) from public.saved_items where user_id = '<user-uuid>'; -- 1
select * from public.list_saved_items('<user-uuid>', null, null, 30, 0);
select * from public.list_tags('<user-uuid>');
```

## Out of scope (MVP)

- Редактирование заметки из WebApp (только бот/повторная ссылка).
- Полнотекстовый поиск с морфологией (используется `simple` + префиксы).
- Шаринг коллекций, экспорт, OCR, дедупликация между пользователями.
- Загрузка превью в Supabase Storage (храним внешний URL).
