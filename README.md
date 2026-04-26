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

Open the URL Vite prints (usually `http://localhost:5173`). You'll get a login
screen — enter any email, then grab the 6-digit OTP from Mailpit at
`http://127.0.0.1:54324` (Supabase ships Mailpit as the local SMTP catch-all).
See `docs/auth.md` for the full flow. Supabase Studio is at
`http://127.0.0.1:54323` if you want to poke around the DB.

## Day-to-day commands

| What                                                  | How                  |
| ----------------------------------------------------- | -------------------- |
| Dev server                                            | `npm run dev`        |
| Typecheck                                             | `npm run typecheck`  |
| Lint (zero warnings allowed)                          | `npm run lint`       |
| Run tests once                                        | `npm run test`       |
| Watch tests                                           | `npm run test:watch` |
| Format                                                | `npm run format`     |
| Reset DB + reseed                                     | `supabase db reset`  |
| Regenerate `src/types/supabase.ts` from the DB schema | `npm run types:db`   |

## How the codebase is organised

```
src/
  app/          # App shell, router, AuthGate, SessionProvider, SW update prompt
  theme/        # CSS custom properties + typed token re-exports
  types/        # Domain types + generated supabase.ts (regenerated, do not edit)
  glyphs/       # Typed glyph union + Glyph component
  ui/           # Domain-agnostic primitives (Button, Chip, Modal, PictoTile,
                #   KidModeGate + PinPad, …)
  layouts/      # ParentShell, TalrumLogo, KidModeLayout
  lib/
    supabase.ts        # Client singleton (real Supabase auth, see docs/auth.md)
    queryClient.ts     # react-query defaults + persistence
    auth/              # SessionContext + consumer hooks (provider stays in app/)
    queries/           # READ hooks + mutation hooks — the only data path for features
    outbox/            # Write queue: optimistic online, persisted offline
  features/
    login/             # Email OTP sign-in screen
    parent-home/       # Board library screen
    board-builder/     # Board editor screen + ShareModal
    pictogram-picker/  # Picker modal used by the builder
    kid-sequence/      # PECS tile strip
    kid-choice/        # 3-up choice picker

supabase/
  config.toml           # CLI config
  migrations/           # *.sql, applied in timestamp order
  seed.sql              # Demo boards + pictograms loaded by `supabase db reset`
  tests/                # pgTAP regression tests, run via `npm run test:db`

scripts/
  gen-icons.ts          # generates the PWA icon variants

docs/
  auth.md               # email-OTP sign-in flow + how to read OTPs in local dev
```

### Tips

- If the app boots blank or the network tab shows Supabase 500s, run
  `supabase status` to confirm the stack is up. `supabase stop` + `supabase
start` is the restart path.
- After any migration edit, run `supabase db reset` (applies migrations +
  seed) and `npm run types:db` (regenerates DB types). Commit both the
  migration and the updated `src/types/supabase.ts`.
- Seed data lives in `supabase/seed.sql` (demo boards + pictograms loaded by
  `supabase db reset`). Edit it directly.

## Architecture rules

This codebase follows
[bulletproof-react](https://github.com/alan2207/bulletproof-react) with
project-specific tweaks for Supabase + offline-first AAC. Read this section
before adding code. Items tagged **TODO** are tracked as open GitHub issues.

### Layering: shared → features → app

Imports flow one way only:

```
shared (lib, ui, theme, types, glyphs, layouts)  →  features  →  app
```

- Shared modules MUST NOT import from `features/` or `app/`.
- Features MUST NOT import from sibling features. Compose features at the
  route/app layer instead.
- Anything two features share lives in `lib/`, `ui/`, or `layouts/`.
- A "feature" with no domain logic that just wraps other content (kid-mode
  shell, PIN gate, modal/picker) belongs in `layouts/` or `ui/`, not
  `features/`.

Cross-feature imports and reverse imports from `app/` are enforced by
`no-restricted-imports` in `eslint.config.js` (see the three layering blocks).
Tests and `*Route.tsx` files are exempt — routes are the composition layer.

**TODO:** add an ESLint guard for direct `supabase.from(...)` calls from
`features/*` (the real "single read path through `lib/queries/*`" guard).

### Per-feature scope

Each `src/features/<name>/` is independent and may include `*.tsx` components,
`*.test.tsx`, `*.module.css`, a route entry component
(`<Name>Route.tsx`), and feature-local helpers. A feature MUST NOT publish a
barrel (`index.ts`) re-exporting its internals — import the file directly.
Vite tree-shaking prefers it.

### Single read and write paths

- All DB reads go through `src/lib/queries/*` — strongly typed React Query
  hooks. Feature code never calls `supabase.from(...)` directly.
- All DB writes go through the outbox (`src/lib/outbox`). Each domain entity
  exposes mutation hooks in `lib/queries/<entity>.ts` that call
  `enqueueAndDrain` under the hood. The outbox optimistically applies online
  and persists offline.
- `src/types/supabase.ts` is generated and only read inside
  `lib/queries/*` row-to-domain mappers. Everything else sees clean domain
  types from `src/types/domain.ts`.

### State

- **Component state** → `useState` / `useReducer`, kept where it's read.
- **Server cache** → React Query (`@tanstack/react-query`), persisted via
  `idb-keyval` for offline. See `src/lib/queryClient.ts`.
- **App state** (auth session, online status) → context provider in `app/`
  (e.g. `SessionProvider`). No Redux, no global stores.
- **URL state** → React Router `useParams` / `useSearchParams`. Anything
  shareable belongs in the URL.
- **Form state** → `useState` is fine for our small forms; introduce React
  Hook Form only when a single form has 5+ fields with cross-field validation.

### Components & styling

- Component file names use **PascalCase** (`Button.tsx`,
  `BoardBuilder.tsx`); their containing folder under `ui/` matches
  (`ui/Button/Button.tsx`). Non-component modules use **camelCase**
  (`formatUpdated.ts`, `useOnline.ts`). Feature folders use **kebab-case**
  (`board-builder/`). _Project deviation from bulletproof-react's universal
  kebab-case file rule — PascalCase for components matches the JSX export._
- One named export per component file. Avoid default exports.
- Styling is **CSS Modules** (`*.module.css`) with shared design tokens in
  `src/theme/tokens.module.css` and re-exported as typed values from
  `src/theme/tokens.ts`. No runtime CSS-in-JS.
- Keep components, hooks, and styles colocated with where they're used. Lift
  to `ui/` only after a second consumer needs it.

### API layer

- Single Supabase client in `src/lib/supabase.ts`, configured once.
- Each domain entity gets one file under `lib/queries/`
  (`boards.ts`, `pictograms.ts`, `board-members.ts`) exporting:
  - `rowTo<Domain>(...)` — generated row → domain mapper
  - Query keys (`boardsQueryKey`, `boardQueryKey(id)`)
  - Read hooks (`useBoards`, `useBoard`)
  - Mutation hooks (`useRenameBoard`, …) wrapping `enqueueAndDrain`

### Testing

- **Vitest** + **Testing Library** + **fake-indexeddb**. Tests live next to
  source: `Foo.tsx` ↔ `Foo.test.tsx`.
- Test what a user sees: prefer `getByRole` / `findByText`. Don't assert on
  internal state, prop shapes, or class names.
- Prefer integration tests over unit tests where practical — render a route
  with the real query client + a mocked Supabase, drive it with `userEvent`.
- DB regressions go in `supabase/tests/*.sql` (pgTAP), run via
  `npm run test:db`.

### Errors & boundaries

- Network errors are surfaced through React Query state; never swallow them.
- Render-time crashes are caught by `<ErrorBoundary>` (`src/ui/ErrorBoundary/`)
  at two layers: an app-root boundary around `<RouterProvider>` and a
  per-route boundary inside `routes.tsx` with parent / kid fallback variants.
  A crash in one route never blanks the whole app.
- **TODO:** add production error tracking (Sentry or similar). When that
  lands, hook `componentDidCatch` in `ErrorBoundary` to forward to it.

### Performance

- Each route in `src/app/routes.tsx` is loaded via `React.lazy` and wrapped
  in `<Suspense>` (parent variant: small spinner; kid variant: empty
  black-shell shell). Initial load only ships the route the user is on.
- Memoize only when profiling shows it matters. Default to plain components.
- Heavy work (image resizing, audio recording) lives in
  `src/lib/{image,audio,recording}.ts` so feature code stays render-fast.
- The PWA service worker caches storage URLs by path-without-token so
  signed-URL rotation doesn't fragment the cache (see `vite.config.ts`).

### Security

- All secrets via `import.meta.env.VITE_*` — never committed. The only env
  template is `.env.example`.
- The Supabase **anon key** is the only credential the client holds; row-level
  security in `supabase/migrations/*` is the actual access boundary. Treat
  every client-side check as UX, not a security boundary.
- Never use `dangerouslySetInnerHTML`. User-supplied text (board names,
  pictogram labels) is rendered as text only.

### CI & hooks

- `.github/workflows/ci.yml` runs `typecheck`, `lint`, and `test` on every PR
  and push to `main`. The pgTAP suite (`npm run test:db`) is not in CI yet;
  it needs Docker + the Supabase CLI in the runner.
- `husky` + `lint-staged` run on `git commit`: ESLint with
  `--max-warnings 0` on staged `*.ts`/`*.tsx`, Prettier on staged
  `*.{ts,tsx,json,md,css}`, and a project-wide `npm run typecheck`.

## Project philosophy

Non-negotiables: clean code, DRY, strict TypeScript. Prefer editing an
existing file to creating a new one; prefer deleting dead code to leaving it.
