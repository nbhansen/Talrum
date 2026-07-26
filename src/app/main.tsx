import '@fontsource-variable/nunito/index.css';
import '@/theme/tokens.css';
import '@/theme/reset.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { startOutbox } from '@/lib/outbox';
import { registerServiceWorker } from '@/lib/serviceWorker';
import { initTelemetry } from '@/lib/telemetry';

import { App } from './App';

// Telemetry first: registerServiceWorker reports a failed registration, and
// captureMessage no-ops until the Sentry client exists.
initTelemetry();
registerServiceWorker();
startOutbox();

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
