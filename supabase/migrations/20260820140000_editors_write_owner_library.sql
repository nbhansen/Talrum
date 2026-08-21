-- A co-caregiver edits a shared board like the owner (#447), so a pictogram
-- they add to it belongs to the board owner: `owner_id` is the owner's and
-- the bytes go under the owner's prefix. Otherwise the owner and the other
-- members cannot read it (#490). The trust is the `board_members` row, which
-- only the owner writes, so removing a member revokes this at once.
--
-- An editor of any board of an owner writes that owner's whole pictogram
-- library and storage prefix. That matches the read side, which is already
-- per owner (`is_owner_shared_with_me`).

create or replace function private.is_editor_for_owner(p_owner_id uuid)
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
        and bm.role = 'editor'
    );
$$;

-- Text in, like `is_pictogram_storage_visible`: a malformed object path must
-- fail the check, not the cast.
create or replace function private.is_pictogram_storage_writable(p_object_name text)
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
        and bm.role = 'editor'
    );
$$;

drop policy pictograms_owner_write on public.pictograms;
create policy pictograms_write on public.pictograms
  for all
  using (private.is_editor_for_owner(owner_id))
  with check (private.is_editor_for_owner(owner_id));

-- As on boards (20260820120000): WITH CHECK accepts the row once owner_id is
-- the caller, so an editor could move a pictogram into their own library and
-- take it from the owner. RLS cannot compare NEW with OLD; a trigger can.
create or replace function public.pictograms_owner_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'pictograms.owner_id cannot change' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger pictograms_owner_immutable
  before update of owner_id on public.pictograms
  for each row execute function public.pictograms_owner_immutable();

drop policy pictogram_audio_owner_insert on storage.objects;
drop policy pictogram_audio_owner_update on storage.objects;
drop policy pictogram_audio_owner_delete on storage.objects;
drop policy pictogram_images_owner_insert on storage.objects;
drop policy pictogram_images_owner_update on storage.objects;
drop policy pictogram_images_owner_delete on storage.objects;

create policy pictogram_audio_insert on storage.objects
  for insert
  with check (bucket_id = 'pictogram-audio' and private.is_pictogram_storage_writable(name));
create policy pictogram_audio_update on storage.objects
  for update
  using (bucket_id = 'pictogram-audio' and private.is_pictogram_storage_writable(name))
  with check (bucket_id = 'pictogram-audio' and private.is_pictogram_storage_writable(name));
create policy pictogram_audio_delete on storage.objects
  for delete
  using (bucket_id = 'pictogram-audio' and private.is_pictogram_storage_writable(name));

create policy pictogram_images_insert on storage.objects
  for insert
  with check (bucket_id = 'pictogram-images' and private.is_pictogram_storage_writable(name));
create policy pictogram_images_update on storage.objects
  for update
  using (bucket_id = 'pictogram-images' and private.is_pictogram_storage_writable(name))
  with check (bucket_id = 'pictogram-images' and private.is_pictogram_storage_writable(name));
create policy pictogram_images_delete on storage.objects
  for delete
  using (bucket_id = 'pictogram-images' and private.is_pictogram_storage_writable(name));
