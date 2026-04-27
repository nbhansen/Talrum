-- Seed the starter template library that handle_new_user() clones into every
-- new user's account on signup (closes #63). Without this, fresh signups on
-- cloud land on a blank screen — the AAC tool's primary value (pictograms to
-- react to, boards to use) is invisible until the parent creates content
-- from scratch.
--
-- Why a migration and not supabase/seed.sql: by Supabase convention seed.sql
-- only runs on local `supabase db reset`. `supabase db push --linked` (used
-- by deploy-migrations.yml) does not run seed.sql, so cloud has stayed empty
-- since the project's first deploy. A migration is the only path that lands
-- on cloud automatically. After this PR, supabase/seed.sql is blanked and
-- this file is the single source of truth for starter content — no drift
-- between local and cloud.
--
-- Idempotency: ON CONFLICT (slug) DO NOTHING. Supabase doesn't reapply
-- migrations, but the ON CONFLICT shape also makes a hand-run safe.
--
-- Future template changes: write a NEW migration that explicitly UPDATEs by
-- slug for changes to existing rows, INSERTs new slugs, and DELETEs removed
-- ones. Re-running this migration with a changed label would silently drop
-- the change because of ON CONFLICT — that's intentional (this file is
-- frozen as the v1 starter library).

insert into template_pictograms
  (slug, label, style, glyph, tint, image_path, audio_path) values
  ('wakeup',    'Wake up',     'illus', 'sun',   'oklch(90% 0.06 90)',  null, null),
  ('bed',       'Out of bed',  'illus', 'bed',   'oklch(88% 0.05 300)', null, null),
  ('brush',     'Brush teeth', 'illus', 'tooth', 'oklch(88% 0.05 240)', null, null),
  ('dress',     'Get dressed', 'illus', 'shirt', 'oklch(88% 0.05 45)',  null, null),
  ('shoes',     'Shoes on',    'illus', 'shoe',  'oklch(88% 0.05 155)', null, null),
  ('breakfast', 'Breakfast',   'illus', 'bowl',  'oklch(88% 0.05 45)',  null, null),
  ('apple',     'Apple',       'illus', 'apple', 'oklch(88% 0.05 20)',  null, null),
  ('cup',       'Drink',       'illus', 'cup',   'oklch(88% 0.05 240)', null, null),
  ('bag',       'Backpack',    'illus', 'bag',   'oklch(88% 0.05 155)', null, null),
  ('car',       'Go to car',   'illus', 'car',   'oklch(88% 0.05 300)', null, null),
  ('park',      'Park',        'photo', null,    null,                  null, null),
  ('store',     'Supermarket', 'photo', null,    null,                  null, null),
  ('zoo',       'Zoo',         'photo', null,    null,                  null, null),
  ('play',      'Playground',  'photo', null,    null,                  null, null),
  ('book',      'Story time',  'illus', 'book',  'oklch(88% 0.05 300)', null, null),
  ('bath',      'Bath',        'illus', 'bath',  'oklch(88% 0.05 240)', null, null),
  ('heart',     'Love',        'illus', 'heart', 'oklch(88% 0.05 20)',  null, null)
on conflict (slug) do nothing;

insert into template_boards
  (slug, name, kind, labels_visible, voice_mode, step_slugs, kid_reorderable, accent, accent_ink) values
  ('morning',     'Morning routine',      'sequence', true, 'tts', array['wakeup', 'brush', 'dress', 'breakfast', 'bag', 'car']::text[], false, 'peach',    'peach-ink'),
  ('afterschool', 'After school',         'sequence', true, 'tts', array['bag', 'apple', 'book', 'bath']::text[],                       false, 'sage',     'sage-ink'),
  ('weekend',     'Saturday — where to?', 'choice',   true, 'tts', array['park', 'store', 'zoo']::text[],                               false, 'sky',      'sky-ink'),
  ('bedtime',     'Bedtime',              'sequence', true, 'tts', array['bath', 'book', 'cup', 'bed']::text[],                         true,  'lavender', 'lavender-ink')
on conflict (slug) do nothing;
