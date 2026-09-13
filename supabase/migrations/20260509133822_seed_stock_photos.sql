-- Stock photos for the photo-style starter pictograms (#177). The
-- `stock:<slug>` sentinel resolves to /seed-photos/<slug>.jpg in the SPA
-- bundle (PictogramMedia.tsx), keeping the assets out of Supabase Storage.
-- Idempotent: gated on image_path IS NULL.

update template_pictograms set image_path = 'stock:park'  where slug = 'park'  and image_path is null;
update template_pictograms set image_path = 'stock:store' where slug = 'store' and image_path is null;
update template_pictograms set image_path = 'stock:zoo'   where slug = 'zoo'   and image_path is null;
update template_pictograms set image_path = 'stock:play'  where slug = 'play'  and image_path is null;

-- Backfill existing users whose pictograms were cloned with null image_path
-- before this migration landed. Same null-guard so re-running won't stomp on
-- a user who's already replaced the stock photo with their own upload.
update pictograms set image_path = 'stock:' || slug
  where style = 'photo'
    and image_path is null
    and slug in ('park', 'store', 'zoo', 'play');
