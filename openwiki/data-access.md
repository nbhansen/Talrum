---
type: Reference
title: Data Access & Authentication
description: Details on Talrum's authentication flow, React Query lifecycle, and data mapping.
tags: [auth, queries, mutations, react-query]
openwiki:
  roles: [domain, architecture]
  source_paths: [src/lib/auth/login.ts, src/lib/queries/boards.read.ts]
  symbols: [useEmailCode, rowToBoard]
---

# Data Access & Authentication

Talrum abstracts direct backend calls behind structured queries and a specialized authentication flow, isolating the UI components from the underlying PostgreSQL schema and Auth API.

## Authentication Flow

Talrum relies on an email one-time code sign-in model rather than traditional credentials or magic links. The choice of typed codes over magic links ensures a reliable experience for users who install Talrum as a Home Screen app (PWA), because standard URLs from email clients often fail to open the installed app and instead open a new browser tab. 

The client application requests a one-time code via Supabase Auth, and the user receives an email containing a code they can type directly into the app. Alternatively, users who already have an unused code can enter it immediately without triggering a new email.

*   **Session Resolution**: When the user types the code, the client verifies it with Supabase to establish a persistent session and update the local state.
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