-- Phase 5: minimum viable sharing.
--
-- Owners can already grant other users access to a board via the
-- `board_members` table that's existed since Phase 2. The phase-3 RLS for
-- `boards` already honors membership (`is_board_member` on SELECT,
-- `is_board_editor` on UPDATE). This migration extends that visibility
-- across the data the board *references*: the owner's pictograms, the
-- owner's kid record, and the storage bytes for any photo/audio
-- pictograms on the owner's boards.
--
-- Permissive on purpose. A member sees ALL of the owner's pictograms
-- and ALL of the owner's kids whenever the member belongs to ANY of the
-- owner's boards — not just the rows referenced by the shared board's
-- `step_ids`. Trade: simpler policy SQL, no array scans inside RLS, and
-- a member can still re-add a removed pictogram without the owner
-- re-sharing. Storage bytes follow the same rule via the file-path
-- prefix (which encodes the file's owner_id).
--
-- Writes stay owner-only across the board. Phase 5 surfaces only the
-- viewer role; the editor branch in `boards_update` is unchanged but
-- not yet exposed in UI.

-- ─── pictograms ─────────────────────────────────────────────────────────────

drop policy pictograms_owner_all on pictograms;

create policy pictograms_select on pictograms
  for select
  using (
    owner_id = auth.uid()
    or exists (
      select 1
      from boards b
      join board_members bm on bm.board_id = b.id
      where b.owner_id = pictograms.owner_id
        and bm.user_id = auth.uid()
    )
  );

create policy pictograms_owner_write on pictograms
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ─── kids ───────────────────────────────────────────────────────────────────

drop policy kids_owner_all on kids;

create policy kids_select on kids
  for select
  using (
    owner_id = auth.uid()
    or exists (
      select 1
      from boards b
      join board_members bm on bm.board_id = b.id
      where b.owner_id = kids.owner_id
        and bm.user_id = auth.uid()
    )
  );

create policy kids_owner_write on kids
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ─── storage: pictogram-images SELECT ───────────────────────────────────────
-- Existing INSERT/UPDATE/DELETE policies stay owner-only (path-prefix gated).
-- Only the read policy widens.

drop policy pictogram_images_owner_select on storage.objects;

create policy pictogram_images_member_select on storage.objects
  for select
  using (
    bucket_id = 'pictogram-images'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or exists (
        select 1
        from boards b
        join board_members bm on bm.board_id = b.id
        where b.owner_id::text = (storage.foldername(name))[1]
          and bm.user_id = auth.uid()
      )
    )
  );

-- ─── storage: pictogram-audio SELECT ────────────────────────────────────────

drop policy pictogram_audio_owner_select on storage.objects;

create policy pictogram_audio_member_select on storage.objects
  for select
  using (
    bucket_id = 'pictogram-audio'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or exists (
        select 1
        from boards b
        join board_members bm on bm.board_id = b.id
        where b.owner_id::text = (storage.foldername(name))[1]
          and bm.user_id = auth.uid()
      )
    )
  );
