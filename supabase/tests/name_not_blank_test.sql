-- boards.name and kids.name refuse '' and whitespace (#482). The create and
-- rename paths trim and refuse a blank name in the UI; this holds it where a
-- client bug or a direct REST call cannot get past it.
--
-- Run with: supabase test db
BEGIN;
SELECT plan(6);

INSERT INTO auth.users (id, email)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@test.local');

-- The kid and boards come from handle_new_user on the INSERT above.

SELECT throws_ok(
  $$ INSERT INTO public.kids (owner_id, name)
     VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '') $$,
  '23514', NULL,
  'kids: empty name is rejected on INSERT'
);
SELECT throws_ok(
  $$ INSERT INTO public.kids (owner_id, name)
     VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '   ') $$,
  '23514', NULL,
  'kids: whitespace name is rejected on INSERT'
);
SELECT throws_ok(
  $$ UPDATE public.kids SET name = ' '
      WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '23514', NULL,
  'kids: blank name is rejected on UPDATE'
);

SELECT throws_ok(
  $$ INSERT INTO public.boards (owner_id, kid_id, name, kind, voice_mode, accent)
     SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', k.id, '', 'sequence', 'tts', 'sky'
       FROM public.kids k
      WHERE k.owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      LIMIT 1 $$,
  '23514', NULL,
  'boards: empty name is rejected on INSERT'
);
SELECT throws_ok(
  $$ INSERT INTO public.boards (owner_id, kid_id, name, kind, voice_mode, accent)
     SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', k.id, E' \t', 'sequence', 'tts', 'sky'
       FROM public.kids k
      WHERE k.owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      LIMIT 1 $$,
  '23514', NULL,
  'boards: whitespace name is rejected on INSERT'
);
SELECT throws_ok(
  $$ UPDATE public.boards SET name = ''
      WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '23514', NULL,
  'boards: blank name is rejected on UPDATE'
);

SELECT * FROM finish();
ROLLBACK;
