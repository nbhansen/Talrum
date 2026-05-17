import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import type { JSX } from 'react';
import { RouterProvider } from 'react-router-dom';

import { persistOptions, queryClient } from '@/lib/queryClient';
import { ErrorBoundary } from '@/ui/ErrorBoundary/ErrorBoundary';
import styles from '@/ui/ErrorBoundary/ErrorBoundary.module.css';

import { AuthGate } from './AuthGate';
import { router } from './routes';
import { SwUpdatePrompt } from './SwUpdatePrompt';

// Last-resort fallback if anything escapes a route boundary or fires before
// any route mounts. Lives outside RouterProvider so it can't use router hooks
// — `window.location.reload()` is the only viable recovery.
const AppRootFallback = (): JSX.Element => (
  <div role="alert" className={styles.appRootFallback}>
    <p className={styles.appRootFallbackTitle}>Something went wrong.</p>
    <button
      type="button"
      className={`${styles.routeFallbackBtn} ${styles.routeFallbackBtnPrimary}`}
      onClick={() => window.location.reload()}
    >
      Reload
    </button>
  </div>
);

export const App = (): React.JSX.Element => (
  <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
    <AuthGate>
      <ErrorBoundary fallback={() => <AppRootFallback />}>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
      </ErrorBoundary>
    </AuthGate>
    <SwUpdatePrompt />
  </PersistQueryClientProvider>
);
