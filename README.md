# Talrum

A low-stim AAC (Augmentative & Alternative Communication) web app for non-verbal
autistic kids and their caregivers — a modernised PECS. Parents build small
picture boards; kids tap pictograms to communicate or make choices.

The target surface is a full-screen iPad in landscape (1194 × 834). On desktop,
open Chrome DevTools device mode at that viewport to develop against the real
thing.

## Prerequisites

- **Node.js 22+** (the repo uses native `--experimental-strip-types` for TS scripts).
- **Docker**, running. The Supabase CLI spins Postgres + Auth + Storage in containers.
- **Supabase CLI** — install via your package manager (`yay -S supabase-bin` on
  Arch, `brew install supabase/tap/supabase` on macOS, or grab the binary from
  <https://github.com/supabase/cli/releases>).

## First-time setup

```sh
git clone <repo>
cd Talrum
npm install
cp .env.example .env.local          # paste the keys printed by the next step
supabase start                       # boots Postgres + Auth + Studio in Docker
supabase db reset                    # applies migrations + seeds 4 demo boards
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). The app signs in
automatically as the seeded stub user — no login screen. Supabase Studio is at
`http://127.0.0.1:54323` if you want to poke around the DB.

## Day-to-day commands

| What | How |
|---|---|
| Dev server | `npm run dev` |
| Typecheck | `npm run typecheck` |
| Lint (zero warnings allowed) | `npm run lint` |
| Run tests once | `npm run test` |
| Watch tests | `npm run test:watch` |
| Format | `npm run format` |
| Reset DB + reseed | `supabase db reset` |
| Regenerate `supabase/seed.sql` from `src/data/*` | `npm run seed:gen` |
| Regenerate `src/types/supabase.ts` from the DB schema | `npm run types:db` |
| CI: seed.sql is in sync with data/*.ts | `npm run check:seed` |

## How the codebase is organised

```
src/
  app/          # App shell + router
  theme/        # CSS custom properties + typed token re-exports
  types/        # Domain types + generated supabase.ts (regenerated, do not edit)
  glyphs/       # Typed glyph union
  ui/           # Domain-agnostic primitives (Button, Chip, Modal, …)
  layouts/      # ParentShell, KidModeLayout, FullViewport
  lib/
    supabase.ts        # Client singleton + stub sign-in
    queryClient.ts     # react-query defaults
    localAuth.ts       # LOCAL_PARENT_ID (stub user uuid)
    queries/           # Read hooks — the ONLY way feature code reads data
  features/
    parent-home/       # Board library screen
    board-builder/     # Board editor + mutations.ts (the ONLY write path)
    pictogram-picker/  # Modal used by the builder
    kid-sequence/      # PECS tile strip
    kid-choice/        # 3-up choice picker
    kid-mode/          # Shared top bar

supabase/
  config.toml           # CLI config
  migrations/           # *.sql, applied in timestamp order
  seed.sql              # GENERATED — do not hand-edit; run `npm run seed:gen`

scripts/
  gen-seed.ts           # reads src/data/*.ts → writes supabase/seed.sql

docs/
  auth.md               # why auth is stubbed in Phase 2 and how Phase 3 flips it
```

### Enforced boundaries

- Feature code may **not** import from `@/data/*` (ESLint
  `no-restricted-imports`). That directory is the seed source of truth for the
  DB only; reads go through `@/lib/queries/*`, writes through
  `features/board-builder/mutations.ts`.
- The generated `src/types/supabase.ts` is only read inside the `lib/queries/*`
  row-to-domain mappers. Everything else sees clean domain types from
  `src/types/domain.ts`.

### Tips

- If the app boots blank or the network tab shows Supabase 500s, run
  `supabase status` to confirm the stack is up. `supabase stop` + `supabase
  start` is the restart path.
- After any migration edit, run `supabase db reset` (applies migrations +
  seed) and `npm run types:db` (regenerates DB types). Commit both the
  migration and the updated `src/types/supabase.ts`.
- Seed data lives in `src/data/pictograms.ts` + `src/data/boards.ts`. Edit
  there, then `npm run seed:gen` to regenerate the SQL.

## Project philosophy

Non-negotiables: clean code, DRY, strict TypeScript. Prefer editing an existing
file to creating a new one; prefer deleting dead code to leaving it.
