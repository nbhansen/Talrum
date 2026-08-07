import * as Sentry from '@sentry/react';

type CaptureContext = Parameters<typeof Sentry.captureException>[1];

/**
 * The PII posture below is intentional. `beforeBreadcrumb` is load-bearing:
 * the default fetch breadcrumb carries the full URL, and a signed storage URL
 * holds a one-hour bearer token for a child's recording (#359). The 120-char
 * breadcrumb cap catches long user content without scrubbing real stacks.
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
    beforeBreadcrumb(breadcrumb) {
      const url: unknown = breadcrumb.data?.url;
      if (typeof url === 'string' && url.includes('?')) {
        return { ...breadcrumb, data: { ...breadcrumb.data, url: url.split('?')[0] } };
      }
      return breadcrumb;
    },
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

/**
 * For conditions that are not crashes but that we still need to hear about —
 * a capability the app depends on being switched off, for instance. Pass
 * `{ level: 'warning' }` so they do not sit in the same bucket as exceptions.
 */
export const captureMessage = (message: string, ctx?: CaptureContext): void => {
  if (!Sentry.getClient()) return;
  Sentry.captureMessage(message, ctx);
};
