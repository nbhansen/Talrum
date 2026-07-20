---
type: Reference
title: Quickstart & Overview
description: High-level overview of the Talrum AAC web application, its purpose, and navigation guide for the OpenWiki system.
tags: [quickstart, overview, documentation, onboarding]
---

# Talrum OpenWiki: Quickstart & Overview

Talrum is a low-stim, offline-capable AAC (Augmentative & Alternative Communication) web application built for non-verbal autistic children and their caregivers. It acts as a digital version of the traditional picture exchange communication system. Parents build simple, structured picture boards, and children tap on visual cards to communicate their needs or make choices.

## Application Philosophy

Most AAC applications are busy with menus, badges, and colors. For a child who is easily overstimulated, this can lead to distress and rejection of the tool. Talrum aims to be as calm as physical paper cards but shareable, speakable, and robust against network failures.

*   **Parent Mode:** Caregivers build or edit boards, upload custom pictures, record audio prompts, and manage visibility toggles.
*   **Kid Mode:** A tap-only, zero-decoration, distraction-free environment optimized for a tablet in landscape mode. Tapping a card plays recorded audio or uses text-to-speech.

## System Prerequisites

To run the Talrum workspace locally, developers will need a modern JavaScript runtime, a container engine, and the command-line tools for the backend platform to emulate the database, authentication, and storage services. The specific commands and environment setup steps are detailed in the repository's main documentation.

## Code Wiki Navigation

To understand the deeper architecture, workflows, and operational procedures of Talrum, explore the canonical sections of this OpenWiki:

*   **[System Architecture](architecture.md):** The strict 6-layer frontend boundary system, static analysis import guards, and the backend data model.
*   **[Offline Synchronization Model](offline-sync.md):** The optimistic UI caching layer, the outbox queue, first-in-first-out replay, and conflict handling.
*   **[Kid Mode & Speech Subsystem](kid-mode-speech.md):** The client-side PIN gate, the distraction-free interface, and the text-to-speech voice resolution.
*   **[Operations & Quality Verification](operations-testing.md):** The database and frontend testing layouts, build verification checks, and pointers to the operational runbooks.

## Backlog

All identified domains and subsystems are currently documented. There are no deferred backlog items.
