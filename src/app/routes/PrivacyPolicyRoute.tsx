import type { JSX } from 'react';

export const PrivacyPolicyRoute = (): JSX.Element => (
  <main role="main" data-testid="privacy-policy-route">
    <h1>Privacy Policy</h1>
    <blockquote>
      <p>
        Written by the operator, not reviewed by a lawyer. It describes what the service actually
        does today; it is not a warranty. If you need a commitment beyond what is written here, ask
        before you use the service.
      </p>
    </blockquote>
    <p>
      <strong>Effective date:</strong> 4 August 2026
    </p>
    <h2>1. Who we are</h2>
    <p>
      This service is operated by Nicolai Brodersen Hansen, as an individual. For privacy questions
      or to exercise any of the rights described below, contact{' '}
      <a href="mailto:nbhansen@gmail.com">nbhansen@gmail.com</a>.
    </p>
    <h2>2. What we collect</h2>
    <h3>Account data</h3>
    <ul>
      <li>Your email address.</li>
      <li>
        Authentication metadata managed by Supabase (sign-in tokens, hashed identifiers,
        timestamps).
      </li>
    </ul>
    <h3>Caregiver-created content</h3>
    <ul>
      <li>Kid names you add to your account.</li>
      <li>Board names and the structures (steps, ordering) you build.</li>
      <li>Pictogram labels.</li>
      <li>Custom pictogram images you upload.</li>
      <li>Voice recordings you record for pictograms.</li>
    </ul>
    <h3>Technical data</h3>
    <ul>
      <li>Sign-in timestamps.</li>
      <li>
        Crash and error reports. These carry the error, the code location, and a short trail of the
        actions that led to it. Your email address is stripped before the report is sent, and we
        record no session replay and no performance traces.
      </li>
      <li>We do not run analytics tracking. Nothing records which pictograms a child taps.</li>
    </ul>
    <h2>3. What we don't collect</h2>
    <ul>
      <li>No third-party trackers.</li>
      <li>No advertising identifiers.</li>
      <li>No location data.</li>
      <li>No device fingerprinting.</li>
    </ul>
    <h2>4. Where it lives</h2>
    <p>
      Your account data, the boards you build, and the images and recordings you upload are
      processed and stored by Supabase, acting as our data processor, in its{' '}
      <strong>West EU (Ireland)</strong> region — inside the EU.
    </p>
    <p>
      The web app itself is served as static files by Cloudflare Pages, which sees request metadata
      (IP address, user agent) but none of your account content.
    </p>
    <p>
      Crash reports go to Sentry, acting as our data processor. Sentry receives the technical data
      described in section 2 and no account content.
    </p>
    <p>
      When you use <strong>Generate voice</strong>, the text label of that one pictogram is sent to
      Microsoft Azure (our data processor for speech synthesis) in its{' '}
      <strong>North Europe (Ireland)</strong> region — inside the EU. Azure turns the text into
      audio and returns it; we do not log the label, and nothing else is sent. This happens only
      when you press the button, never automatically.
    </p>
    <p>
      When you use <strong>Generate image</strong>, the text label you type is sent to Microsoft
      Azure (our data processor for image generation) inside its <strong>EU data zone</strong> —
      Microsoft picks the data center per request, always within the EU. Azure turns the text into a
      pictogram image and returns it; we do not log the label, and nothing else is sent. This
      happens only when you press the button, never automatically, and nothing is saved unless you
      accept the preview.
    </p>
    <h2>5. Who has access</h2>
    <ul>
      <li>
        <strong>You</strong>, the caregiver, via a JSON Web Token bound to your account. Row Level
        Security policies in Postgres prevent any other user from reading your rows.
      </li>
      <li>
        <strong>Co-caregivers</strong> you explicitly invite to a specific board, via the in-app
        sharing flow. Their access is scoped to the boards you share.
      </li>
      <li>
        <strong>The operator</strong>, who administers the database and can therefore read any row
        in it. In practice this happens only to answer a support request or to investigate a
        specific fault, and it is not needed for the service to run.
      </li>
    </ul>
    <h2>6. Retention</h2>
    <p>
      We keep your account data until you delete it. We may, in the future, automatically delete
      accounts that have been inactive for a period to be determined; if we do so, we will email you
      at least 30 days before deletion.
    </p>
    <h2>7. Deletion rights (GDPR Article 17)</h2>
    <p>You can delete your account at any time:</p>
    <ul>
      <li>
        <strong>In-app:</strong> Settings → Delete my account. The deletion is immediate and cannot
        be undone (section 8).
      </li>
      <li>
        <strong>Email:</strong> <a href="mailto:nbhansen@gmail.com">nbhansen@gmail.com</a>. The
        operator commits to a 30-day response window for email deletion requests.
      </li>
    </ul>
    <h2>8. There is no restore</h2>
    <p>
      Deletion is final and immediate. The service runs on Supabase's free plan, which does not
      provide restorable backups, so a deleted account cannot be recovered — not by you and not by
      us. Delete only when you mean it.
    </p>
    <p>
      If you want to keep your boards, screenshot or re-photograph them before deleting. There is no
      export yet (section 9).
    </p>
    <h2>9. Data export (GDPR Article 20)</h2>
    <p>
      To request a copy of your data, email{' '}
      <a href="mailto:nbhansen@gmail.com">nbhansen@gmail.com</a>; we will respond within 30 days.
      This process is manual until an in-app export ships.
    </p>
    <h2>10. Children's data</h2>
    <p>
      The data subject of this service is the caregiver — the adult who creates the account and
      operates it. The content stored may describe a child, but the child is not the account holder
      and does not interact with the service directly.
    </p>
    <p>
      We treat content describing children with heightened sensitivity: it is stored under the same
      RLS isolation as all other caregiver data and never used for analytics or advertising. It is
      not shared with third parties, with one exception you control: pressing{' '}
      <strong>Generate voice</strong> or <strong>Generate image</strong> sends that pictogram's text
      label to Microsoft Azure for speech synthesis or image generation (section 4). The service is
      operated from and for Denmark/the EU. It is not offered in the United States, so US-specific
      children's-privacy rules (COPPA) are not addressed here.
    </p>
    <h2>11. Changes to this policy</h2>
    <p>
      We may update this policy over time. If we make material changes, we will notify you
      (typically by email to the address on file) before the changes take effect.
    </p>
    <h2>12. Effective date</h2>
    <p>4 August 2026.</p>
  </main>
);
