# Privacy Policy

> **ENGINEERING DRAFT — NOT FOR PRODUCTION USE**
>
> This is a working draft authored by engineering during the implementation
> of issue #100. It must be reviewed and approved by counsel before being
> linked from production builds. The `[TBD]` placeholders below must be
> filled in by the operator before launch.

**Effective date:** [TBD before launch]

## 1. Who we are

This service is operated by [TBD: operator name]. For privacy questions or
to exercise any of the rights described below, contact us at
[TBD: contact email].

## 2. What we collect

### Account data

- Your email address.
- Authentication metadata managed by Supabase (sign-in tokens, hashed
  identifiers, timestamps).

### Caregiver-created content

- Kid names you add to your account.
- Board names and the structures (steps, ordering) you build.
- Pictogram labels.
- Custom pictogram images you upload.
- Voice recordings you record for pictograms.

### Technical data

- Sign-in timestamps.
- Error reports once issue #45 lands (a bounded, non-PII error reporter).
- We do not run analytics tracking.

## 3. What we don't collect

- No third-party trackers.
- No advertising identifiers.
- No location data.
- No device fingerprinting.

## 4. Where it lives

Your data is processed and stored by Supabase, acting as our data processor,
in the [TBD — based on actual Supabase project region] region. Supabase's
infrastructure is GDPR-compliant.

## 5. Who has access

- **You**, the caregiver, via a JSON Web Token bound to your account. Row
  Level Security policies in Postgres prevent any other user from reading
  your rows.
- **Co-caregivers** you explicitly invite to a specific board, via the
  in-app sharing flow. Their access is scoped to the boards you share.
- **The operator**, only when you ask for support or when investigating a
  specific incident. Such access is logged.

## 6. Retention

We keep your account data until you delete it. We may, in the future,
automatically delete accounts that have been inactive for a period to be
determined; if we do so, we will email you at least 30 days before
deletion.

## 7. Deletion rights (GDPR Article 17)

You can delete your account at any time:

- **In-app:** Settings → Delete my account. The deletion is effective
  immediately and irreversibly from your perspective.
- **Email:** [TBD: contact email]. The operator commits to a 30-day
  response window for email deletion requests.

## 8. Operator-side restore

Supabase retains daily backups for [TBD days — based on plan]. If you email
us within that window, restore is *possible at our discretion* but not
promised. After the backup window expires, deletion is final.

## 9. Data export (GDPR Article 20)

To request a copy of your data, email [TBD: contact email]; we will respond
within 30 days. This process is manual until an in-app export ships.

## 10. Children's data

The data subject of this service is the caregiver — the adult who creates
the account and operates it. The content stored may describe a child, but
the child is not the account holder and does not interact with the service
directly.

We treat content describing children with heightened sensitivity: it is
stored under the same RLS isolation as all other caregiver data, never
shared with third parties, and never used for analytics or advertising.
The applicability of specific children's-privacy regimes (such as COPPA in
the United States or equivalent rules in other jurisdictions) depends on
the launch markets — counsel will refine this section before launch.

## 11. Changes to this policy

We may update this policy over time. If we make material changes, we will
notify you (typically by email to the address on file) before the changes
take effect.

## 12. Effective date

[TBD before launch].
