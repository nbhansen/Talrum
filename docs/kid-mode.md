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

## No PIN, no kid mode

A device with no PIN cannot enter kid mode at all. `wrap(el, 'kid')` in
`src/app/routes.tsx` renders `RequireKidPin`, which redirects to
`/settings?pin=required` when `kidModeNeedsPinSetup()` is true. The guard
lives in the `'kid'` variant of `wrap` rather than inside each kid route so
that a third kid route inherits it automatically, and so it runs before the
route's own hooks fetch a board.

That covers every way in, which is the point — there are three, and only one
of them is a button: the sidebar `KID` button (via `useKidModeNav`),
`BoardBuilder`'s own hardcoded launch into the board being edited, and
`ParentHomeRoute`'s once-per-session auto-launch into the last board.
Auto-launch checks the precondition itself as well, so a device without a PIN
lands on parent home instead of bouncing through a kid route into Settings.

This is the fix for #353. The gate used to create a PIN on demand: with none
stored, the first exit tap opened a two-step setup flow, so a child could
choose `1111`, confirm it, and land in the board builder — the screen with a
Remove button on every step. A gate that hands out keys to whoever asks first
is not a gate.

Consequence worth knowing: signing out wipes the PIN along with the rest of
device state (`clearPin` in `src/lib/queryClient.ts`), so kid mode is
unavailable after a sign-in until a PIN is set again. That is the correct
default — a fresh device should not inherit a one-way door it has no key to —
but it means "set the PIN" belongs in the hand-over checklist for a new
device.

So **the PIN is only ever created in parent UI**: Settings → Parent PIN →
*Set a PIN* (`src/features/settings/PinManagementSection.tsx`), which also
handles Change and Clear via the same `src/lib/pin.ts` helpers (`hasPin`,
`setPin`, `verifyPin`, `clearPin`). Clearing the PIN makes kid mode
unavailable again, and the confirm prompt says so.

## How the gate works

`KidModeGate` (`KidModeGate.tsx`) wraps each kid-mode route via a render
prop: `children(requestExit)` renders the kid screen and hands it an exit
trigger. Calling `requestExit` opens a `PinPad` modal to **verify**: one
correct entry confirms the exit. There is no other flow — the gate never
writes a PIN.

One deliberate exception: if no PIN exists when exit is requested, the gate
lets the parent out instead of opening a pad no entry could satisfy. The route
guard means kid mode should never have opened in that state, but it is still
reachable by clearing the PIN in another tab while this one sits in kid mode,
and trapping the parent there would be worse. Reaching it otherwise needs
devtools, which the threat model above already excludes.

All strings shown by the gate come from `getKidCopy()` — kid-visible copy
is centralized in `src/lib/kidCopy.ts` (see [speech.md](./speech.md)). Only
the verify strings live there; the PIN-creation copy is parent-facing and
English-only, alongside the rest of Settings.

A real server-side check would require per-account auth round-trips and
break offline kid mode; the soft gate is the deliberate trade-off
(user-stories Epic 7).
