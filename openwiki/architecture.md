---
type: Reference
title: Architecture Overview
description: Overview of the Talrum web application architecture, the six-layer frontend boundary system, and backend integration.
tags: [architecture, frontend, supabase, boundaries]
---

# Architecture Overview

Talrum is a single-page React application that relies on Supabase for its backend, encompassing a PostgreSQL database, authentication, and blob storage. The application is built for an offline-first experience, ensuring that typical usage works even in unstable network conditions, which is detailed in the [Offline Synchronization Model](offline-sync.md).

## Frontend Layering System

The frontend codebase enforces a strict six-layer architecture to prevent circular dependencies and maintain clean boundaries. A given layer may import from any layer beneath it, but never from a layer above it. The boundaries are enforced by static analysis tools configured in the repository root, as part of the broader [Operations & Quality Verification](operations-testing.md) strategy.

From top to bottom, the layers are:

1. **App**: The entrypoint and routing layer. It defines top-level routes and brings features together.
2. **Features**: Domain-specific modules and screens.
3. **Shared**: Reusable functional blocks and structural layouts that span multiple features.
4. **UI**: Core components and generic building blocks.
5. **Library & Glyphs**: Helper utilities, data fetching logic, client instances, and icon assets.
6. **Tokens**: The lowest level, containing design tokens and shared TypeScript definitions.

The ESLint configuration explicitly enforces these unidirectional import rules.

## Backend Integration

The backend is fully provided by Supabase. The React application communicates directly with the database through PostgREST. The data model utilizes PostgreSQL constraints and row-level security (RLS) policies to enforce permissions, ensuring that caregivers only see and modify their own boards and resources.

Database schema definitions, types, and migrations are managed via the Supabase CLI, and TypeScript types are regenerated automatically when the schema is updated.
