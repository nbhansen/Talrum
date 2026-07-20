---
type: Reference
title: Operations & Verification
description: Operational runbooks for GDPR compliance, CI/CD deployment pipelines, rollback procedures, and the verification suites (pgTAP, Vitest, Stylelint, and post-build CSS checks).
resource: /docs/runbooks/account-deletion.md
tags: [operations, runbooks, deployments, testing, security, pgtap, vitest, stylelint]
---

# Operations & Verification

This section documents Talrum's production runbooks, GDPR-compliant account administration workflows, CI/CD deployment pipelines, and the comprehensive multi-tiered testing suites.

---

## 1. GDPR Account Deletion Runbook

Talrum supports self-service account deletion directly in the user settings, adhering to the GDPR "Right to be Forgotten."

```
       User Settings Deletion Tapped
                     │
                     ▼
          [delete-account] Edge Function
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
Delete Storage Prefix     Delete auth.users Row
                         (via Service Role Admin)
                                 │
                                 ▼ (Postgres CASCADE)
                          Cascade Deletes to:
                          - public.kids
                          - public.pictograms
                          - public.boards
                          - public.board_members
```

### Self-Service Execution
1.  The parent taps **Delete Account** in the settings feature (`src/features/settings/`).
2.  The client calls the `delete-account` Supabase Edge Function with the user's active JSON Web Token (JWT).
3.  The Edge Function uses its high-privilege service-role client to:
    -   Delete all files matching the user's UUID prefix (`<uid>/`) in the private `pictogram-images` and `pictogram-audio` buckets.
    -   Delete the user's row in `auth.users`.
4.  A Postgres trigger and cascade constraints automatically delete all associated records in `public.kids`, `public.pictograms`, `public.boards`, and `public.board_members`.

---

### Manual Operational Fallback Runbooks
If a user requests account deletion via email, support engineers must execute this manual runbook:

#### Step 1: Verify Identity & Lookup UID
*   Confirm the email request originates from the registered email address.
*   Lookup the user's unique identifier (UID) in the Supabase Dashboard:
    ```sql
    SELECT id FROM auth.users WHERE email = 'user@example.com';
    ```

#### Step 2: Trigger Deletion (Preferred Method)
Trigger the deletion edge function using the admin service key and the target user's UUID to clean up storage buckets and database rows in a single operation:
```bash
curl -X POST "$API_URL/functions/v1/delete-account" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId": "<user-uuid>"}'
```

#### Step 3: Database & Storage Fallback (SQL Method)
If the Edge Function is unreachable, clean up the resources manually:
1.  **Storage Object Deletion:** Run a query to delete the user's assets from the storage tables:
    ```sql
    DELETE FROM storage.objects 
    WHERE bucket_id IN ('pictogram-audio', 'pictogram-images') 
      AND split_part(name, '/', 1) = '<user-uuid>';
    ```
2.  **User Record Deletion:** Delete the record from the core authentication table (which automatically cascades to the public tables):
    ```sql
    DELETE FROM auth.users WHERE id = '<user-uuid>';
    ```

---

### GDPR Article 20: Data Portability Export Runbook
If a user requests an export of their data, execute these steps:

1.  **Database Records Export:** Extract the user's relational records as CSV files using the Supabase SQL editor:
    ```sql
    COPY (SELECT * FROM public.kids WHERE owner_id = '<user-uuid>') TO STDOUT WITH CSV HEADER;
    COPY (SELECT * FROM public.pictograms WHERE owner_id = '<user-uuid>') TO STDOUT WITH CSV HEADER;
    COPY (SELECT * FROM public.boards WHERE owner_id = '<user-uuid>') TO STDOUT WITH CSV HEADER;
    ```
2.  **Custom Asset Export:** Download the user's uploaded image and audio files recursively via the Supabase CLI:
    ```bash
    supabase storage download --recursive "ss:///pictogram-audio/<user-uuid>" "./export-<user-uuid>/audio/"
    supabase storage download --recursive "ss:///pictogram-images/<user-uuid>" "./export-<user-uuid>/images/"
    ```

---

## 2. CI/CD Deployment & Release Order

Deployments are automated on pushes to the `main` branch via GitHub Actions (`.github/workflows/deploy.yml` and `deploy-functions.yml`).

To prevent the frontend from calling database columns or schemas that do not exist yet, the pipeline follows a strict release order:

1.  **Step A: Database Migrations:**
    The runner executes `supabase db push --linked`. If a transient error occurs, the job retries once. If it fails permanently, the pipeline halts and opens a GitHub issue.
2.  **Step B: Compile and Deploy SPA:**
    Only after the database schema assertion succeeds, the frontend single-page application is compiled (`npm run build`) and deployed to Cloudflare Pages.

### Production Rollback Operations
*   **Frontend SPA Rollback:** Administrators can instantly roll back the frontend in the Cloudflare Pages console by selecting and activating the previous production build.
*   **Database Rollback:** Because Postgres does not support automatic rollbacks for applied DDL migrations, rollback requires reverting the migration commit in git and pushing a forward-only undo migration to restore the schema state.

### Production Observability
Production builds report errors to Sentry via the client logger (`src/lib/telemetry.ts`). Development builds and builds missing `VITE_SENTRY_DSN` deactivate error reporting.

---

## 3. Comprehensive Verification Suites

Talrum maintains quality assurance across database schemas, visual designs, and structural code patterns.

### Tier 1: Database pgTAP Tests (`supabase/tests/`)
Database schemas, helper functions, and RLS rules are verified using pgTAP unit tests run through the Supabase CLI (`npm run test:db`).
*   `default_grants_test.sql` & `tighten_grants.sql`: Verifies that the public API role has no unauthorized permissions on internal database functions or schemas.
*   `rls_auto_enable_test.sql`: Validates that the event-trigger automatically enables Row-Level Security on any newly created tables.
*   `owner_fk_cascades_test.sql`: Confirms that deleting an auth user record correctly cascades and deletes all associated rows in `public` tables.
*   `delete_pictogram_rpc_test.sql`: Verifies that the pictogram deletion RPC deletes the target pictogram and cleans up references from all boards' step arrays.
*   `storage_share_rls_test.sql`: Tests that storage access rules correctly restrict read and write privileges to owners and authorized board members.

### Tier 2: Frontend Vitest Tests
Frontend unit and integration tests are executed via Vitest (`npm run test`).
*   **Primitives & Layouts:** Confirms styling, modal portals, text field values, and responsive layouts.
*   **State & Caching Engines:** Tests client-side outbox persistence, FIFO execution order, and cache clearing.

### Tier 3: ESLint Architectural Boundary Enforcement
Lints (`npm run lint`) check that import rules are followed and prevent architectural decay:
*   **Reverse Import Blocks:** Restricts `lib/` and `theme/` folders from importing components or features from the `app/` and `features/` folders.
*   **Presentational Isolation:** Blocks Presentational Primitives in `ui/` from importing database clients, query utilities, or synchronization states.
*   **No Cross-Feature Imports:** Prevents individual screens under `features/` from importing files from other features.

### Tier 4: Stylelint CSS Design Tokens
To maintain design system consistency, Stylelint (`npm run lint:css`) enforces rules configured in `/.stylelintrc.json`:
*   `"color-no-hex": true`: Restricts developers from using raw hex color codes in module style sheets.
*   `"function-disallowed-list": ["rgb", "rgba", "hsl", "hsla"]`: Rejects color functions. All colors must be mapped using standard CSS variable tokens (e.g. `--tal-ink`).
*   `declaration-property-value-disallowed-list`: Rejects raw pixel configurations (`px`) for `padding`, `margin`, and `gap` properties. Spacing must use the standard `--tal-space-N` variables.

### Tier 5: Post-Build CSS Verification (`scripts/verify-build-css.mjs`)
To safeguard against purge CSS bugs where Vite's compiler might drop global styles during build optimization, a post-build verification script runs as part of the pipeline:
*   It searches the compiled production assets (`dist/assets/*.css`).
*   It asserts the presence of design tokens like `--tal-space-4`, `--tal-ink`, `--tal-font`, and global rules such as `box-sizing: border-box`.
*   If any expected design variables or core reset selectors are missing, the script exits with an error code, aborting the deploy job.

---

## Concept Relationships

The operational workflows and verification suites serve to test and deploy Talrum's systems safely:
*   These operational workflows and verification suites [verify](architecture.md) the structural layer boundaries and database triggers defined in the system architecture.
*   The tests in the Vitest suite [verify](offline-sync.md) the replay mechanisms and transactional states described in the offline synchronization model.
