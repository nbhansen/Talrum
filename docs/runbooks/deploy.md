# Runbook: deploy and secrets

How CI deploys Postgres migrations and edge functions, what secrets it
needs, and how to do it by hand if the workflows are broken.

## Configuration: what is local, what is production

Each concern has exactly one source of truth per environment, and they do not overlap.

| What it controls                                                    | Local                                               | Production                                   |
| ------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------- |
| Which Supabase the **browser** talks to                             | `.env` (from `.env.example`)                        | `deploy.yml` build step, from GitHub secrets |
| The Supabase project's **auth settings** (redirect URLs, OTP, MFA…) | `supabase/config.toml`, applied by `supabase start` | **Supabase dashboard**, and only there       |
| Database **schema**                                                 | `supabase db reset`                                 | `deploy.yml` → `supabase db push --linked`   |
| Build-time secrets (`SENTRY_*`)                                     | unset; the SDK no-ops                               | GitHub secrets, gated on `SENTRY_AUTH_TOKEN` |

Two rules keep it that way:

**`supabase/config.toml` is a local dev fixture. Never run `supabase config push`.**
It writes every value in the file to the linked project at once, so a push meant to
change one field silently rewrites prod's OTP length, email confirmations and MFA
settings — that is #215, and it took a manual audit to undo. Production auth lives in
the dashboard under Authentication → URL Configuration and Providers. Nothing in CI
pushes config, and no workflow should start.

**Production is never configured by a file in this repo.** The SPA's Supabase URL and
key are injected by `deploy.yml` from GitHub secrets at build time. If you need to
change what production talks to, change the secret, not a file.

### Pointing local dev at Supabase Cloud

`npm run dev` always talks to local Supabase. To hit Cloud, copy
`.env.cloud.example` to `.env.cloud` and use the separate command:

```sh
npm run dev:cloud
```

Only that command loads `.env.cloud`, so you cannot end up writing to a real project
without asking for it in this session. Either way the dev server prints the target on
boot and shouts if it is not local. Remember there is no staging project (#98), so
`dev:cloud` writes are real user data.

## Required GitHub secrets

Set on the repo with `gh secret set <NAME> --repo nbhansen/Talrum`. CI
reads them in `.github/workflows/deploy.yml` (migrations + SPA) and
`.github/workflows/deploy-functions.yml`.

| Secret                  | Used by                              | Source                                  |
| ----------------------- | ------------------------------------ | --------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | `deploy.yml`, `deploy-functions.yml` | dashboard → Account → Access Tokens     |
| `SUPABASE_DB_PASSWORD`  | `deploy.yml`                         | dashboard → Project settings → Database |
| `SUPABASE_PROJECT_REF`  | `deploy.yml`, `deploy-functions.yml` | dashboard → Project settings → General  |

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

Custom (non-default) secrets a function might need go through
`supabase secrets set` as documented upstream. Today there are five,
all used by the generate functions (#422):

For `generate-voice`:

- `AZURE_SPEECH_KEY` — the key from the Azure Speech service page
  (portal.azure.com → the Speech resource → Keys and Endpoint).
- `AZURE_SPEECH_REGION` — the data center picked at creation
  (`northeurope`).

For `generate-image`:

- `AZURE_OPENAI_KEY` — the key from the Azure OpenAI resource page
  (portal.azure.com → the resource → Keys and Endpoint).
- `AZURE_OPENAI_ENDPOINT` — the resource URL
  (`https://<name>.openai.azure.com`).
- `AZURE_OPENAI_IMAGE_DEPLOYMENT` — the deployment name typed when
  deploying the image model. **The deployment type must keep the data
  in the EU**: pick "Data Zone Standard" (EU data zone) or a regional
  type on an EU resource, never a "Global" type — a Global deployment
  routes each request to any Microsoft data center worldwide, and the
  privacy policy (§4) promises parents the label stays in the EU.

To rotate a key: regenerate it in the Azure portal, then
`supabase secrets set <NAME>=<new value>`. The runtime picks
up new secret values on the next invocation; no redeploy needed. The
`delete-account` function has no custom secrets.

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

`supabase functions serve` injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_DB_URL` into every function by
itself, and it drops any `SUPABASE_*` name it finds in an env file
(`Env name cannot start with SUPABASE_, skipping`). `delete-account` uses
only these, so it needs no env file:

```sh
supabase functions serve delete-account
```

This is what `npm run test:e2e:delete-account` and CI rely on.

`generate-voice` and `generate-image` need custom secrets. Put them in
`supabase/functions/.env.local` (gitignored) and pass the file:

```
AZURE_SPEECH_KEY=…
AZURE_SPEECH_REGION=northeurope
```

Then: `supabase functions serve generate-voice --env-file supabase/functions/.env.local`.
Without the secrets the function boots but every call returns
`synthesis_failed`. `generate-image` works the same way with its three
secrets; without them every call returns `generation_failed`.

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
