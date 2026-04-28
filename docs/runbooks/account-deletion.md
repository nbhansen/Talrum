# Runbook: account deletion requests

How the operator handles inbound account-deletion, restore, and export
requests. Pairs with `docs/privacy-policy.md`.

The in-app delete flow (Settings → Delete my account) is the preferred
path: it invokes the `delete-account` edge function, which deletes
storage objects under the user's prefix and then deletes the `auth.users`
row (cascading to `public.kids`, `public.pictograms`, `public.boards`,
`public.board_members`). Everything below is for cases where the in-app
flow isn't usable.

## Scenario 1: user emails "please delete my account"

1. **Verify identity.** Reply to the request from the same email address
   the user sent it from. Do not act on a deletion request that arrived
   on a different address than the one the account is registered to.

2. **Look up the account** in the Supabase dashboard SQL editor:
   ```sql
   SELECT id, email, created_at FROM auth.users WHERE email = '<user-email>';
   ```

3. **Pick a path:**

   - **(a) The user can sign in.** Ask them to use Settings → Delete my
     account in the app. This is always preferred — it goes through the
     same edge function CI exercises and leaves no operator footprint.

   - **(b) The user can't sign in** (lost password, broken account,
     etc.). Execute the deletion server-side. Two methods:

     - **Method b1 (preferred): invoke the edge function as the user.**
       Generate a magic-link access token for the user from the Supabase
       dashboard (Authentication → Users → row → Generate link), sign
       into a session with it to obtain the access JWT, then:
       ```sh
       curl -X POST "$API_URL/functions/v1/delete-account" \
         -H "Authorization: Bearer $USER_JWT" \
         -H "Content-Type: application/json" \
         -d '{}'
       ```
       Expect HTTP 200 with `{ "ok": true }`. This is the same code path
       the in-app button uses, so it benefits from all of its
       guarantees (storage cleanup, FK cascades, idempotency).

     - **Method b2 (fallback): direct SQL plus storage delete.** Use
       only if b1 is unavailable. Run in a single SQL editor session:
       ```sql
       -- 1. List storage objects scoped to this user.
       SELECT name FROM storage.objects
       WHERE bucket_id IN ('pictogram-audio', 'pictogram-images')
         AND split_part(name, '/', 1) = '<uid>';

       -- 2. Delete them.
       DELETE FROM storage.objects
       WHERE bucket_id IN ('pictogram-audio', 'pictogram-images')
         AND split_part(name, '/', 1) = '<uid>';

       -- 3. Delete the auth row (cascades to public tables via the
       --    FKs added in #100 Phase A).
       DELETE FROM auth.users WHERE id = '<uid>';
       ```

4. **Confirm to the user** by email that the account and associated data
   have been deleted.

5. **Log the request** so we have a paper trail for audits and disputes:
   append a row to [TBD: the operator's preferred ops log — Linear
   ticket, CSV in private storage, etc. Decision deferred].

## Scenario 2: "I deleted my account by mistake, please restore"

1. Check the **Supabase backup retention window** in the dashboard
   (Project settings → Database → Backups). The default plan retains
   daily backups for 7 days.

2. **Within the retention window:** discuss feasibility with the user.
   Restoring a Supabase backup is **project-level** — it rolls back ALL
   users' data to the snapshot, not just the requesting user. Decision
   factors:
   - How recent is the deletion? (Older = more lost work for everyone
     else.)
   - How many other active users would lose data?
   - Is the cost (data loss for others, operator effort) acceptable?

3. **Outside the retention window:** respond apologetically. Deletion is
   final per the privacy policy.

4. Document the factors that drove the decision in the ops log. We do
   **not** publish a SLA for restores. The standard answer is "no,
   deletion is final per the privacy policy" — the in-app flow warns
   the user about this before they confirm.

## Scenario 3: "please export my data" (GDPR Article 20)

Until an in-app export ships (tracked separately), do the export
manually.

1. **Look up the user's UID** as in Scenario 1, step 2.

2. **Dump tabular data via SQL.** Run each in the SQL editor and save
   the results as CSV:
   ```sql
   COPY (SELECT * FROM public.kids WHERE owner_id = '<uid>') TO STDOUT WITH CSV HEADER;
   COPY (SELECT * FROM public.pictograms WHERE owner_id = '<uid>') TO STDOUT WITH CSV HEADER;
   COPY (SELECT * FROM public.boards WHERE owner_id = '<uid>') TO STDOUT WITH CSV HEADER;
   COPY (SELECT * FROM public.board_members WHERE user_id = '<uid>') TO STDOUT WITH CSV HEADER;
   ```

3. **Download storage objects** with the Supabase CLI (`supabase login`
   first, and `supabase link --project-ref <ref>` against the right
   project):
   ```sh
   mkdir -p export-<uid>/audio export-<uid>/images
   supabase storage download --recursive \
     "ss:///pictogram-audio/<uid>" "./export-<uid>/audio/"
   supabase storage download --recursive \
     "ss:///pictogram-images/<uid>" "./export-<uid>/images/"
   ```
   (Verify the exact `supabase storage download` syntax against your
   installed CLI version with `supabase storage download --help` —
   flag names occasionally shift between releases.)

4. **Bundle and send.**
   ```sh
   zip -r export-<uid>.zip export-<uid>/
   ```
   Email the archive to the address on the account, with a short note
   explaining that this is the response to their Article 20 request and
   describing the file layout (one CSV per table, plus `audio/` and
   `images/` directories of original uploads).

5. **Log the request** in the ops log alongside deletion requests.
