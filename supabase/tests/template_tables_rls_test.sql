-- Role-switched test for the template-table RLS policies (#508).
--
-- grants_test.sql pins the privilege layer (SELECT-only for authenticated,
-- nothing for anon). Nothing asserted the policy layer: a broken
-- `template_pictograms_read` / `template_boards_read` would make
-- authenticated reads return zero rows silently while every grant
-- assertion stays green.
--
-- Run with: supabase test db
BEGIN;
SELECT plan(6);

INSERT INTO auth.users (id, email)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@test.local');

-- Capture the seeded counts as postgres, before role switching.
CREATE TEMP TABLE expected AS
  SELECT
    (SELECT count(*)::int FROM public.template_pictograms) AS pictograms,
    (SELECT count(*)::int FROM public.template_boards)     AS boards;
GRANT SELECT ON expected TO authenticated;

SELECT cmp_ok((SELECT pictograms FROM expected), '>', 0,
  'setup: template_pictograms is seeded (guards against a vacuous pass)');
SELECT cmp_ok((SELECT boards FROM expected), '>', 0,
  'setup: template_boards is seeded (guards against a vacuous pass)');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.template_pictograms),
  (SELECT pictograms FROM expected),
  'policy: authenticated reads the full template_pictograms set'
);
SELECT is(
  (SELECT count(*)::int FROM public.template_boards),
  (SELECT boards FROM expected),
  'policy: authenticated reads the full template_boards set'
);

-- Behavioral floor under the grant assertions in grants_test.sql: a write
-- from an authenticated session dies at the privilege layer.
SELECT throws_ok(
  $$ UPDATE public.template_pictograms SET label = label $$,
  '42501',
  'permission denied for table template_pictograms',
  'authenticated cannot UPDATE template_pictograms'
);
SELECT throws_ok(
  $$ UPDATE public.template_boards SET name = name $$,
  '42501',
  'permission denied for table template_boards',
  'authenticated cannot UPDATE template_boards'
);

SELECT * FROM finish();
ROLLBACK;
