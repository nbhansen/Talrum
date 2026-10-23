-- An uploaded image_path or audio_path must lie in the row owner's folder (#634).
-- Run with: supabase test db
BEGIN;
SELECT plan(5);

INSERT INTO auth.users (id, email)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@test.local');

SELECT lives_ok(
  $$ INSERT INTO public.pictograms (owner_id, label, style, image_path, audio_path)
     VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Own', 'photo',
             'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/p-1.jpg',
             'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/p-1.webm') $$,
  'pictograms: paths in the owner folder are accepted'
);
SELECT lives_ok(
  $$ INSERT INTO public.pictograms (owner_id, label, style, image_path)
     VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Stock', 'photo', 'stock:park') $$,
  'pictograms: a stock path is accepted'
);
SELECT throws_ok(
  $$ UPDATE public.pictograms SET image_path = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/x.jpg'
      WHERE label = 'Own' $$,
  '23514', NULL,
  'pictograms: image_path in another folder is rejected'
);
SELECT throws_ok(
  $$ UPDATE public.pictograms SET audio_path = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/x.webm'
      WHERE label = 'Own' $$,
  '23514', NULL,
  'pictograms: audio_path in another folder is rejected'
);
SELECT throws_ok(
  $$ UPDATE public.pictograms SET image_path = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'
      WHERE label = 'Own' $$,
  '23514', NULL,
  'pictograms: owner id without the folder slash is rejected'
);

SELECT * FROM finish();
ROLLBACK;
