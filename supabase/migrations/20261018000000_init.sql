-- Telegram Bookmarks MVP — initial schema
-- Run in the Supabase SQL editor, or: supabase db push
-- Requires the standard Supabase `auth` schema (auth.uid()).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.users (
  id            uuid primary key default gen_random_uuid(),
  telegram_id   bigint not null unique,
  username      text,
  first_name    text not null default '',
  last_name     text,
  language_code text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint users_telegram_id_positive check (telegram_id > 0)
);

comment on table public.users is 'Telegram accounts known to the bot / WebApp.';

create table public.saved_items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users (id) on delete cascade,
  url            text not null,
  normalized_url text not null,
  title          text not null default '',
  preview        text,
  description    text,
  user_note      text not null default '',
  search_vector  tsvector generated always as (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' || coalesce(user_note, '') || ' ' || coalesce(url, '')
    )
  ) stored,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint saved_items_url_length check (char_length(url) between 1 and 2048),
  constraint saved_items_normalized_url_length check (char_length(normalized_url) between 1 and 2048),
  constraint saved_items_title_length check (char_length(title) <= 500),
  constraint saved_items_preview_length check (preview is null or char_length(preview) <= 2048),
  constraint saved_items_description_length check (description is null or char_length(description) <= 1000),
  constraint saved_items_note_length check (char_length(user_note) <= 5000),
  constraint saved_items_user_url_unique unique (user_id, normalized_url)
);

comment on table public.saved_items is 'One bookmark per user + normalized URL.';

create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  name       text not null,
  slug       text not null,
  created_at timestamptz not null default now(),
  constraint tags_name_length check (char_length(name) between 1 and 50),
  constraint tags_slug_length check (char_length(slug) between 1 and 50),
  constraint tags_slug_format check (slug !~ '[[:space:]#]'),
  constraint tags_user_slug_unique unique (user_id, slug)
);

comment on table public.tags is 'Per-user tag dictionary; slug is the case-folded key.';

create table public.saved_item_tags (
  saved_item_id uuid not null references public.saved_items (id) on delete cascade,
  tag_id        uuid not null references public.tags (id) on delete cascade,
  primary key (saved_item_id, tag_id)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Feed: newest first, stable pagination.
create index saved_items_user_created_idx
  on public.saved_items (user_id, created_at desc, id desc);

-- Full-text search over title + note + url (Cyrillic and Latin, prefix search).
create index saved_items_search_idx
  on public.saved_items using gin (search_vector);

-- Tag sidebar ordered by name.
create index tags_user_name_idx on public.tags (user_id, name);

-- Reverse lookup for "items with tag" and for tag cascade deletes.
create index saved_item_tags_tag_idx
  on public.saved_item_tags (tag_id) include (saved_item_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create trigger saved_items_set_updated_at
  before update on public.saved_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- The API uses the service role (bypasses RLS), but these policies guarantee
-- that even a direct anon/authenticated client can only ever read its own rows.
-- ---------------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.saved_items enable row level security;
alter table public.tags enable row level security;
alter table public.saved_item_tags enable row level security;

alter table public.users force row level security;
alter table public.saved_items force row level security;
alter table public.tags force row level security;
alter table public.saved_item_tags force row level security;

create policy users_select_own on public.users
  for select to authenticated
  using (id = (select auth.uid()));

create policy saved_items_own on public.saved_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy tags_own on public.tags
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy saved_item_tags_own on public.saved_item_tags
  for all to authenticated
  using (
    exists (
      select 1 from public.saved_items si
      where si.id = saved_item_id and si.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.tags t
      where t.id = tag_id and t.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.saved_items si
      where si.id = saved_item_id and si.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.tags t
      where t.id = tag_id and t.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- save_bookmark: atomic upsert of an item + its tags
-- p_tags: [{"name":"Дизайн","slug":"дизайн"}, ...] (already normalized in Node)
-- ---------------------------------------------------------------------------

create or replace function public.save_bookmark(
  p_user_id        uuid,
  p_url            text,
  p_normalized_url text,
  p_title          text,
  p_preview        text,
  p_description    text,
  p_user_note      text,
  p_tags           jsonb default '[]'::jsonb
)
returns public.saved_items
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item    public.saved_items;
  v_tag     jsonb;
  v_name    text;
  v_slug    text;
  v_tag_id  uuid;
begin
  insert into public.saved_items (user_id, url, normalized_url, title, preview, description, user_note)
  values (
    p_user_id,
    left(p_url, 2048),
    left(p_normalized_url, 2048),
    left(coalesce(p_title, ''), 500),
    nullif(left(coalesce(p_preview, ''), 2048), ''),
    nullif(left(coalesce(p_description, ''), 1000), ''),
    left(coalesce(p_user_note, ''), 5000)
  )
  on conflict (user_id, normalized_url) do update
    set title       = case when excluded.title <> '' then excluded.title else saved_items.title end,
        preview     = coalesce(excluded.preview, saved_items.preview),
        description = coalesce(excluded.description, saved_items.description),
        user_note   = case when excluded.user_note <> '' then excluded.user_note else saved_items.user_note end,
        updated_at  = now()
  returning * into v_item;

  for v_tag in
    select value from jsonb_array_elements(coalesce(p_tags, '[]'::jsonb))
  loop
    -- Slugs are normalized in Node (unicode-aware). Here we only enforce the
    -- database-safe shape without stripping Cyrillic letters with [[:alnum:]].
    v_slug := left(
      btrim(
        regexp_replace(lower(coalesce(v_tag ->> 'slug', '')), '[[:space:]#]+', '-', 'g'),
        '-'
      ),
      50
    );
    if v_slug = '' then
      continue;
    end if;

    v_name := left(
      coalesce(nullif(btrim(v_tag ->> 'name'), ''), v_slug),
      50
    );

    insert into public.tags (user_id, name, slug)
    values (p_user_id, v_name, v_slug)
    on conflict (user_id, slug) do update
      set slug = excluded.slug
    returning id into v_tag_id;

    insert into public.saved_item_tags (saved_item_id, tag_id)
    values (v_item.id, v_tag_id)
    on conflict do nothing;
  end loop;

  return v_item;
end;
$$;

-- ---------------------------------------------------------------------------
-- list_saved_items: filtered feed with tags + total count in one round trip
-- p_tsquery is a sanitized tsquery string built in Node ("диз:* & пост:*").
-- ---------------------------------------------------------------------------

create or replace function public.list_saved_items(
  p_user_id  uuid,
  p_tag_slug text default null,
  p_tsquery  text default null,
  p_limit    integer default 30,
  p_offset   integer default 0
)
returns table (
  id          uuid,
  url         text,
  title       text,
  preview     text,
  description text,
  user_note   text,
  created_at  timestamptz,
  tags        jsonb,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with filtered as (
    select si.*
    from public.saved_items si
    where si.user_id = p_user_id
      and (
        p_tag_slug is null or p_tag_slug = ''
        or exists (
          select 1
          from public.saved_item_tags sit
          join public.tags t on t.id = sit.tag_id
          where sit.saved_item_id = si.id
            and t.user_id = p_user_id
            and t.slug = lower(p_tag_slug)
        )
      )
      and (
        coalesce(btrim(p_tsquery), '') = ''
        or si.search_vector @@ nullif(btrim(p_tsquery), '')::tsquery
      )
  ),
  page as (
    select *
    from filtered
    order by created_at desc, id desc
    limit greatest(1, least(coalesce(p_limit, 30), 100))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select
    p.id,
    p.url,
    p.title,
    p.preview,
    p.description,
    p.user_note,
    p.created_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug)
          order by lower(t.name)
        )
        from public.saved_item_tags sit
        join public.tags t on t.id = sit.tag_id
        where sit.saved_item_id = p.id and t.user_id = p_user_id
      ),
      '[]'::jsonb
    ) as tags,
    (select count(*) from filtered) as total_count
  from page p;
$$;

-- ---------------------------------------------------------------------------
-- list_tags: sidebar with usage counts
-- ---------------------------------------------------------------------------

create or replace function public.list_tags(p_user_id uuid)
returns table (
  id         uuid,
  name       text,
  slug       text,
  item_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    t.id,
    t.name,
    t.slug,
    count(sit.saved_item_id) as item_count
  from public.tags t
  left join public.saved_item_tags sit on sit.tag_id = t.id
  where t.user_id = p_user_id
  group by t.id, t.name, t.slug
  order by item_count desc, lower(t.name) asc;
$$;

-- ---------------------------------------------------------------------------
-- delete_saved_item: ownership check + orphan tag cleanup
-- ---------------------------------------------------------------------------

create or replace function public.delete_saved_item(p_user_id uuid, p_item_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  delete from public.saved_items
  where id = p_item_id and user_id = p_user_id;

  if not found then
    return false;
  end if;

  delete from public.tags t
  where t.user_id = p_user_id
    and not exists (
      select 1 from public.saved_item_tags sit where sit.tag_id = t.id
    );

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: only the server (service role) calls these RPCs.
-- Direct authenticated clients use RLS-protected tables if ever needed.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

grant select on public.users to authenticated;
grant select, insert, update, delete on public.saved_items to authenticated;
grant select, insert, update, delete on public.tags to authenticated;
grant select, insert, update, delete on public.saved_item_tags to authenticated;

-- The server uses the service role; make the privileges explicit instead of
-- relying on project default privileges.
grant select, insert, update, delete on public.users to service_role;
grant select, insert, update, delete on public.saved_items to service_role;
grant select, insert, update, delete on public.tags to service_role;
grant select, insert, update, delete on public.saved_item_tags to service_role;

revoke all on function public.save_bookmark(uuid, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.list_saved_items(uuid, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.list_tags(uuid) from public, anon, authenticated;
revoke all on function public.delete_saved_item(uuid, uuid) from public, anon, authenticated;

grant execute on function public.save_bookmark(uuid, text, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.list_saved_items(uuid, text, text, integer, integer) to service_role;
grant execute on function public.list_tags(uuid) to service_role;
grant execute on function public.delete_saved_item(uuid, uuid) to service_role;
