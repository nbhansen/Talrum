-- Wire bundled stock photos into the four photo-style starter pictograms
-- (park, store, zoo, play). Without this the seeded "Saturday — where to?"
-- choice board (#177) renders three blank tiles for every fresh user, since
-- 20260427162919_seed_templates.sql ships those rows with image_path = null.
--
-- The image_path uses a `stock:<slug>` sentinel that PictogramMedia.tsx
-- recognizes and resolves to /seed-photos/<slug>.jpg in the SPA bundle.
-- This keeps the assets out of Supabase Storage entirely (no per-env upload
-- step, no bucket policy, no signed-URL roundtrip) at the cost of one
-- frontend branch for `imagePath?.startsWith('stock:')`.
--
-- Idempotent: each UPDATE is gated on image_path IS NULL, so re-running is a
-- no-op once paths have been written. New users created after this migration
-- pick up the values via handle_new_user()'s template clone (the trigger
-- copies image_path verbatim — see 20260425000000_real_auth_onboarding.sql).

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
