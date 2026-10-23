# Security audit

Read this before a change to RLS, storage policies, edge functions, auth, or CI. It records what the last audit checked, what it found, and what it could not check.

## 2026-10-23, commit f24426a

**Method.** Full-repository audit with the standard profile. The audit read the source and ran bounded Vitest checks in a no-network sandbox. It did not contact the deployed Supabase project, Cloudflare, Azure, GitHub, or npm. deno, pgTAP, and a Supabase stack were not available. So each claim that depends on Postgres RLS, Storage, or GoTrue runtime behavior is a lead, not a confirmed finding.

**Posture.** The tenant model holds in source. Every table has RLS. anon has no grants. The SECURITY DEFINER helpers are in `private`. Triggers keep `owner_id` fixed. Each edge function takes the user only from a verified JWT. No hardcoded secret, debug bypass, or HTML injection sink exists. The weak points are:

- The client trusts values in rows that another owner wrote: storage paths, glyph and accent enums, and tint.
- The schema does not bind cross-row references (`boards.kid_id`) to the same owner.
- No per-user limit exists on paid Azure calls, rows, objects, or OTP emails.

### Confirmed (reproduced locally)

| Severity | Issue | Summary |
|---|---|---|
| low | #632 | A `#access_token=` URL fragment replaces the stored session (`detectSessionInUrl` default). |
| low | #633 | An unknown glyph or accent in a shared row crashes the parent Home screen. |

### Leads (source trace complete, runtime not observed)

| Issue | Summary |
|---|---|
| #634 | The outbox removes the storage path stored in a row, with no owner check, before the RLS-checked delete. |
| #635 | An editor can delete the owner's board through the `boards.kid_id` cascade. |
| #636 | The OpenWiki workflow installs an unpinned npm package with a write token. |
| #434 | The generate functions have no per-user budget. The audit extended this issue to generate-image. |
| #637 | OTP sign-up has no CAPTCHA. Anonymous requests can use up the email budget. |
| #638 | One nested storage object blocks account deletion. |
| #639 | Storage writes can land under a deleted user's prefix after the purge. |
| #640 | No per-owner limit exists on rows, objects, or text length. |
| #641 | Shared rows can push a member's own rows out of the `max_rows` list reads. |
| #642 | The tint value is used as a raw CSS background, so it can load an external URL. |

Hardening: #643 (security headers), #644 (CI permissions and pins), #645 (AuthGate store clearing and sign-out errors). There is also a role note on #563.

### Not covered

- The known-CVE status of `package-lock.json` and the `deno.lock` files. The lookup needs network access. Run `npm audit` or review the Dependabot alerts.
- Production dashboard settings: Auth rate limits, CAPTCHA, SMTP, `max_rows`, bucket limits, and Cloudflare headers. Each lead issue has a read-only owner check for these.
- Postgres, Storage, and GoTrue runtime behavior. Each lead issue has a pgTAP or local-stack plan.
