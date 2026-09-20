-- 'parent' falls back to TTS when a pictogram has no recording. On 'tts' a
-- saved recording never plays (#575).
update public.template_boards set voice_mode = 'parent' where voice_mode = 'tts';

-- Trigger off: the outbox guards board patches with updated_at, and the list sorts on it.
alter table public.boards disable trigger boards_set_updated_at;
update public.boards set voice_mode = 'parent' where voice_mode = 'tts';
alter table public.boards enable trigger boards_set_updated_at;
