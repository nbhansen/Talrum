-- 'parent' falls back to TTS when a pictogram has no recording. On 'tts' a
-- saved recording never plays (#575).
update public.template_boards set voice_mode = 'parent' where voice_mode = 'tts';
update public.boards set voice_mode = 'parent' where voice_mode = 'tts';
