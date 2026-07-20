---
type: Reference
title: Kid Mode & Speech Subsystem
description: Explanation of the tap-only child interface, the soft PIN gate, and the text-to-speech implementation.
tags: [kid-mode, speech, tts, accessibility, pin-gate]
---

# Kid Mode & Speech Subsystem

Talrum is split into two distinct environments: a configuration interface for caregivers and a low-stimulus communication interface for children, which operate within the strict boundaries defined in the [Architecture Overview](architecture.md).

## Kid Mode Interface

The child interface is built to occupy the entire screen, optimized for a tablet in landscape orientation. It is entirely tap-driven and devoid of complex navigation, spinners, or extraneous badges to prevent sensory overstimulation, relying on the [Offline Synchronization Model](offline-sync.md) to instantly resolve interactions. 

To prevent accidental exits into the configuration screens, Kid Mode is protected by a client-side PIN gate. The PIN is hashed before being stored in the browser; it is intended only as a soft boundary to keep a child within the communication interface, not as a cryptographically secure authorization measure.

## Speech Synthesis

When a card is tapped, the application plays auditory feedback. Caregivers can record custom audio prompts, which take precedence. If no custom recording is provided, the application falls back to the browser's native text-to-speech engine.

Because fetching available system voices can be asynchronous, the application caches its preferred voice selection. A heuristic is used to pick an appropriate voice based on the chosen language, falling back to English if necessary. It explicitly favors high-quality system voices typical of the target tablet operating system to ensure clear and consistent speech playback. Caregivers can also override the heuristic by manually selecting a preferred voice in the settings.
