# Privacy Policy

> Written by the operator, not reviewed by a lawyer. It describes what the
> service actually does today; it is not a warranty. If you need a
> commitment beyond what is written here, ask before you use the service.

**Effective date:** 4 August 2026

## 1. Who we are

This service is operated by Nicolai Brodersen Hansen, as an individual. For
privacy questions or to exercise any of the rights described below, contact
<nbhansen@gmail.com>.

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
- Crash and error reports. These carry the error, the code location, and a
  short trail of the actions that led to it. Your email address is stripped
  before the report is sent, and we record no session replay and no
  performance traces.
- We do not run analytics tracking. Nothing records which pictograms a child
  taps.

## 3. What we don't collect

- No third-party trackers.
- No advertising identifiers.
- No location data.
- No device fingerprinting.

## 4. Where it lives

Your account data, the boards you build, and the images and recordings you
upload are processed and stored by Supabase, acting as our data processor, in
its **West EU (Ireland)** region — inside the EU.

The web app itself is served as static files by Cloudflare Pages, which sees
request metadata (IP address, user agent) but none of your account content.

Crash reports go to Sentry, acting as our data processor. Sentry receives the
technical data described in section 2 and no account content.

When you use **Generate voice**, the text label of that one pictogram is sent
to Microsoft Azure (our data processor for speech synthesis) in its **North
Europe (Ireland)** region — inside the EU. Azure turns the text into audio
and returns it; we do not log the label, and nothing else is sent. This
happens only when you press the button, never automatically.

When you use **Generate image**, the text label you type is sent to
Microsoft Azure (our data processor for image generation) in its **Sweden
Central (Sweden)** region — inside the EU.
Azure turns the text into a pictogram image and returns it; we do not log
the label, and nothing else is sent. This happens only when you press the
button, never automatically, and nothing is saved unless you accept the
preview.

## 5. Who has access

- **You**, the caregiver, via a JSON Web Token bound to your account. Row
  Level Security policies in Postgres prevent any other user from reading
  your rows.
- **Co-caregivers** you explicitly invite to a specific board, via the
  in-app sharing flow. Their access is scoped to the boards you share.
- **The operator**, who administers the database and can therefore read any
  row in it. In practice this happens only to answer a support request or to
  investigate a specific fault, and it is not needed for the service to run.

## 6. Retention

We keep your account data until you delete it. We may, in the future,
automatically delete accounts that have been inactive for a period to be
determined; if we do so, we will email you at least 30 days before
deletion.

## 7. Deletion rights (GDPR Article 17)

You can delete your account at any time:

- **In-app:** Settings → Delete my account. The deletion is immediate and
  cannot be undone (section 8).
- **Email:** <nbhansen@gmail.com>. The operator commits to a 30-day response
  window for email deletion requests.

## 8. There is no restore

Deletion is final and immediate. The service runs on Supabase's free plan,
which does not provide restorable backups, so a deleted account cannot be
recovered — not by you and not by us. Delete only when you mean it.

If you want to keep your boards, screenshot or re-photograph them before
deleting. There is no export yet (section 9).

## 9. Data export (GDPR Article 20)

To request a copy of your data, email <nbhansen@gmail.com>; we will respond
within 30 days. This process is manual until an in-app export ships.

## 10. Children's data

The data subject of this service is the caregiver — the adult who creates
the account and operates it. The content stored may describe a child, but
the child is not the account holder and does not interact with the service
directly.

We treat content describing children with heightened sensitivity: it is
stored under the same RLS isolation as all other caregiver data and never
used for analytics or advertising. It is not shared with third parties,
with one exception you control: pressing **Generate voice** or **Generate
image** sends that pictogram's text label to Microsoft Azure for speech
synthesis or image generation (section 4).
The service is operated from and for Denmark/the EU. It is not offered in the
United States, so US-specific children's-privacy rules (COPPA) are not
addressed here.

## 11. Changes to this policy

We may update this policy over time. If we make material changes, we will
notify you (typically by email to the address on file) before the changes
take effect.

## 12. Effective date

4 August 2026.
