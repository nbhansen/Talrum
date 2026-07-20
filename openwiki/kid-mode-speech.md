---
type: Reference
title: Kid Mode & Speech Subsystem
description: Details Talrum's distraction-free Kid Mode UI, secure SHA-256 client-side PIN gate, choice/sequence board designs, unclamped voice language heuristic, Web Speech TTS fallback, and parent voice recording capabilities.
resource: /src/lib/voiceOut.ts
tags: [kid-mode, speech, tts, pin-gate, audio, recording]
---

# Kid Mode & Speech Subsystem

Kid Mode provides a calm, tap-only interface for children to communicate, while protecting parent settings with a client-side PIN gate. It integrates with a robust speech engine that plays custom parent voice clips or falls back to browser-based text-to-speech synthesis (TTS).

---

## 1. Kid Mode Layout & Navigation

When Kid Mode is active, the app loads `src/layouts/KidModeLayout.tsx`. This layout is designed for a landscape iPad (1194 × 834 viewport) and hides browser decoration and standard navigation options. 

*   **Distraction-Free Visuals:** No menus, badges, or loading spinners are rendered.
*   **Locked Exit Button:** Tapping the exit icon in the top-right corner opens a modal PIN gate to prevent accidental navigation back to Parent Mode.

---

## 2. The Client-Side PIN Gate

The PIN gate acts as a usability barrier to keep kids in the communication UI, rather than an encryption boundary.

```
Parent Mode ──[Launch Board]──> Kid Mode (Tap-only, full-screen)
                                  │
                                [Exit Tapped]
                                  ▼
                            [PIN Gate Modal]
                                  ├── Has PIN? ────> [PinPad: Verify] ──(Correct)──> Exit
                                  └── No PIN?  ────> [PinPad: Setup-New] ────────────┐
                                                           └─> [PinPad: Confirm] ────┘
```

### PIN Storage & Hashing
To avoid storing sensitive values, PINs are never saved in plain text. Instead, entered digits are hashed client-side with SHA-256 via the Web Cryptography API:
```typescript
const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
```
The resulting hash is stored in `localStorage` as a hex string under the key `talrum:pin-hash` (`src/lib/pin.ts`).

### Double-Entry Verification Flow
*   **Verification:** If a PIN hash is found, the system presents a numeric keypad (`PinPad.tsx`). Correct input redirects the user back to Parent Mode.
*   **First-Time Setup:** If no PIN hash is found, the parent is guided through a double-entry process (`setup-new` followed by `setup-confirm`). This prevents typos from locking the device.
*   **Audit-Ready Strings:** All kid-facing messaging is managed via `getKidCopy()` from `src/lib/kidCopy.ts`. PIN dialog prompts and validation messages are localized using the device's locale, keeping the kid's screen free of untranslated fallback strings.

---

## 3. Specialized Board Views & UX

Talrum supports two primary board types, each tailored to different cognitive workflows:

### Choice Boards (`features/kid-choice`)
Designed to facilitate decision-making (e.g. choosing a snack or activity):
*   Renders options with alphabetically indexed visual tags (A, B, C).
*   Tapping an option highlights it with a checkmark badge and reads its label aloud.
*   A large confirmation button ("Let's go to [label]") lets the child repeat the selection and confirm their final choice.

### Sequence Boards (`features/kid-sequence`)
Designed to guide children through routines (e.g., a "Bedtime" routine consisting of "brush teeth", "wash face", "read book"):
*   Renders a horizontal timeline of routine steps.
*   Tapping a step highlights that specific card and triggers its spoken label.
*   **Kid Reordering:** If `board.kidReorderable` is enabled in parent settings, children can drag tiles via a `@dnd-kit` interface to reorder steps (e.g., moving "read book" before "wash face"). These changes are sent optimistically to the server.

### Animation and Timer Precautions
*   **Slot-Based Selection:** Highlight and flash animations are bound to the slot index rather than the underlying pictogram ID. This ensures that repeating the same pictogram in a single sequence (such as "Clap, Clap, Clap") correctly highlights only the specific tile that was tapped.
*   **Timer Ref Cleanup:** Animation flash timers are tracked using React refs (`useRef`). When a sequence view is unmounted, its cleanup handlers clear all active timeouts to prevent memory leaks or state updates on unmounted elements.

---

## 4. Dual-Language Speech Subsystem

Tapping a pictogram initiates the voice playback chain in `src/lib/voiceOut.ts`:

```
Tapped Pictogram (KidSequence / KidChoice)
  │
  └── voiceMode === 'none'     ──> Silent (Caregiver Choice)
  └── voiceMode === 'parent'   ──> Try Playback (src/lib/audio.ts)
                                     │
                                     ├── [Success] ──> Play Recorded Parent Voice
                                     └── [Fail]    ──> Fallback ──┐
                                                                  ▼
  └── voiceMode === 'tts'      ──────────────────────────────> Speak Label (src/lib/speech.ts)
```

### Synthesis Fallback Strategy
If a board is configured to use recorded voice (`parent`), the application retrieves a temporary signed URL and plays the file via the browser's `Audio` element. 

If playback fails (e.g., due to network interruptions or a missing recording file), the system **catches the error and falls back to Web Speech synthesis (`'tts'`)**. This ensures that the application never goes completely silent.

### Language Resolution Splits
To handle interface localization and TTS voice matching, Talrum implements two separate language resolvers (`src/lib/language.ts`):

*   **`getAppLanguage()` (Clamped):** Resolves the language for Talrum's built-in UI strings. It is clamped to `'en' | 'da'`. If the device is set to an unsupported system language (such as Swedish), it defaults to English to prevent blank elements.
*   **`getVoiceLanguage()` (Unclamped):** Resolves the locale for TTS voice selection. It is unclamped and reads the user's explicit preference or defaults to the primary system subtag (e.g., `'sv'` for Swedish). This allows Swedish parents to write Swedish labels on custom cards, and the browser's TTS engine will narrate them with a natural Swedish voice rather than forcing them through an English synthesizer.

### Voice Selection Heuristics
*   **Voice Matching Preference (`pickVoice`):** If no custom voice URI is selected, the application scans the browser's voice dictionary. It matches by `getVoiceLanguage()`, falls back to English, and biases toward natural female system voices (optimizing for Apple's Samantha, Victoria, or Karen, as iPad is the primary target device).
*   **Asynchronous Loading:** Since Chromium-based browsers load TTS voices asynchronously, `ensureVoice` hooks into the `voiceschanged` event to update the voice dictionary cache as soon as they are loaded.

---

## 5. Custom Parent Recording Uploads

In Parent Mode, caregivers can record custom audio for any pictogram (`src/lib/recording.ts`):

1.  **Audio Stream Capture:** Accesses input hardware via `navigator.mediaDevices.getUserMedia({ audio: true })`.
2.  **Format Selection Heuristic:** Programmatically identifies the first format supported by the browser from a list of priority codecs:
    - `'audio/webm;codecs=opus'`
    - `'audio/webm'`
    - `'audio/mp4'`
    - `'audio/ogg;codecs=opus'`
3.  **Blob Packaging & Outbox Upload:** Recorded chunks are collected into a single `Blob`, mapped to a standard file extension (`.m4a`, `.ogg`, `.mp3`, or `.webm`), and uploaded to the private `pictogram-audio` bucket in Supabase. This upload is processed via the [Offline Synchronization Model](offline-sync.md).

---

## Concept Relationships

The Kid Mode interface is designed for secure, low-stim visual communication:
*   Every data write triggered in Kid Mode (such as reordering routine steps) [dispatches writes to](offline-sync.md) the optimistic offline queue.
*   The authentication state and access privileges that secure the Kid Mode layout [are secured by](architecture.md) the private schema triggers and ESLint boundaries.
