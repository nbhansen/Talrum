-- Continue closing pattern divergences from Phase 5 (issue #37 follow-up).
--
-- 20260425010000 created `pictograms_select` and `kids_select` with the
-- same inline `boards × board_members` EXISTS join shape that produced
-- the storage RLS bug fixed in 20260425020000. These two are safe today
-- because their inner predicates are table-qualified (`pictograms.owner_id`,
-- `kids.owner_id`) — but the divergence from the helper-function pattern
-- used everywhere else (`is_board_owner` / `is_board_member` /
-- `is_board_editor` / `is_pictogram_storage_visible`) is the landmine.
-- A future RLS author copying this shape into a new policy reintroduces
-- the column-shadowing surface.
--
-- Extract `is_owner_shared_with_me(p_owner_id uuid)` and rewrite the two
-- policies as one-line predicates that call it. The helper centralizes
-- the visibility rule for any owner-scoped table the project shares via
-- `board_members`; storage has its own helper because it takes a path
-- string instead of a uuid.

drop policy pictograms_select on pictograms;
drop policy kids_select on kids;

-- The visibility predicate for any owner-scoped table the project
-- shares via board_members. Owner sees own rows; members of any of
-- the owner's boards see the owner's rows. Symmetric to (but not
-- nested in) `is_pictogram_storage_visible(text)` — keeping them
-- parallel-but-separate avoids the cast-error trap of feeding a
-- malformed storage path into a function expecting a uuid.

create or replace function is_owner_shared_with_me(p_owner_id uuid)
returns boolean
language sql security definer stable
set search_path = public as $$
  select p_owner_id = auth.uid()
    or exists (
      select 1
      from boards b
      join board_members bm on bm.board_id = b.id
      where b.owner_id = p_owner_id
        and bm.user_id = auth.uid()
    );
$$;

create policy pictograms_select on pictograms
  for select using (is_owner_shared_with_me(owner_id));

create policy kids_select on kids
  for select using (is_owner_shared_with_me(owner_id));
