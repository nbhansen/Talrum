import { lazy, type ReactNode, Suspense } from 'react';
import { createBrowserRouter, Link, Navigate } from 'react-router-dom';

import { kidModeNeedsPinSetup } from '@/lib/pin';
import { queryClient } from '@/lib/queryClient';
import { ErrorBoundary } from '@/ui/ErrorBoundary/ErrorBoundary';
import styles from '@/ui/ErrorBoundary/ErrorBoundary.module.css';
import { Spinner } from '@/ui/Spinner/Spinner';
import { KidRouteFallback } from '@/widgets/KidModeGate/KidRouteFallback';

// A router manifest, not a component module: the HMR-boundary rule does not
// apply to it.
/* eslint-disable react-refresh/only-export-components */

const ParentHomeRoute = lazy(() =>
  import('@/app/routes/ParentHomeRoute').then((m) => ({ default: m.ParentHomeRoute })),
);
const BoardBuilderRoute = lazy(() =>
  import('@/app/routes/BoardBuilderRoute').then((m) => ({
    default: m.BoardBuilderRoute,
  })),
);
const KidSequenceRoute = lazy(() =>
  import('@/app/routes/KidSequenceRoute').then((m) => ({ default: m.KidSequenceRoute })),
);
const KidChoiceRoute = lazy(() =>
  import('@/app/routes/KidChoiceRoute').then((m) => ({ default: m.KidChoiceRoute })),
);
const LibraryRoute = lazy(() =>
  import('@/app/routes/LibraryRoute').then((m) => ({ default: m.LibraryRoute })),
);
const KidsRoute = lazy(() =>
  import('@/app/routes/KidsRoute').then((m) => ({ default: m.KidsRoute })),
);
const SettingsRoute = lazy(() =>
  import('@/app/routes/SettingsRoute').then((m) => ({ default: m.SettingsRoute })),
);
const AccountDeletedRoute = lazy(() =>
  import('@/app/routes/AccountDeletedRoute').then((m) => ({
    default: m.AccountDeletedRoute,
  })),
);
const PrivacyPolicyRoute = lazy(() =>
  import('@/app/routes/PrivacyPolicyRoute').then((m) => ({
    default: m.PrivacyPolicyRoute,
  })),
);

export const parentRouteFallback = (reset: () => void): ReactNode => (
  <div role="alert" className={styles.routeFallback}>
    <p className={styles.routeFallbackTitle}>Couldn&apos;t load this screen.</p>
    <p className={styles.routeFallbackBody}>
      Try again, or go back to the home screen. Your work is saved.
    </p>
    <div className={styles.routeFallbackActions}>
      <button
        type="button"
        className={`${styles.routeFallbackBtn} ${styles.routeFallbackBtnPrimary}`}
        onClick={() => {
          // Flush the cache before clearing the error, or the subtree renders
          // the same bad data again.
          void queryClient.invalidateQueries();
          reset();
        }}
      >
        Retry
      </button>
      <Link to="/" className={styles.routeFallbackBtn}>
        Go home
      </Link>
    </div>
  </div>
);

// Not wrapped in KidModeLayout: if the crash came from the layout,
// re-rendering it would re-throw.
export const kidRouteFallback = (): ReactNode => <KidRouteFallback />;

const parentSuspenseFallback = (
  <div className={styles.parentSuspense}>
    <Spinner />
    <p className={styles.parentSuspenseBody}>Loading…</p>
  </div>
);

// No spinner, no text: kid mode prefers a calm screen for a brief wait.
const kidSuspenseFallback = <div className={styles.kidFallback} aria-hidden="true" />;

/**
 * A device with no PIN must not enter kid mode at all (#353). This lives in
 * `wrap`'s kid branch so the `'kid'` variant is the guard: a third kid route
 * cannot be added without it, and it runs before the route fetches a board.
 */
const RequireKidPin = ({ children }: { children: ReactNode }): ReactNode =>
  kidModeNeedsPinSetup() ? <Navigate to="/settings?pin=required" replace /> : children;

// ErrorBoundary outside Suspense, so a failed chunk import lands in the
// route's own fallback with its Retry, not the app-root one.
export const wrap = (el: ReactNode, variant: 'parent' | 'kid'): ReactNode => (
  <ErrorBoundary fallback={variant === 'kid' ? kidRouteFallback : parentRouteFallback}>
    <Suspense fallback={variant === 'kid' ? kidSuspenseFallback : parentSuspenseFallback}>
      {variant === 'kid' ? <RequireKidPin>{el}</RequireKidPin> : el}
    </Suspense>
  </ErrorBoundary>
);

export const router = createBrowserRouter([
  { path: '/', element: wrap(<ParentHomeRoute />, 'parent') },
  { path: '/boards/:boardId/edit', element: wrap(<BoardBuilderRoute />, 'parent') },
  { path: '/library', element: wrap(<LibraryRoute />, 'parent') },
  { path: '/kids', element: wrap(<KidsRoute />, 'parent') },
  { path: '/settings', element: wrap(<SettingsRoute />, 'parent') },
  { path: '/kid/sequence/:boardId', element: wrap(<KidSequenceRoute />, 'kid') },
  { path: '/kid/choice/:boardId', element: wrap(<KidChoiceRoute />, 'kid') },
  { path: '/account-deleted', element: wrap(<AccountDeletedRoute />, 'parent') },
  { path: '/privacy-policy', element: wrap(<PrivacyPolicyRoute />, 'parent') },
  { path: '*', element: <Navigate to="/" replace /> },
]);
