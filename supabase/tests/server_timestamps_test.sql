-- The server owns list-order timestamps (#665): a sharer must not pin rows
-- to the top or bottom of a member's lists. Run with: supabase test db
BEGIN;
SELECT plan(6);

INSERT INTO auth.users (id, email)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@test.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

INSERT INTO public.kids (id, owner_id, name, created_at)
VALUES ('eeeeeeee-0000-4000-8000-000000000665',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Early', '1970-01-01');
INSERT INTO public.pictograms (id, owner_id, label, style, created_at)
VALUES ('eeeeeeee-0000-4000-8000-000000000666',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Early', 'photo', '1970-01-01');
INSERT INTO public.boards (id, owner_id, kid_id, name, kind, voice_mode,
                           accent, updated_at)
VALUES ('eeeeeeee-0000-4000-8000-000000000667',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'eeeeeeee-0000-4000-8000-000000000665',
        'Pinned', 'sequence', 'tts', 'sky', '2099-01-01');

SELECT is((SELECT created_at FROM public.kids
            WHERE id = 'eeeeeeee-0000-4000-8000-000000000665'),
          now(), 'INSERT ignores a client-supplied kids.created_at');
SELECT is((SELECT created_at FROM public.pictograms
            WHERE id = 'eeeeeeee-0000-4000-8000-000000000666'),
          now(), 'INSERT ignores a client-supplied pictograms.created_at');
SELECT is((SELECT updated_at FROM public.boards
            WHERE id = 'eeeeeeee-0000-4000-8000-000000000667'),
          now(), 'INSERT ignores a client-supplied boards.updated_at');

UPDATE public.kids SET name = 'Renamed', created_at = '1970-01-01'
 WHERE id = 'eeeeeeee-0000-4000-8000-000000000665';
UPDATE public.pictograms SET label = 'Renamed', created_at = '1970-01-01'
 WHERE id = 'eeeeeeee-0000-4000-8000-000000000666';
RESET ROLE;

-- The name pins that the owner UPDATE landed, so the created_at check
-- cannot pass on a zero-row UPDATE.
SELECT is((SELECT name FROM public.kids
            WHERE id = 'eeeeeeee-0000-4000-8000-000000000665'),
          'Renamed', 'setup: the owner UPDATE of the kid landed');
SELECT is((SELECT created_at FROM public.kids
            WHERE id = 'eeeeeeee-0000-4000-8000-000000000665'),
          now(), 'UPDATE cannot change kids.created_at');
SELECT is((SELECT created_at FROM public.pictograms
            WHERE id = 'eeeeeeee-0000-4000-8000-000000000666'),
          now(), 'UPDATE cannot change pictograms.created_at');

SELECT * FROM finish();
ROLLBACK;
