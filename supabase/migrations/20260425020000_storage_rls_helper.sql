-- Storage RLS via helper function (#37). The inline policy's unqualified
-- `name` resolved to `boards.name` (column shadowing), so the member branch
-- never matched. A helper taking the object name as a parameter is
-- structurally immune to shadowing. Writes stay owner-only.

drop policy pictogram_audio_member_select on storage.objects;
drop policy pictogram_images_member_select on storage.objects;

-- A pictogram storage path is `<owner_uuid>/<pictogram_uuid>.<ext>`, so
-- `(storage.foldername(p_object_name))[1]` is the file owner's user_id.

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
