---
type: Reference
title: Offline Synchronization Model
description: Details on Talrum's offline-first architecture, optimistic UI caching, IndexedDB outbox queue, and conflict handling.
tags: [offline, sync, indexeddb, optimistic-ui, queue]
---

# Offline Synchronization Model

Talrum is designed for environments where network connectivity may be spotty or entirely absent. Because even a brief loading state could cause distress for the user, particularly within the [Kid Mode & Speech Subsystem](kid-mode-speech.md), all data mutations are designed to resolve instantly in the UI.

## Optimistic UI and the Outbox Queue

When a mutation occurs (like updating a board or adding a new pictogram), the change is immediately applied to the local optimistic cache. This ensures the user interface never blocks on a network request. 

Concurrently, the application attempts a fast path: if the network is available, it pushes the change directly to the backend. If the application is offline or the network request fails, the mutation payload is serialized and placed into an outbox queue backed by IndexedDB. 

## The Drain Loop and Replay

Mutations stored in the outbox are assigned a unique lexicographically sortable identifier to maintain strict time-ordering. A background drain process constantly monitors the queue and network status. Once connectivity is restored, the drain loop flushes pending entries in a first-in, first-out (FIFO) order. 

To prevent concurrent drain loops from executing simultaneously across multiple browser tabs, the system employs cross-tab locking via the Web Locks API.

## Conflict Handling

To prevent silent overwrites when multiple devices edit the same board concurrently, updates are guarded by checking the backend's last known update timestamp. If a patch attempts to modify a board that has been changed on the server since the local device last synced, the mutation will intentionally fail. 

Failed entries remain in the outbox queue and surface in the UI as errors. The optimistic state is rolled back for permanent errors (like validation rejections or concurrency conflicts enforced by the backend policies defined in the [Architecture Overview](architecture.md)), requiring the user to explicitly retry or discard their changes.
