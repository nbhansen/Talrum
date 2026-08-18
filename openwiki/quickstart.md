---
type: Reference
title: Quickstart & Overview
description: High-level overview of the Talrum AAC web application, its purpose, and navigation guide for the OpenWiki system.
tags: [quickstart, overview, documentation, onboarding]
openwiki:
  roles: [repository]
---

# Talrum OpenWiki: Quickstart & Overview

Talrum is a low-stim, offline-capable AAC (Augmentative & Alternative Communication) web application built for non-verbal autistic children and their caregivers. It acts as a digital version of the traditional picture exchange communication system. Parents build simple, structured picture boards, and children tap on visual cards to communicate their needs or make choices.

## Application Philosophy

Most AAC applications are busy with menus, badges, and colors. For a child who is easily overstimulated, this can lead to distress and rejection of the tool. Talrum aims to be as calm as physical paper cards but shareable, speakable, and robust against network failures.

*   **Parent Mode:** Caregivers build or edit boards, upload custom pictures, record audio prompts, or generate AI voices, and manage visibility toggles.
*   **Kid Mode:** A tap-only, zero-decoration, distraction-free environment optimized for a tablet in landscape mode. Tapping a card plays recorded audio or uses text-to-speech.

## System Prerequisites

To run the Talrum workspace locally, developers will need a modern JavaScript runtime, a container engine, and the command-line tools for the backend platform to emulate the database, authentication, and storage services. The specific commands and environment setup steps are detailed in the repository's main documentation.

## Change Routing & Navigation

Use the table below to find the correct architecture overview, entry points, and validation commands for typical development tasks.

| Change Area | Relevant Wiki Page | Source Entry Points | Important Symbols | Focused Tests | Minimal Validation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Frontend Architecture & Layouts** | [Architecture](architecture.md) | `eslint.config.js`, `src/app/`, `src/features/` | Layers (App, Features, Widgets, UI, Lib) | `scripts/verify-boundaries.mjs` | `npm run lint:boundaries` |
| **Offline Sync & Storage** | [Offline Sync](offline-sync.md) | `src/lib/outbox/`, `src/lib/storage/` | `signedUrlFor`, `clearPersistedCache` | `src/lib/storage/storage.test.ts` | `npm run test -- storage.test.ts` |
| **Kid Mode UI & PIN Gate** | [Kid Mode & Speech](kid-mode-speech.md) | `src/widgets/KidModeGate/`, `src/lib/kidCopy.ts` | `KidModeGate`, `pinThrottle` | `KidModeGate.test.tsx` | `npm run test -- KidModeGate` |
| **Speech & Audio (TTS/Recording)** | [Kid Mode & Speech](kid-mode-speech.md) | `src/lib/platform/speech.ts`, `src/lib/platform/audio.ts` | `speakPictogram`, AI generated functions | `src/lib/platform/audio.test.ts` | `npm run test -- platform` |
| **Database & RLS Policies** | [Operations & Testing](operations-testing.md) | `supabase/migrations/`, `supabase/tests/` | RLS triggers, `pgTAP` files | `supabase/tests/*.sql` | `supabase test db` |
| **Data Access & Auth** | [Data Access](data-access.md) | `src/lib/queries/`, `src/lib/auth/` | `useMagicLink`, `rowToBoard` | `login.test.tsx`, `boards.read.test.ts` | `npm run test -- queries` |
| **Backend Edge Functions** | [Operations & Testing](operations-testing.md) | `supabase/functions/` | `generate-image`, `generate-voice` | `supabase/functions/*/handler.test.ts` | `deno test` inside function dir |

To understand the deeper architecture, workflows, and operational procedures of Talrum, explore the linked canonical sections of this OpenWiki above.

## Backlog

For project backlog and roadmap items, refer to `docs/user-stories.md` and the GitHub issue tracker.
