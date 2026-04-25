import '@fontsource-variable/nunito';
import '@/theme/tokens.module.css';
import '@/theme/reset.module.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { startOutbox } from '@/lib/outbox';

import { App } from './App';

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
