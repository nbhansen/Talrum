# Kid mode and the parent PIN gate

Kid mode is the full-screen surface a child actually uses (kid-choice, kid-
sequence). The design goal is that a kid can tap anything on screen without
ever landing in parent UI — the only way out is the PIN gate.

## The soft-gate threat model

The PIN is a **soft gate**, not security. It stops a kid in kid mode from
exiting to parent settings; it does not stop an adult with devtools. The
threat model is spelled out at the top of `src/lib/pin.ts`: the PIN is
SHA-256-hashed before persisting (we never store the digits), lives in
`localStorage` under `talrum:pin-hash`, and is **per-device** — a household
iPad has one PIN regardless of which parent account is signed in. It is
wiped alongside the rest of device state at sign-out (see
[offline-cache.md](./offline-cache.md)).

`VITE_DISABLE_PIN=1` disables the gate entirely (`pinGateDisabled()`), which
tests and local dev use to skip the modal.

## How the gate works

`KidModeGate` (`KidModeGate.tsx`) wraps each kid-mode route via a render
prop: `children(requestExit)` renders the kid screen and hands it an exit
trigger. Calling `requestExit` opens a `PinPad` modal in one of two flows:

- **Verify** — a PIN exists: one correct entry confirms exit.
- **First-time setup** — no PIN yet: the parent enters a new PIN
  (`setup-new`), then re-enters it (`setup-confirm`); a match stores the
  hash and confirms exit in the same gesture. Setup deliberately requires
  no existing-PIN verification — there is nothing to verify against yet.

All strings shown by the gate come from `getKidCopy()` — kid-visible copy
is centralized in `src/lib/kidCopy.ts` (see [speech.md](./speech.md)).

Parents manage the PIN outside kid mode in Settings
(`src/features/settings/PinManagementSection.tsx`), which uses the same
`src/lib/pin.ts` helpers (`hasPin`, `setPin`, `verifyPin`, `clearPin`).

A real server-side check would require per-account auth round-trips and
break offline kid mode; the soft gate is the deliberate trade-off
(user-stories Epic 7).
