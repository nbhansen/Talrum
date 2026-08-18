---
type: Reference
title: Data Access & Authentication
description: Details on Talrum's authentication flow, React Query lifecycle, and data mapping.
tags: [auth, queries, mutations, react-query]
openwiki:
  roles: [domain, architecture]
  source_paths: [src/lib/auth/login.ts, src/lib/queries/boards.read.ts]
  symbols: [useMagicLink, rowToBoard]
---

# Data Access & Authentication

Talrum abstracts direct backend calls behind structured queries and a specialized authentication flow, isolating the UI components from the underlying PostgreSQL schema and Auth API.

## Authentication Flow

Talrum relies on a passwordless magic-link sign-in model rather than traditional credentials or typed one-time codes. The choice of magic links over six-digit codes ensures reliable delivery: typed codes require specific email template variable support from the authentication provider, which can easily be misconfigured or dropped, whereas a magic link is universally included.

The client application requests a magic link via Supabase Auth, and the user receives an email containing the sign-in URL. 

*   **Session Resolution**: When the user clicks the magic link, the URL contains session parameters. The Supabase client automatically detects these parameters in the URL, exchanges them for a persistent session, and updates the local state.
*   **Auth Gate**: The application's top-level router listens for session changes. Once a valid session is established, it mounts the authenticated features and unmounts the login screen.
*   **Auth Boundary Cleansing**: To ensure data privacy between different parent accounts on a shared device, all local caches (Service Worker, IndexedDB queries, and signed URLs) are completely wiped when signing in or out.

## Query Lifecycle & Data Mapping

Direct queries to the backend are not permitted within UI components. Instead, all data reads and writes flow through React Query hooks located in `src/lib/queries/`.

### Read Lifecycle

1.  **Domain Noun Grouping**: Queries are grouped by domain concepts (e.g., boards, kids, pictograms).
2.  **Mapping to Domain Types**: The raw database rows generated from the backend schema are mapped to strict frontend domain types using mapper functions. These mappers handle required type casting (since the database might return a loose string for an enum) and prepare the data for the UI components.
3.  **Hook Abstraction**: The components consume thin hooks that wrap the query logic. The data is cached globally using a long stale time, providing instant navigation once data is loaded.

### Mutation Lifecycle

Writes follow an optimistic pattern:
1.  **Optimistic Patch**: The mutation hooks immediately patch the local cache with the expected result of the mutation.
2.  **Outbox Handoff**: Rather than awaiting a direct network response, the mutation defers the actual backend work to the outbox queue, adhering to the [Offline Synchronization Model](offline-sync.md). 
3.  **Conflict Handling**: If a mutation ultimately fails (e.g., due to a concurrent edit conflict or an offline validation error), the optimistic patch is rolled back, and the UI surfaces the failure.