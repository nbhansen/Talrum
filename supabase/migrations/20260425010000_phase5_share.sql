-- Sharing: extend board-membership visibility to the data a board
-- references (owner's pictograms, kids, storage bytes). Permissive on
-- purpose — a member of ANY of the owner's boards sees ALL the owner's
-- rows: simpler policies, no array scans inside RLS. Writes stay owner-only.

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
