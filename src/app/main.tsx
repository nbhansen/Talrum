import '@fontsource-variable/nunito';
import '@/theme/tokens.css';
import '@/theme/reset.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { startOutbox } from '@/lib/outbox';
import { initTelemetry } from '@/lib/telemetry';

import { App } from './App';

initTelemetry();
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
