# Self-hosting Supabase (later)

We start on Supabase Cloud. This doc captures the path to a self-hosted Supabase on a VPS for when cost, data residency, or control demands it. Nothing here needs to be done now — it exists so we don't make decisions today that lock us in.

## Why it stays portable

- All schema lives in `supabase/migrations/*.sql` — plain Postgres, no Supabase-only DSL.
- Auth uses Supabase's standard `auth.users` table + email OTP. The `handle_new_user()` trigger is in our migrations.
- Storage uses Supabase Storage's standard S3-compatible buckets (`pictogram-images`, `pictogram-audio`).
- We do **not** use Supabase Edge Functions or Supabase-only Postgres extensions.
- The frontend reads only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — point them at any Supabase instance.

## Target shape

- One small VPS (Hetzner CX22, ~€4/mo, is plenty for early production).
- Official `supabase/supabase` Docker Compose stack (Postgres, GoTrue, PostgREST, Storage, Studio, Kong).
- Caddy or Traefik in front for TLS via Let's Encrypt.
- Daily `pg_dump` to S3-compatible object storage (Backblaze B2 or Hetzner Storage Box).

## Migration runbook (when the time comes)

1. **Provision VPS** and install Docker + Docker Compose.
2. **Clone** the [supabase/supabase](https://github.com/supabase/supabase) repo's `docker/` directory and follow its self-hosting guide.
3. **Set strong secrets** in `.env` (JWT secret, anon/service keys, Postgres password, dashboard credentials).
4. **Apply our migrations** against the new instance:
   ```bash
   supabase link --project-ref local-self-hosted   # or use a direct DB URL
   supabase db push --db-url postgres://postgres:PASS@HOST:5432/postgres
   ```
5. **Export from Cloud, import to self-hosted**:
   - Schema is already in migrations — no schema dump needed.
   - Auth users: `supabase db dump --linked --schema auth -f auth.sql` then load against the new DB.
   - App data: `pg_dump --data-only --schema public` from cloud, `psql` into self-hosted.
   - Storage objects: `rclone sync` between the two S3-compatible endpoints.
6. **Cut over**:
   - Update `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in Cloudflare Pages env.
   - Update GitHub Actions secrets so `deploy-migrations.yml` targets the new instance (replace `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF` with a direct `--db-url`).
   - Update mobile app config and ship a release.
7. **Decommission** the Cloud project after a verification window.

## What you give up

- Automatic backups (replace with cron + `pg_dump`).
- Push notifications and managed log retention (need to wire your own).
- One-click upgrades — Supabase versions move fast, you're on the hook for keeping the Compose stack current.

If any of this gets painful, going back to Supabase Cloud is the same runbook in reverse.
