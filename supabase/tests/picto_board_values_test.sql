-- glyph, tint and accent accept only values the client can render (#633, #642).
-- Run with: supabase test db
BEGIN;
SELECT plan(8);

INSERT INTO auth.users (id, email)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@test.local');

SELECT lives_ok(
  $$ INSERT INTO public.pictograms (owner_id, label, style, glyph, tint)
     VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Apple', 'illus', 'apple', 'oklch(88% 0.05 20)') $$,
  'pictograms: known glyph and OKLCH tint are accepted'
);
SELECT throws_ok(
  $$ INSERT INTO public.pictograms (owner_id, label, style, glyph, tint)
     VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'X', 'illus', 'zz', 'oklch(88% 0.05 20)') $$,
  '23514', NULL,
  'pictograms: unknown glyph is rejected'
);
SELECT throws_ok(
  $$ UPDATE public.pictograms SET tint = 'url(https://example.com/x)'
      WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND style = 'illus' $$,
  '23514', NULL,
  'pictograms: url() tint is rejected'
);
SELECT throws_ok(
  $$ UPDATE public.pictograms SET tint = 'oklch(88% 0.05 20) url(https://example.com/x)'
      WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND style = 'illus' $$,
  '23514', NULL,
  'pictograms: tint with trailing text is rejected'
);
SELECT throws_ok(
  $$ UPDATE public.boards SET accent = 'zz'
      WHERE owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '23514', NULL,
  'boards: unknown accent is rejected'
);
SELECT throws_ok(
  $$ UPDATE public.template_pictograms SET glyph = 'zz' WHERE style = 'illus' $$,
  '23514', NULL,
  'template_pictograms: unknown glyph is rejected'
);
SELECT throws_ok(
  $$ UPDATE public.template_pictograms SET tint = 'red' WHERE style = 'illus' $$,
  '23514', NULL,
  'template_pictograms: non-OKLCH tint is rejected'
);
SELECT throws_ok(
  $$ UPDATE public.template_boards SET accent = 'zz' $$,
  '23514', NULL,
  'template_boards: unknown accent is rejected'
);

SELECT * FROM finish();
ROLLBACK;
