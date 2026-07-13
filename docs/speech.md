# Speech: how a pictogram tap becomes sound

Talrum is an AAC app — for a non-verbal kid, the audio *is* the interface. A
tap that stays silent is a broken promise, so the subsystem is built around
one rule: if a pictogram can make sound, it does, falling back rather than
failing. This page is the narrative; the doc comments in `src/lib/speech.ts`,
`src/lib/language.ts` and friends carry the per-decision detail.

## The shape

```
kid taps a pictogram (KidSequence / KidChoice)
  ▼
speakPictogram(picto, board.voiceMode)   src/lib/voiceOut.ts
  │ 'none'                     → silence, by caregiver choice
  │ 'parent' + picto.audioPath → playPictogramAudio (src/lib/audio.ts,
  │                              signed Storage URL); on any failure,
  │                              fall through — the tap is never silent
  ▼
speak(picto.label)                        src/lib/speech.ts
  │ reads getSpeechPrefs() (rate, pitch, saved voiceURI) at call time
  │ resolves a voice: saved voiceURI, else the cached heuristic pick
  ▼
window.speechSynthesis                    (silent only if the browser has no
                                           speechSynthesis at all)
```

`voiceMode` is per **board** (`src/types/domain.ts`), so a caregiver can give
one routine a recorded parent voice and leave another on TTS. Recordings are
captured with `src/lib/recording.ts` (a MediaRecorder wrapper) in parent
mode and uploaded via the outbox; playback here only needs the Storage path.

## Two languages, deliberately not one

The heart of the subsystem is a split in `src/lib/language.ts` (#304):

- **`getAppLanguage()`** — the language of Talrum's own kid-visible copy.
  Clamped to `APP_LANGUAGES` (`'en' | 'da'`): explicit pref, else the device
  locale *when we have copy for it*, else English. We can't show Swedish
  strings we never wrote, so the clamp is what keeps a Swedish iPad from
  rendering blank UI.
- **`getVoiceLanguage()`** — the target language for TTS voice matching.
  Explicit pref, else the device locale's primary subtag, **unclamped**. A
  Swedish household's pictogram labels are written by the parents in Swedish;
  the browser very likely has a Swedish voice even though Talrum has no
  Swedish copy. Clamping here would force those labels through an English
  voice (#312).

`primarySubtag` normalises `da-DK` / `da_DK` / `da` to `da` before comparing.
Both resolvers read the same explicit pref (`getLanguagePref` /
`setLanguagePref`, `null` = follow the device locale), set from
`features/settings/LanguageSection.tsx` (#313).

## Where preferences live: this device, not this account

Language (`talrum:language`) and speech prefs (`talrum:speech-prefs`, via
`src/lib/speechPrefs.ts`: `rate`, `pitch`, `voiceURI`) are plain
localStorage — per device, not per account. That's deliberate twice over:
nothing in the app is per-account yet (the PIN lives the same way), and the
values are inherently device-shaped — a `voiceURI` names a voice installed on
*this* iPad and means nothing on another. All reads are try/catch'd and fall
back to defaults; a privacy-mode browser just gets the heuristic. If settings
ever move to the DB, migrate these together (see the comment atop
`language.ts`).

Everything is resolved **at call time**: `speak()` re-reads prefs per
utterance and `getKidCopy()` per render, so a settings change applies on the
next tap or render, no reload.

## Picking and caching the default voice

`speechSynthesis.getVoices()` is empty on first call in Chromium — voices
arrive later via `voiceschanged`. `ensureVoice` in `speech.ts` handles this:
pick from whatever list exists now, or attach a one-shot listener and pick
when the list lands. The pick (`pickVoice`) prefers voices matching
`getVoiceLanguage()`, then English (the app's own copy), then anything, with
a bias toward common female system voices. The result is cached keyed on the
target language, so a language change in settings invalidates it on the next
tap while ordinary taps skip the lookup. A saved `voiceURI` from prefs
overrides the heuristic; if that voice has vanished (voice lists differ
across platforms), the heuristic silently takes over. The settings UI uses
`subscribeVoices` / `getAvailableVoices` to re-render when the async list
arrives, and tests reset module state with `__resetSpeechForTests`.

## Kid copy: one file, one audit point

Every string a kid can see lives in `src/lib/kidCopy.ts` — one `KidCopy`
table per language, `getKidCopy()` resolves via `getAppLanguage()` (#241,
#304). For an AAC app this is an invariant, not a tidiness preference: kid
mode is used *by* the kid, often read aloud, and a stray English string
hard-coded in a component would leak past both translation and any future
tone/reading-level review. One file means one place to audit what the kid is
exposed to. Generic parent-mode chrome (Cancel, Delete) stays out; the PIN
flow that gates kid-mode exit is in, because the kid sees it.

## When you extend this

- **New kid-visible string:** add it to the `KidCopy` interface and to *both*
  language tables in `kidCopy.ts` before referencing it from a component —
  the `Record<AppLanguage, KidCopy>` type makes a missing translation a
  compile error.
- **New app language:** add the code to `APP_LANGUAGES` in `language.ts` and
  a full table in `kidCopy.ts`; the type system walks you through the rest.
  `getVoiceLanguage()` needs nothing — it already handles every locale.
- **Touching playback:** keep the `speakPictogram` ordering — recorded audio
  is the caregiver's explicit choice, TTS is the fallback, and silence only
  ever happens when the caregiver set `voiceMode: 'none'` or the platform has
  no speech synthesis at all.
