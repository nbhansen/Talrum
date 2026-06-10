-- Tests for the `delete_pictogram` RPC (#280).
--
-- Pictogram deletion used to run SELECT + N UPDATEs + DELETE from the
-- browser, with the scrub list computed from the client cache at enqueue
-- time — non-atomic, and stale lists left dangling step_ids. The RPC
-- scrubs `boards.step_ids` server-side and deletes the row in one
-- transaction. SECURITY INVOKER: RLS scopes the scrub to boards the
-- caller can write and the delete to pictograms they own, so a stranger
-- calling it is a no-op.
--
-- Run with: supabase test db
BEGIN;
SELECT plan(6);

INSERT INTO auth.users (id, email)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@test.local'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob@test.local');

-- A pictogram of Alice's, referenced (twice) from every board she owns.
-- Setup runs as postgres so RLS doesn't apply; the duplicate entry checks
-- that array_remove strips all occurrences, not just the first.
INSERT INTO public.pictograms (id, owner_id, label, style, glyph, tint)
VALUES ('dddddddd-0000-4000-8000-000000000280',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Doomed', 'illus', 'star', 'sun');

UPDATE public.boards
   SET step_ids = step_ids || ARRAY['dddddddd-0000-4000-8000-000000000280',
                                    'dddddddd-0000-4000-8000-000000000280']::uuid[]
 WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

CREATE TEMP TABLE expected AS
  SELECT (SELECT count(*)::int FROM public.boards
           WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') AS boards;
GRANT SELECT ON expected TO authenticated;

SELECT cmp_ok((SELECT boards FROM expected), '>', 0,
  'setup: Alice has at least one seeded board to scrub');

-- ── 1-2. A stranger's call is a no-op (RLS floor) ──────────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';
SELECT public.delete_pictogram('dddddddd-0000-4000-8000-000000000280');
RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM public.pictograms
    WHERE id = 'dddddddd-0000-4000-8000-000000000280'),
  1,
  'stranger call leaves the pictogram row intact'
);
SELECT is(
  (SELECT count(*)::int FROM public.boards
    WHERE step_ids @> ARRAY['dddddddd-0000-4000-8000-000000000280']::uuid[]),
  (SELECT boards FROM expected),
  'stranger call leaves board references intact'
);

-- ── 3-5. The owner's call scrubs and deletes atomically ────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
SELECT public.delete_pictogram('dddddddd-0000-4000-8000-000000000280');

-- Idempotent: a retry after success (outbox redelivery) must not error.
SELECT lives_ok(
  $$SELECT public.delete_pictogram('dddddddd-0000-4000-8000-000000000280')$$,
  'repeat call after deletion is a no-op'
);
RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM public.pictograms
    WHERE id = 'dddddddd-0000-4000-8000-000000000280'),
  0,
  'owner call deletes the pictogram row'
);
SELECT is(
  (SELECT count(*)::int FROM public.boards
    WHERE step_ids @> ARRAY['dddddddd-0000-4000-8000-000000000280']::uuid[]),
  0,
  'owner call scrubs every step_ids reference (including duplicates)'
);

SELECT * FROM finish();
ROLLBACK;
