import * as Sentry from '@sentry/react';

type CaptureContext = Parameters<typeof Sentry.captureException>[1];

/**
 * PII posture (intentional):
 *   - sendDefaultPii: false (no IP, no cookies, no headers).
 *   - tracesSampleRate: 0 (errors only — no performance/transaction data).
 *   - No session-replay integration.
 *   - beforeSend strips event.user.email and any breadcrumb message longer
 *     than 120 chars. Board names and pictogram labels are short; the cap
 *     catches accidental long user-content leaks (e.g. error.message echoing
 *     a stack frame that captured a closure value) without scrubbing real
 *     stack content.
 */
export const initTelemetry = (): void => {
  if (Sentry.getClient()) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!import.meta.env.PROD || !dsn) return;
  Sentry.init({
    dsn,
    release: __APP_VERSION__,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.user?.email) delete event.user.email;
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((b) =>
          b.message && b.message.length > 120 ? { ...b, message: '[stripped]' } : b,
        );
      }
      return event;
    },
  });
};

export const captureException = (err: unknown, ctx?: CaptureContext): void => {
  if (!Sentry.getClient()) return;
  Sentry.captureException(err, ctx);
};
