-- Talrum Phase 2: initial schema.
-- Text primary keys mirror Phase 1 seed ids (e.g. "morning", "wake").
-- owner_id is uuid and will line up with auth.users.id once Phase 3 lands real
-- sign-in; until then the client writes a fixed LOCAL_PARENT_ID uuid.

create table kids (
  id         text primary key,
  owner_id   uuid not null,
  name       text not null,
  created_at timestamptz not null default now()
);

create table pictograms (
  id          text primary key,
  owner_id    uuid not null,
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
  )
);

create table boards (
  id              text primary key,
  owner_id        uuid not null,
  kid_id          text not null references kids(id) on delete cascade,
  name            text not null,
  kind            text not null check (kind in ('sequence', 'choice')),
  labels_visible  boolean not null default true,
  voice_mode      text not null check (voice_mode in ('tts', 'parent', 'none')),
  step_ids        text[] not null default '{}'::text[],
  accent          text not null,
  accent_ink      text not null,
  updated_at      timestamptz not null default now()
);

create table board_members (
  board_id  text not null references boards(id) on delete cascade,
  user_id   uuid not null,
  role      text not null check (role in ('owner', 'editor', 'viewer')),
  primary key (board_id, user_id)
);

create index on boards (owner_id);
create index on board_members (user_id);
create index on pictograms (owner_id);
create index on kids (owner_id);

-- Touch updated_at on any UPDATE so clients don't have to remember.
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger boards_set_updated_at
  before update on boards
  for each row execute function set_updated_at();
