# Runbook: deploy and secrets

How CI deploys Postgres migrations and edge functions, what secrets it
needs, and how to do it by hand if the workflows are broken.

## Required GitHub secrets

Set on the repo with `gh secret set <NAME> --repo nbhansen/Talrum`. CI
reads them in `.github/workflows/deploy-migrations.yml` and
`.github/workflows/deploy-functions.yml`.

| Secret | Used by | Source |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | `deploy-migrations.yml`, `deploy-functions.yml` | dashboard → Account → Access Tokens |
| `SUPABASE_DB_PASSWORD` | `deploy-migrations.yml` | dashboard → Project settings → Database |
| `SUPABASE_PROJECT_REF` | `deploy-migrations.yml`, `deploy-functions.yml` | dashboard → Project settings → General |

## Required edge-function secrets (one-time per project)

Edge functions need `SUPABASE_SERVICE_ROLE_KEY` to perform privileged
operations (notably the `delete-account` function, which uses the admin
API to delete `auth.users` rows after verifying the caller's JWT).

This is **not** stored in CI. Set it directly against the Supabase
project:

```sh
supabase secrets set --project-ref <ref> \
  SUPABASE_SERVICE_ROLE_KEY=<value>
```

Source the value from dashboard → Project settings → API → `service_role`
key. Treat it like a root credential: never commit it, never paste it
into chat, never set it as a GitHub Actions secret (functions read it
from Supabase's own secret store, not from CI).

## Rotation procedure for `SUPABASE_SERVICE_ROLE_KEY`

1. Copy the new value from dashboard → Project settings → API.
2. Push it to Supabase:
   ```sh
   supabase secrets set --project-ref <ref> \
     SUPABASE_SERVICE_ROLE_KEY=<new-value>
   ```
3. Functions are stateless. The next invocation picks up the new value;
   no redeploy is required.
4. Verify end-to-end by running the delete-account E2E:
   ```sh
   npm run test:e2e:delete-account
   ```
   Run against staging if available; otherwise run after a manual
   sign-up against the rotated project.

## Manual fallback if workflows are broken

You can always deploy from a developer machine. Make sure
`SUPABASE_ACCESS_TOKEN` is set in your local environment first
(`export SUPABASE_ACCESS_TOKEN=<token>`).

- **Migrations:**
  ```sh
  supabase db push --linked
  ```
- **Functions:**
  ```sh
  supabase functions deploy delete-account --project-ref <ref>
  ```

Both commands target the project `supabase link` is currently bound to,
so verify with `supabase status` or `supabase projects list` before
running them in anger.

## Local Deno setup (for editing edge functions)

The edge functions run on Deno. Local devs without Deno installed
cannot run `deno test` or `supabase functions serve`. Install it once:

```sh
# Install Deno (one-shot, official installer).
curl -fsSL https://deno.land/install.sh | sh
```

Add it to `PATH` in your shell rc:

```sh
export PATH="$HOME/.deno/bin:$PATH"
```

`supabase functions serve` will use this Deno when invoked locally. CI
installs Deno via `denoland/setup-deno@v2` (already wired in Phase E),
so you don't need to do anything extra for CI runs.
