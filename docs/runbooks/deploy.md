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

## Edge function default secrets — no manual bootstrap

Hosted edge functions automatically receive these env vars on every
invocation, per Supabase's
[default secrets](https://supabase.com/docs/guides/functions/secrets#default-secrets)
contract:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`

The `delete-account` function reads `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` from `Deno.env` to construct the admin
client. **Do not** run `supabase secrets set` for any of these — they
are managed by Supabase. If the service-role key is rotated in the
dashboard (Project settings → API → "Reset service_role key"), the
runtime picks up the new value on the next invocation; no redeploy
or CLI action on our side.

Custom (non-default) secrets a function might need — e.g., a
`STRIPE_SECRET_KEY` — go through `supabase secrets set` as documented
upstream. The `delete-account` function has no custom secrets today.

### Verifying the deployed function is running

Smoke-check the function with no Authorization header. The handler
returns its closed-set 401 when the JWT is missing or the user is not
a real user (e.g., when sending the `anon` JWT). A 200 / 401 from our
own handler proves the runtime resolved env vars and booted; a 500
suggests the runtime failed to start.

```sh
APIKEY="$(gh api ... or paste publishable key)"  # safe to share
USER_JWT="..."                                    # any project JWT works
curl -sS --max-time 5 -o /dev/null -w 'HTTP %{http_code}\n' \
  -X POST \
  -H "apikey: $APIKEY" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  --data '{}' \
  "https://<project-ref>.supabase.co/functions/v1/delete-account"
```

Expected: `HTTP 401`.

### Local development

`supabase functions serve` does **not** auto-inject default secrets.
For local invocation, populate `supabase/functions/.env.local` (gitignored)
with values from `supabase status -o env`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<from supabase status>
```

Then: `supabase functions serve delete-account --env-file supabase/functions/.env.local`.
This is what `npm run test:e2e:delete-account` and CI both rely on.

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
