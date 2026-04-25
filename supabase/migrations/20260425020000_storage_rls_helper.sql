-- Phase 5 follow-up: storage RLS via helper function (issue #37).
--
-- The original phase-5 migration (20260425010000) widened storage SELECT
-- so board members could read the bytes of an owner's photo / audio
-- pictograms. It did this by inlining a `boards × board_members` join
-- inside each policy's USING clause. The unqualified `name` reference
-- inside the EXISTS subquery resolved to `boards.name` (column
-- shadowing) instead of the outer `storage.objects.name`. Effect: the
-- predicate compared the file's owner_id against a board title, never
-- matched, and the member branch was dead.
--
-- The bug was reachable because the phase-5 migration diverged from
-- the helper-function pattern used everywhere else in the project's
-- RLS (see `is_board_owner` / `is_board_member` / `is_board_editor` in
-- 20260425000000_real_auth_onboarding.sql). This migration restores
-- that pattern: a single SECURITY DEFINER helper takes the storage
-- object name as a *function parameter* (not a column reference, so
-- nothing in scope can shadow it) and the two storage SELECT policies
-- become two-line predicates that call it.
--
-- Renames `pictogram_*_member_select` → `pictogram_*_select`. The old
-- name was misleading — the helper covers both the owner and member
-- branches. Writes stay owner-only via the policies created in
-- 20260424160000 / 20260424170000, untouched here.

drop policy pictogram_audio_member_select on storage.objects;
drop policy pictogram_images_member_select on storage.objects;

-- ─── helper ─────────────────────────────────────────────────────────────────
--
-- `p_object_name` is the value of `storage.objects.name` for the row
-- being policy-checked. We accept it as an argument rather than reading
-- it from a column reference so the function body is structurally
-- immune to the column-shadowing class that broke the inline policy.
--
-- A pictogram storage path is `<owner_uuid>/<pictogram_uuid>.<ext>`,
-- so `(storage.foldername(p_object_name))[1]` is the file owner's
-- user_id as text.

create or replace function is_pictogram_storage_visible(p_object_name text)
returns boolean
language sql security definer stable
set search_path = public as $$
  select
    auth.uid()::text = (storage.foldername(p_object_name))[1]
    or exists (
      select 1
      from boards b
      join board_members bm on bm.board_id = b.id
      where b.owner_id::text = (storage.foldername(p_object_name))[1]
        and bm.user_id = auth.uid()
    );
$$;

-- ─── policies ───────────────────────────────────────────────────────────────

create policy pictogram_audio_select on storage.objects
  for select
  using (
    bucket_id = 'pictogram-audio'
    and is_pictogram_storage_visible(name)
  );

create policy pictogram_images_select on storage.objects
  for select
  using (
    bucket_id = 'pictogram-images'
    and is_pictogram_storage_visible(name)
  );
