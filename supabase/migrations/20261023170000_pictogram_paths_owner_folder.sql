-- An uploaded path must lie in the row owner's folder. Else a row can name
-- another user's object, and the outbox deletes it with that user's session
-- when that user deletes or replaces the pictogram (#634).
alter table public.pictograms
  add constraint pictograms_image_path_owner_folder check (
    image_path is null or image_path like 'stock:%'
    or starts_with(image_path, owner_id::text || '/')
  ),
  add constraint pictograms_audio_path_owner_folder check (
    audio_path is null or audio_path like 'stock:%'
    or starts_with(audio_path, owner_id::text || '/')
  );
