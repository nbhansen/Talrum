-- Behavioral test for the `boards_set_updated_at` trigger (#401).
--
-- The trigger (`private.set_updated_at`, wired in the init migration) bumps
-- `boards.updated_at` on every UPDATE. The outbox conflict guard (#281)
-- depends on this: the client compares its `expectedUpdatedAt` against the
-- row, so a write that lands without a bump makes a later conflicting write
-- pass the guard silently. Until now the trigger appeared only in structural
-- assertions — nothing verified that it fires and that a client cannot
-- suppress the bump.
--
-- `now()` is frozen for the whole transaction, so the seeded rows carry the
-- same timestamp the trigger will write. The test inserts a board with a
-- backdated `updated_at` (INSERT does not fire the BEFORE UPDATE trigger)
-- to make the bump observable.
--
-- Run with: supabase test db
BEGIN;
SELECT plan(4);

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

-- ── 3. A client cannot backdate updated_at through the API path ────────────
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

SELECT is(
  (SELECT updated_at FROM public.boards
    WHERE id = 'eeeeeeee-0000-4000-8000-000000000401'),
  now(),
  'trigger overrides a client-supplied updated_at'
);

SELECT * FROM finish();
ROLLBACK;
