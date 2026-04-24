-- Talrum Phase 2: row-level security.
-- Phase 2 stubs auth: the client signs in as a seeded user whose uuid matches
-- LOCAL_PARENT_ID, so these policies don't gate day-to-day dev. Phase 3 flips
-- on real sign-in and the same policies start enforcing for free.
--
-- Cross-table `exists` checks (boards ↔ board_members) are wrapped in
-- SECURITY DEFINER helper functions. Running the check inside a function
-- bypasses the other table's RLS during evaluation, avoiding the policy
-- recursion Postgres reports as error 42P17.

alter table kids          enable row level security;
alter table pictograms    enable row level security;
alter table boards        enable row level security;
alter table board_members enable row level security;

create or replace function is_board_owner(b_id text) returns boolean
language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from boards where id = b_id and owner_id = auth.uid()
  );
$$;

create or replace function is_board_member(b_id text) returns boolean
language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from board_members where board_id = b_id and user_id = auth.uid()
  );
$$;

create or replace function is_board_editor(b_id text) returns boolean
language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from board_members
    where board_id = b_id
      and user_id = auth.uid()
      and role in ('owner', 'editor')
  );
$$;

-- Kids: single-owner.
create policy kids_owner_all on kids
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Pictograms: single-owner (Phase 1 hook decision).
create policy pictograms_owner_all on pictograms
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Boards: owner or member can read; owner + editor can write.
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

-- Board members: users see their own memberships. Board owners manage the
-- list (insert/update/delete).
create policy board_members_select on board_members
  for select
  using (user_id = auth.uid() or is_board_owner(board_id));

create policy board_members_write on board_members
  for all
  using (is_board_owner(board_id))
  with check (is_board_owner(board_id));
