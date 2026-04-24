-- Phase 3 step 4: photo pictograms.
-- Private bucket; objects are keyed under <owner_uuid>/<pictogram_id>.<ext>
-- so the same RLS folder-prefix trick used for audio applies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pictogram-images',
  'pictogram-images',
  false,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy pictogram_images_owner_select on storage.objects
  for select
  using (
    bucket_id = 'pictogram-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy pictogram_images_owner_insert on storage.objects
  for insert
  with check (
    bucket_id = 'pictogram-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy pictogram_images_owner_update on storage.objects
  for update
  using (
    bucket_id = 'pictogram-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'pictogram-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy pictogram_images_owner_delete on storage.objects
  for delete
  using (
    bucket_id = 'pictogram-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
