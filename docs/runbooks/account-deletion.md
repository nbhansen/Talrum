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

5. **Keep the paper trail.** The trail is the email thread itself: the
   inbound request and the step-4 confirmation, archived under a
   `talrum-deletion` label in the operator's mailbox. That is a real record
   and it needs no tooling that doesn't already exist. Never delete the
   thread — it is the only evidence the request was honoured.

   Revisit this if deletion requests stop being rare enough to find by
   searching a mailbox; a spreadsheet in private storage is the next step up.

## Scenario 2: "I deleted my account by mistake, please restore"

**The answer is no.** There is nothing to restore from.

The project runs on the **free plan**, which does not give the dashboard any
restorable backups — Supabase takes daily backups only for Pro, Team, and
Enterprise projects ([docs](https://supabase.com/docs/guides/platform/backups)).
`docs/privacy-policy.md` §8 says this plainly, and the in-app delete flow
warns the user before they confirm.

Respond apologetically and do not improvise a partial rebuild from
screenshots or logs — a half-restored account is worse than an empty one.

If restores ever need to be possible, that is a plan change, not a runbook
change: either upgrade to Pro (7 days of daily backups) or schedule
`supabase db dump` to off-site storage, which is what Supabase recommends
for free-plan projects. Storage objects are **not** covered by database
backups either way. Update §8 of the privacy policy in the same commit —
a policy promising no restore while backups exist is as wrong as the
reverse.

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
