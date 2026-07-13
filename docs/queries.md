# lib/queries: lifecycle of a read (and where writes begin)

Every DB read in Talrum goes through a react-query hook in `src/lib/queries/*`
— features and routes never call `supabase.from()` directly.
Every write *starts* here too: the mutation hooks own the optimistic cache
patch, then hand the actual network work to the outbox (see `docs/outbox.md`)
or, for a small set of creates, to Supabase directly. This page is the
template to copy when adding new data access.

## The shape of a file

One file per domain noun. When a file grows both reads and mutations, split
it (`boards.read.ts` + `boards.mutations.ts`) and keep a barrel (`boards.ts`)
re-exporting both so existing import sites don't churn. Smaller domains
(`kids.ts`, `board-members.ts`) stay single-file. Inside, the pattern is:

- **A query-key const or factory at module level.** `boardsQueryKey`
  (`['boards'] as const`) for lists, `boardQueryKey(id)` for per-row keys.
  Exported — mutation files and tests reference the same constant, never a
  re-typed literal.
- **A private `fetchX` helper** that calls supabase, does
  `if (error) throw error`, and maps rows.
- **An exported `rowToX` mapper** narrowing the generated `Database` row type
  (snake_case, `string`, nullable) into the domain type in `src/types/domain`.
  Casts are documented where they're safe — `rowToBoard` can cast `kind`
  because writes only ever supply domain-typed values; `rowToPictogram` leans
  on the init migration's CHECK constraints.
- **A thin `useX` hook**: `useQuery({ queryKey, queryFn })` and nothing else.

Global defaults live in `src/lib/queryClient.ts`: `staleTime: 30_000`,
`retry: 1`, no refetch-on-focus — AAC use is calm, an iPad tap away shouldn't
churn. Rely on them. Override per-query only with a written reason: `useBoard`
in `boards.read.ts` supplies a custom `retry` because PGRST116 (the `.single()`
not-found/RLS-hidden error) is terminal — retrying the same UUID gives the
same answer — while transient network errors still deserve retries. That kind
of comment is the price of an override.

## Mutations: the optimistic lifecycle

Mutation hooks pair with the outbox in a fixed choreography, and
`useBoardPatch` in `boards.mutations.ts` is the model to copy:

1. **`onMutate`**: cancel in-flight queries for the key, snapshot the current
   cache value, write the expected result in, return `{ previous }`.
2. **`mutationFn`**: `enqueueAndDrain({ kind: ..., ...payload })`. It resolves
   once the write lands (online fast path) or is durably queued (offline);
   it rejects only on *permanent* failures — RLS, validation (#279 covers
   the fast-path rules).
3. **`onError`**: restore the snapshot from context. Transient network errors
   never reach here — the outbox absorbs them and the optimistic patch stands.
4. **`onSettled`** (or `onSuccess`): invalidate every key the write touched —
   per-id *and* list — so the next refetch reconciles with the server.

Every public board mutation (`useRenameBoard`, `useSetVoiceMode`, …) is a
three-line wrapper over `useBoardPatch`, which also threads the board's
`serverUpdatedAt` into the entry as the conflict-guard baseline (#281).
Mutations that touch two caches (`useDeletePictogram`, `useDeleteKid`)
snapshot, patch, roll back, and invalidate both.

## Choosing a write path

The most important decision when adding a mutation. Three legitimate
patterns:

**Outbox (the default).** Field edits, renames, reorders, deletes — anything
where the row already exists and the user shouldn't be blocked by a flaky
connection. `useRenameKid`, `useSetStepIds`, `useDeletePictogram`. If your
write mutates existing state, it goes here: new entry kind in
`outbox/types.ts`, handler in `outbox/handlers.ts`, hook following
`useBoardPatch`.

**Direct Supabase writes for creates.** `useCreateBoard`, `useCreateKid`,
`useAddBoardMember` / `useRemoveBoardMember` insert directly, no outbox, no
optimistic patch — just `onSuccess` invalidation. The rationale, from the
comments at those sites: create-then-navigate needs the row to *actually
exist on the server* before routing into it (a board must exist before the
BoardBuilder opens on it; a kid must exist before a board's `kid_id` can
point at it), and RLS denials should surface at call time, not at drain time
when the user has long since moved on. Board sharing adds its own reason:
it's rare and low-throughput, and failing loudly when offline is fine — the
user re-pastes the ID later.

**Outbox creates, when a file is involved.** `useCreatePhotoPictogram` is a
create that goes through the outbox anyway, because the upload (a `Blob` to
Storage plus the row insert) is exactly what the queue exists for: it must
survive going offline mid-flight and replay. The hook generates the UUID
client-side, plants a local `blob:` URL for instant render, and lets the
drain replace it with the real signed path (`useSetPictogramAudio` and
`useReplacePictogramImage` follow the same blob-URL dance).

The test: does the caller need the server's answer *right now* (navigation,
a returned row, an RLS verdict)? Direct write. Otherwise outbox — and if
there's a file attached, outbox even for creates.

## Adding a new query or mutation

1. Pick the file by domain noun; split read/mutations + barrel only when it
   gets crowded.
2. Export a query-key const/factory; write `fetchX` with
   `if (error) throw error` and a `rowToX` mapper.
3. Keep the hook thin; inherit the global defaults unless you can write the
   comment justifying an override (see `useBoard`).
4. For writes: choose the pattern above. Outbox writes follow the
   `useBoardPatch` lifecycle (snapshot → patch → rollback → invalidate) and
   need a `types.ts` entry kind plus an idempotent handler.
5. Invalidate every cache the write touched, including lists.
6. Colocate a `*.test.tsx` asserting what the user sees — optimistic state,
   rollback on error — not internal cache mechanics.
