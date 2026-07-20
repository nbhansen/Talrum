---
type: Reference
title: Quickstart & Overview
description: High-level overview of the Talrum AAC web app, system requirements, local developer setup, core commands, and navigation guide for the OpenWiki system.
resource: /README.md
tags: [quickstart, documentation, onboarding, commands]
---

# Talrum OpenWiki: Quickstart & Overview

Talrum is a low-stim, offline-capable **AAC (Augmentative & Alternative Communication)** web application built for non-verbal autistic children and their caregivers. It acts as a digital version of the traditional PECS (Picture Exchange Communication System). Parents and caregivers build simple, structured picture boards, and children tap on visual cards (pictograms) to communicate their needs or make choices.

## Visual & Interaction Concept

*   **Parent Mode:** Caregivers build or edit boards, import or upload custom pictograms, record audio prompts, configure visibility parameters (like labels-visible and kid-reorderable toggles), and manage permissions for other board editors or viewers.
*   **Kid Mode:** Tap-only, zero-decoration, distraction-free environment optimized for an iPad in landscape (1194 × 834 viewport). When a child taps a card, the system plays back recorded audio or synthesizes text using Web Speech synthesis. There are no spinners, complex menus, or badges that could cause sensory overstimulation.

---

## Local Developer Setup

### System Prerequisites
To run the Talrum workspace locally, you need:
- **Node.js**: Version 22 or higher
- **Docker**: For local Postgres, Auth, and Storage emulation via the Supabase CLI
- **Supabase CLI**: For local environment containerization, migration management, and database type generation

### Onboarding Steps
Follow these steps to initialize and run Talrum on your machine:

1.  **Clone the Repository and Install Dependencies:**
    ```bash
    git clone <repository-url> && cd Talrum
    npm install
    ```
2.  **Configure Environment Variables:**
    Copy the sample configuration file to establish local environment defaults:
    ```bash
    cp .env.example .env.local
    ```
3.  **Launch the Local Supabase Services:**
    Start the local Supabase stack. This will provision Postgres, Auth, local Storage buckets, and Studio via Docker:
    ```bash
    supabase start
    ```
    *Note: The local Mailpit SMTP server (used to grab OTP codes) will be hosted at <http://127.0.0.1:54324>, and Supabase Studio will run at <http://127.0.0.1:54323>.*
4.  **Reset and Seed the Database:**
    Apply migrations and seed the database with four default demo boards:
    ```bash
    supabase db reset
    ```
5.  **Run the Development Server:**
    Start Vite's local dev server:
    ```bash
    npm run dev
    ```

---

## Core Operational Commands

Use the following commands to develop, lint, typecheck, test, and manage Talrum:

| Command | Action |
| :--- | :--- |
| `npm run dev` | Starts the local Vite development server |
| `npm run typecheck` | Runs the TypeScript compiler check across the frontend and scripts |
| `npm run lint` | Runs ESLint for syntax checks and strict architectural boundary enforcement |
| `npm run lint:css` | Runs Stylelint to block hex colors and raw pixel padding/margin values |
| `npm run test` | Executes the Vitest unit and integration test suite |
| `npm run test:db` | Runs local pgTAP database tests through the Supabase CLI |
| `npm run format` | Runs Prettier to enforce consistent code formatting |
| `supabase db reset` | Recreates the local DB schema and applies the database seed (`supabase/seed.sql`) |
| `npm run types:db` | Regenerates the TypeScript interface types file (`src/types/supabase.ts`) |

---

## Code Wiki Navigation

To understand the deeper architecture, workflows, and operational procedures of Talrum, explore the canonical sections of this OpenWiki:

*   **[System Architecture](architecture.md):** Analyzes the strict 6-layer frontend boundary system, ESLint-enforced import guards, Supabase client isolation, and the secured PostgREST schema pattern.
*   **[Offline Synchronization Model](offline-sync.md):** Examines the optimistic UI caching layer, IndexedDB-backed ULID outbox queue, first-in-first-out (FIFO) replay with Web Locks, conflict handling, and the auth-boundary data wipe.
*   **[Kid Mode & Speech Subsystem](kid-mode-speech.md):** Details the secure SHA-256 PIN gate, specialized choice and sequence board views, voice/TTS resolution splits, and custom parent audio recording uploads.
*   **[Operations & Quality Verification](operations-testing.md):** Outlines the GDPR-compliant account deletion procedures, the deployment and migration CI pipeline ordering, pgTAP/Vitest test layouts, and post-build CSS verification checks.

## Backlog

All identified domains and subsystems are fully documented. There are no deferred backlog items.
