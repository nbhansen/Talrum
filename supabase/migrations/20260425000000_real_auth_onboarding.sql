-- Phase 3 step 5: real auth + per-user onboarding, uuid-native schema.
--
-- Drops and recreates the Phase 2 tables to replace text primary keys with
-- uuids. Text slugs ('apple', 'morning', 'liam') are preserved as an
-- optional human-readable column, not as identifiers. This removes the
-- entire class of Phase 3 workarounds (composite PKs, uuid-prefix arithmetic
-- on board.id, dropped boards.kid_id FK) that accumulated because text PKs
-- can't repeat across users.
--
-- Safe to run destructively because Phase 2 ran against a stub user only;
-- no real user data exists yet.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists handle_new_user();

drop table if exists board_members cascade;
drop table if exists boards        cascade;
drop table if exists pictograms    cascade;
drop table if exists kids          cascade;

-- Phase 2 RLS helpers took text; our new tables use uuid ids. Drop here;
-- recreated with uuid signatures after the new tables exist.
drop function if exists is_board_owner(text);
drop function if exists is_board_member(text);
drop function if exists is_board_editor(text);

create table kids (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null,
  name       text not null,
  created_at timestamptz not null default now()
);

create table pictograms (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null,
  slug        text,
  label       text not null,
  style       text not null check (style in ('illus', 'photo')),
  glyph       text,
  tint        text,
  image_path  text,
  audio_path  text,
  created_at  timestamptz not null default now(),
  check (
    (style = 'illus' and glyph is not null and tint is not null)
    or
    (style = 'photo' and glyph is null and tint is null)
  ),
  unique (owner_id, slug)
);

create table boards (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null,
  kid_id          uuid not null references kids(id) on delete cascade,
  slug            text,
  name            text not null,
  kind            text not null check (kind in ('sequence', 'choice')),
  labels_visible  boolean not null default true,
  voice_mode      text not null check (voice_mode in ('tts', 'parent', 'none')),
  step_ids        uuid[] not null default '{}'::uuid[],
  kid_reorderable boolean not null default false,
  accent          text not null,
  accent_ink      text not null,
  updated_at      timestamptz not null default now(),
  unique (owner_id, slug)
);

create table board_members (
  board_id uuid not null references boards(id) on delete cascade,
  user_id  uuid not null,
  role     text not null check (role in ('owner', 'editor', 'viewer')),
  primary key (board_id, user_id)
);

create index on boards       (owner_id);
create index on pictograms   (owner_id);
create index on kids         (owner_id);
create index on board_members(user_id);

create trigger boards_set_updated_at
  before update on boards
  for each row execute function set_updated_at();

-- RLS helpers rewritten against the new uuid-typed tables.

create or replace function is_board_owner(b_id uuid) returns boolean
language sql security definer stable
set search_path = public as $$
  select exists (select 1 from boards where id = b_id and owner_id = auth.uid());
$$;

create or replace function is_board_member(b_id uuid) returns boolean
language sql security definer stable
set search_path = public as $$
  select exists (select 1 from board_members where board_id = b_id and user_id = auth.uid());
$$;

create or replace function is_board_editor(b_id uuid) returns boolean
language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from board_members
    where board_id = b_id and user_id = auth.uid() and role in ('owner', 'editor')
  );
$$;

-- Row-level security: owner-only on kids/pictograms; owner + members on boards.

alter table kids          enable row level security;
alter table pictograms    enable row level security;
alter table boards        enable row level security;
alter table board_members enable row level security;

create policy kids_owner_all on kids
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy pictograms_owner_all on pictograms
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy boards_select on boards
  for select
  using (owner_id = auth.uid() or is_board_member(id));

create policy boards_insert on boards
  for insert
  with check (owner_id = auth.uid());

create policy boards_update on boards
  for update
  using (owner_id = auth.uid() or is_board_editor(id))
  with check (owner_id = auth.uid() or is_board_editor(id));

create policy boards_delete on boards
  for delete
  using (owner_id = auth.uid());

create policy board_members_select on board_members
  for select
  using (user_id = auth.uid() or is_board_owner(board_id));

create policy board_members_write on board_members
  for all
  using (is_board_owner(board_id))
  with check (is_board_owner(board_id));

-- Template tables: the starter library cloned into every new user's account
-- by handle_new_user(). RLS enabled with read-only-for-authenticated so
-- Supabase's default PostgREST exposure can't be abused to mutate them.

create table template_pictograms (
  slug       text primary key,
  label      text not null,
  style      text not null check (style in ('illus', 'photo')),
  glyph      text,
  tint       text,
  image_path text,
  audio_path text,
  check (
    (style = 'illus' and glyph is not null and tint is not null)
    or
    (style = 'photo' and glyph is null and tint is null)
  )
);

create table template_boards (
  slug            text primary key,
  name            text not null,
  kind            text not null check (kind in ('sequence', 'choice')),
  labels_visible  boolean not null,
  voice_mode      text not null check (voice_mode in ('tts', 'parent', 'none')),
  step_slugs      text[] not null,
  kid_reorderable boolean not null,
  accent          text not null,
  accent_ink      text not null
);

alter table template_pictograms enable row level security;
alter table template_boards     enable row level security;

create policy template_pictograms_read on template_pictograms
  for select using (auth.role() = 'authenticated');
create policy template_boards_read on template_boards
  for select using (auth.role() = 'authenticated');

-- On new auth.users row: clone templates into the signing-up user's tables.
-- Idempotent: if the kid already exists (retry after a partial failure) we
-- skip cloning so a re-fire doesn't double-seed.
--
-- SECURITY DEFINER is required because the trigger runs in the auth schema's
-- context during signup; search_path is pinned to public so the trigger
-- can't be hijacked via a same-named template_* in another schema.

create or replace function handle_new_user() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_kid_id       uuid;
  tp             record;
  tb             record;
  slug_to_uuid   jsonb := '{}'::jsonb;
  new_picto_id   uuid;
  remapped_steps uuid[];
begin
  if exists (select 1 from public.kids where owner_id = new.id) then
    return new;
  end if;

  insert into public.kids (owner_id, name)
  values (new.id, 'Liam')
  returning id into v_kid_id;

  for tp in select * from public.template_pictograms loop
    insert into public.pictograms
      (owner_id, slug, label, style, glyph, tint, image_path, audio_path)
    values
      (new.id, tp.slug, tp.label, tp.style, tp.glyph, tp.tint, tp.image_path, tp.audio_path)
    returning id into new_picto_id;
    slug_to_uuid := slug_to_uuid || jsonb_build_object(tp.slug, new_picto_id::text);
  end loop;

  for tb in select * from public.template_boards loop
    -- `with ordinality` + `order by` pins step order: bare `unnest` has no
    -- order guarantee. Board step order is user-facing (morning routine),
    -- so we can't rely on planner behavior.
    remapped_steps := array(
      select (slug_to_uuid ->> s)::uuid
      from unnest(tb.step_slugs) with ordinality as t(s, ord)
      where slug_to_uuid ? s
      order by t.ord
    );
    -- Raise loudly if a template_boards slug doesn't resolve. Silent short
    -- boards would mask drift between template_pictograms and template_boards.
    if coalesce(array_length(remapped_steps, 1), 0)
       <> coalesce(array_length(tb.step_slugs, 1), 0) then
      raise exception
        'handle_new_user: template_boards.slug=% references unknown pictogram slugs in %',
        tb.slug, tb.step_slugs;
    end if;
    insert into public.boards
      (owner_id, kid_id, slug, name, kind, labels_visible, voice_mode,
       step_ids, kid_reorderable, accent, accent_ink)
    values
      (new.id, v_kid_id, tb.slug, tb.name, tb.kind, tb.labels_visible, tb.voice_mode,
       remapped_steps, tb.kid_reorderable, tb.accent, tb.accent_ink);
  end loop;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
