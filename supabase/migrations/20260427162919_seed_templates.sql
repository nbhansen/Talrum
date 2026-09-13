-- Starter template library that handle_new_user() clones on signup (#63).
-- A migration, not seed.sql, because `db push` never runs seed.sql on
-- cloud. Frozen as v1: ON CONFLICT (slug) DO NOTHING makes hand-runs safe,
-- so template changes need a NEW migration that updates by slug.

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
