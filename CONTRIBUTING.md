# Contributing

Talrum has one maintainer. These rules keep the review work small.

## Before you write code

1. Find an open issue, or open one. Describe the problem, not only the change.
2. Say in the issue that you want to do the work. Wait for the maintainer to agree.

A pull request with no agreed issue is closed without review. This includes
refactors, dependency updates, format changes and README rewordings that
nobody asked for. A one-line typo correction is the only exception.

## Setup

Follow the [Quick start](./README.md#quick-start) in the README.

## Checks

Run these before you push. CI runs the same checks.

```sh
npm run typecheck
npm run lint && npm run lint:css && npm run lint:comments
npm run test
npm run test:db        # only if you changed supabase/
```

After a migration change, run `supabase db reset && npm run types:db` and
commit the migration and `src/types/supabase.ts` together.

## Pull request rules

- Branch from `main`. A pull request on a different base fails `pr-hygiene`.
- One issue for each pull request. Write `Closes #<number>` in the text.
- Change only what the issue needs.
- For a defect, add a test that fails before your change.
- Tools that write code are permitted. You must run the code, and you must be
  able to explain each line. Do not put AI-session links or AI co-author
  trailers in commits or in the pull request text; `pr-hygiene` rejects them.
- The maintainer squash-merges.

[AGENTS.md](./AGENTS.md) has the full code rules. They apply to people too.

## Security defects

Do not open a public issue. See [SECURITY.md](./SECURITY.md).
