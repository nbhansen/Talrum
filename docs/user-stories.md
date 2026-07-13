# Talrum — Epics & User Stories

Talrum is a low-stim AAC web app for non-verbal autistic kids and their
caregivers — a modernised PECS. Parents build small picture boards; kids tap
pictograms to communicate or make choices. Target surface: full-screen iPad,
landscape 1194×834.

This document records what has shipped as user stories (so the product is
legible to new contributors) and forward-looking epics for further
development. Status: ✅ shipped · 🔜 planned (linked issue) · 💭 candidate
(no issue yet — file one when a real user need pins it down).

## Personas

- **Parent** — the account owner. Builds boards, manages kids and the
  pictogram library, controls settings. Works in *parent mode*.
- **Kid** — a non-verbal autistic child. Uses *kid mode* only: taps
  pictograms to choose or to follow a sequence. Must never land in parent UI
  or be read confusing text aloud.
- **Co-caregiver** — grandparent, teacher, or second parent with their own
  account. Views boards shared with them, read-only, on their own device.

---

## Epic 1 — Account & access

> As a parent I can get in and out of Talrum safely, with no password to
> forget, and I stay in control of my data.

- ✅ As a parent, I sign in with my email and a 6-digit one-time code (no
  password), so there is nothing for me to forget or for anyone to leak.
- ✅ As a parent, I can sign out from Settings.
- ✅ As a parent, I can read the privacy policy without signing in.
- ✅ As a parent, I can delete my account and all my data from Settings
  (see `docs/runbooks/account-deletion.md`); afterwards I land on a
  confirmation page.
- 🔜 As a parent, I must re-confirm with a fresh OTP before account deletion,
  so a stolen open session can't destroy my data. ([#111], deferred until
  real users)
- 🔜 As a parent, I can export all my data in a portable format (GDPR
  Art. 20). ([#109], deferred until real users)

## Epic 2 — Kid profiles

> As a parent I keep each child's boards separate.

- ✅ As a parent, I can add a kid, rename them, and delete them.
- ✅ As a parent, I switch between kids with tabs on the Boards screen; each
  kid has their own boards.

## Epic 3 — Board building

> As a parent I compose small, focused boards in minutes — not a desktop
> publishing session.

- ✅ As a parent, I create a board for a kid and pick its kind: **sequence**
  (first, then, then…) or **choice** (this or that or that?).
- ✅ As a parent, I rename a board inline by typing in its title.
- ✅ As a parent, I add pictograms to a board from a picker (library or new
  photo upload), edit or remove them, and drag to reorder.
- ✅ As a parent, I switch a board between sequence and choice; if that would
  change what the kid sees, I get a confirmation first.
- ✅ As a parent, I toggle whether text labels are shown to the kid
  (some kids read, some are distracted by text).
- ✅ As a parent, I choose per board how tapped pictograms sound: read aloud
  (TTS), a recorded parent voice, or no sound.
- ✅ As a parent, I see clear error and not-found states instead of a blank
  screen when a board fails to load.

## Epic 4 — Pictogram library

> As a parent I build a reusable vocabulary of real photos, because real
> photos of the kid's actual cereal/shoes/bed work better than clip-art.

- ✅ As a parent, I upload a photo (JPG/PNG/WebP); Talrum crops it square
  automatically and requires me to give it a short label before it enters
  the library.
- ✅ As a parent, I browse and search every pictogram in my library, and can
  rename one, replace its photo, or delete it.
- ✅ As a parent, I record my own voice for a pictogram, so my kid hears me
  instead of a robot.
- 🔜 As a parent with a large library, browsing stays fast (pagination /
  lazy fetch). ([#266], deferred until libraries actually grow)

## Epic 5 — Kid mode: choice boards

> As a kid I pick one thing from a few options and the iPad says it for me.

- ✅ As a kid, I see up to a handful of large lettered options (A, B, C…)
  with calm styling and one short prompt ("Pick one place").
- ✅ As a kid, when I tap an option it is spoken aloud (TTS or my parent's
  recording, per board setting) and confirmed visually.
- ✅ As a kid, I can tap again to hear my pick repeated.
- ✅ As a kid, I never see parent UI; the only way out is the PIN-gated
  "Exit kid mode" button.

## Epic 6 — Kid mode: sequence boards

> As a kid I follow the steps of a routine one pictogram at a time.

- ✅ As a kid, I step through the board's pictograms in order, with the
  current step large and prominent.
- ✅ As a kid, an empty board tells me kindly to "ask a grown-up to add some
  pictograms" instead of breaking.
- ✅ As a kid, the KID button takes me to the most recent board that is
  actually mine and actually has content, and renders disabled when no
  board qualifies. ([#301])

## Epic 7 — Parent gate (PIN)

> As a parent I hand the iPad over without worrying the kid wanders into
> settings; as a kid I can't accidentally leave my safe space.

- ✅ As a parent, the first time I exit kid mode I'm prompted to choose a
  4-digit PIN; after that, exiting requires it.
- ✅ As a parent, I change my PIN from Settings (verify current → enter new
  → confirm new).
- ✅ As a parent who forgot the PIN, I clear it from Settings (with inline
  confirmation) and set a fresh one next time I leave kid mode.
- ✅ The PIN is a *soft* gate against kids, stored per device — it is not a
  security boundary and is documented as such.

## Epic 8 — Speech

> As a parent I tune how the iPad talks so it doesn't startle or annoy my kid.

- ✅ As a parent, I pick the TTS voice and adjust rate and pitch in Settings,
  with a "Test voice" button and a reset to defaults.
- ✅ As a parent, when a recorded voice fails to play (offline, missing
  file), Talrum falls back rather than staying silent.

## Epic 9 — Sharing with co-caregivers

> As a parent I let grandma or school see the same boards on their own iPad.

- ✅ As a parent, I share a board with another Talrum account; they see it on
  their device but cannot change it.
- ✅ As a parent, I see who a board is shared with and can remove members.

## Epic 10 — Reliability & offline

> As a parent on flaky kitchen Wi-Fi, my edits never vanish.

- ✅ As a parent, my writes go through a local outbox queue and drain to the
  server when connectivity allows (see `docs/outbox.md`); board state is
  guarded against cross-device overwrites.
- ✅ As a parent, my data is cached locally (IndexedDB) so the app opens fast
  and works through brief offline gaps.

## Epic 11 — Settings & transparency

> As a parent I can see and control the boring-but-important stuff in one
> place.

- ✅ Settings shows: signed-in account + sign out, PIN management, speech
  preferences, app version, and account deletion with a privacy-policy link.
- ✅ As a maintainer, the version readout identifies the deployed build by
  commit hash. ([#302])

---

## Future epics (not yet started)

### Epic 12 — Accessibility preferences 💭

> As a parent of a kid with specific sensory needs, I adjust the kid-mode
> presentation.

Carried over from the unbuilt remainder of #188 (closed). No concrete
requirements yet — file a fresh issue when a real user need pins them down.
Candidate stories:

- 💭 As a parent, I can reduce or disable flash/confirmation animations for
  motion-sensitive kids.
- 💭 As a parent, I can enlarge tile labels for kids who read large print.

### Epic 13 — Offline kid mode & installability ✅

> As a kid I can use my board in the car, at school, or in a waiting room —
> places with no Wi-Fi are exactly where I need it most.

Shipped — initially mis-filed as a gap ([#303], closed). The PWA setup in
`vite.config.ts` does both:

- ✅ As a kid, a board that has been opened once keeps working with no
  network: a service-worker CacheFirst cache keeps photo and audio bytes on
  disk (keyed by storage path, surviving signed-URL token rotation), and TTS
  works offline natively.
- ✅ As a parent, I install Talrum to the iPad home screen and it launches
  full-screen landscape (PWA manifest, `display: standalone`).
- 💭 Document the recommended iPad setup (Add to Home Screen + Guided
  Access) for parents.

### Epic 14 — Language matching ✅

> As a Danish kid I hear Danish — not my Danish words read by an English
> robot voice next to English prompts.

The TTS default follows the device locale, an explicit language setting in
Settings overrides it, and kid-mode copy ships in Danish and English.
([#304])

- ✅ As a parent, I set my family's language (per device, like the PIN and
  speech prefs); tapped pictograms are spoken by a voice in that language,
  with graceful fallback when the device has none.
- ✅ As a kid, the on-screen prompts ("Tap one to choose", "Ask a
  grown-up…") are in my language. Danish first, given the actual user base.
- 💭 Per-board language override, if households turn out to mix languages.
- 💭 Per-account language synced to the DB — together with the other
  device-local prefs — if multi-device households materialise.

### Epic 15 — Kid-initiated communication 💭

> As a kid I can *ask* for things, not just answer the questions a grown-up
> stages for me.

Requesting is the core of PECS; today every flow is parent-initiated. No
issues yet — needs design with real use behind it.

- 💭 As a kid, I have an always-available "I want…" board I can reach from
  kid mode without a parent setting it up each time.
- 💭 As a kid, I can say "none of these" / "something else" on a choice
  board — rejecting options is communication too.
- 💭 As a parent, I mark one board as the kid's home board so kid mode
  always starts somewhere meaningful (builds on [#301]).

### Epic 16 — Sentence building (PECS progression) 💭

> As a kid who has mastered picking single pictograms, I graduate to
> building short sentences.

PECS is a staged protocol: single-picto exchange → discrimination →
sentence strip ("I want" + picto). Talrum covers roughly phases 3–4 today;
this is the long-term destination implied by "modernised PECS".

- 💭 As a kid, I compose a sentence strip (carrier phrase + pictogram) and
  the iPad speaks the whole sentence.
- 💭 As a parent, I choose which carrier phrases are available, matching
  where my kid is in the protocol.

### Epic 17 — Caregiver feedback loop 💭

> As a parent or therapist I adjust boards based on what the kid actually
> does, not what I hope they do.

- 💭 As a parent, I see the recent picks per choice board (even just the
  last 20), so I can tell genuine preference from position bias — a kid who
  always taps option A is answering the layout, not the question.
- 💭 As a parent, I see when a board was last used, so stale boards are easy
  to spot and prune.

### Epic 18 — First-run experience 💭

> As a brand-new parent, tired and skeptical, I get from sign-up to a board
> my kid can use in under ten minutes.

Demo boards exist in the local seed but a fresh production account starts
empty.

- 💭 As a new parent, the empty Boards screen walks me through making my
  first board (add a kid → pick a kind → add three photos) instead of
  presenting a blank page.
- 💭 As a new parent, I can start from a template board (breakfast choice,
  morning routine) and swap in my own photos.

### Epic 19 — Production hardening 🔜

> As the maintainer, the app holds up once real families depend on it.

All deferred behind real usage (`prod-hedge` label); the project is on the
Supabase free tier, which blocks some of them:

- 🔜 Staging Supabase project for migration rehearsal. ([#98])
- 🔜 Migration rollback policy for a populated production DB. ([#99])
- 🔜 Load-test `handle_new_user()` under concurrent signups. ([#101])
- 🔜 Inactivity-triggered account cleanup at ~100 active users. ([#108])
- 🔜 Leaked-password protection via HaveIBeenPwned — blocked on Supabase Pro
  tier. ([#93])

[#93]: https://github.com/nbhansen/Talrum/issues/93
[#98]: https://github.com/nbhansen/Talrum/issues/98
[#99]: https://github.com/nbhansen/Talrum/issues/99
[#101]: https://github.com/nbhansen/Talrum/issues/101
[#108]: https://github.com/nbhansen/Talrum/issues/108
[#109]: https://github.com/nbhansen/Talrum/issues/109
[#111]: https://github.com/nbhansen/Talrum/issues/111
[#266]: https://github.com/nbhansen/Talrum/issues/266
[#301]: https://github.com/nbhansen/Talrum/issues/301
[#302]: https://github.com/nbhansen/Talrum/issues/302
[#303]: https://github.com/nbhansen/Talrum/issues/303
[#304]: https://github.com/nbhansen/Talrum/issues/304
