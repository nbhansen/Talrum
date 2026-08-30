-- boards_set_updated_at must fire on every UPDATE (#401): the outbox
-- conflict guard (#281) compares expectedUpdatedAt, so an unbumped write
-- lets a later conflict pass silently. The board is seeded backdated
-- because now() is frozen per transaction. Run with: supabase test db
BEGIN;
SELECT plan(5);

INSERT INTO auth.users (id, email)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@test.local');

-- A board of Alice's, backdated one hour. Setup runs as postgres so RLS
-- does not apply; the kid comes from the starter library handle_new_user
-- seeded on the INSERT above.
INSERT INTO public.boards (id, owner_id, kid_id, name, kind, voice_mode,
                           accent, updated_at)
VALUES ('eeeeeeee-0000-4000-8000-000000000401',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        (SELECT id FROM public.kids
          WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' LIMIT 1),
        'Backdated', 'sequence', 'tts', 'sky',
        now() - interval '1 hour');

SELECT is(
  (SELECT updated_at FROM public.boards
    WHERE id = 'eeeeeeee-0000-4000-8000-000000000401'),
  now() - interval '1 hour',
  'setup: INSERT keeps the explicit backdated updated_at (no BEFORE UPDATE fire)'
);

-- ── 1-2. A plain UPDATE bumps updated_at to now ────────────────────────────

UPDATE public.boards SET name = 'Renamed'
 WHERE id = 'eeeeeeee-0000-4000-8000-000000000401';

SELECT is(
  (SELECT updated_at FROM public.boards
    WHERE id = 'eeeeeeee-0000-4000-8000-000000000401'),
  now(),
  'UPDATE sets updated_at to now()'
);
SELECT cmp_ok(
  (SELECT updated_at FROM public.boards
    WHERE id = 'eeeeeeee-0000-4000-8000-000000000401'),
  '>', now() - interval '1 hour',
  'UPDATE moves updated_at forward'
);

-- ── 3-4. A client cannot backdate updated_at through the API path ──────────
-- Run as authenticated Alice, the production write path. A stale client
-- sending its own updated_at must not win — the trigger overrides it, so
-- every landed write stales the #281 guard on other clients.

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
UPDATE public.boards
   SET name = 'Renamed again', updated_at = now() - interval '2 hours'
 WHERE id = 'eeeeeeee-0000-4000-8000-000000000401';
RESET ROLE;

-- Floor check: assertion 2 already left updated_at = now(), so the override
-- assertion below passes vacuously if RLS denies the UPDATE (zero rows).
-- Pin that the write landed, same shape as handle_new_user_test.sql.
SELECT is(
  (SELECT name FROM public.boards
    WHERE id = 'eeeeeeee-0000-4000-8000-000000000401'),
  'Renamed again',
  'setup: the authenticated UPDATE landed (RLS allowed the owner write)'
);
SELECT is(
  (SELECT updated_at FROM public.boards
    WHERE id = 'eeeeeeee-0000-4000-8000-000000000401'),
  now(),
  'trigger overrides a client-supplied updated_at'
);

SELECT * FROM finish();
ROLLBACK;
