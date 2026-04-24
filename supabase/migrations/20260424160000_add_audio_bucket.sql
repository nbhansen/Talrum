-- Phase 3 step 3: parent voice recordings.
-- Private bucket; objects are keyed under <owner_uuid>/<pictogram_id>.<ext>
-- so RLS can match on the first path segment.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pictogram-audio',
  'pictogram-audio',
  false,
  5 * 1024 * 1024,
  array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg']
)
on conflict (id) do nothing;

create policy pictogram_audio_owner_select on storage.objects
  for select
  using (
    bucket_id = 'pictogram-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy pictogram_audio_owner_insert on storage.objects
  for insert
  with check (
    bucket_id = 'pictogram-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy pictogram_audio_owner_update on storage.objects
  for update
  using (
    bucket_id = 'pictogram-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'pictogram-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy pictogram_audio_owner_delete on storage.objects
  for delete
  using (
    bucket_id = 'pictogram-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
