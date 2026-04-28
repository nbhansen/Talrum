import { lazy, type ReactNode, Suspense } from 'react';
import { createBrowserRouter, Link, Navigate } from 'react-router-dom';

import { queryClient } from '@/lib/queryClient';
import { ErrorBoundary } from '@/ui/ErrorBoundary/ErrorBoundary';
import styles from '@/ui/ErrorBoundary/ErrorBoundary.module.css';
import { Spinner } from '@/ui/Spinner/Spinner';

const ParentHomeRoute = lazy(() =>
  import('@/features/parent-home/ParentHomeRoute').then((m) => ({ default: m.ParentHomeRoute })),
);
const BoardBuilderRoute = lazy(() =>
  import('@/features/board-builder/BoardBuilderRoute').then((m) => ({
    default: m.BoardBuilderRoute,
  })),
);
const KidSequenceRoute = lazy(() =>
  import('@/features/kid-sequence/KidSequenceRoute').then((m) => ({ default: m.KidSequenceRoute })),
);
const KidChoiceRoute = lazy(() =>
  import('@/features/kid-choice/KidChoiceRoute').then((m) => ({ default: m.KidChoiceRoute })),
);
const LibraryRoute = lazy(() =>
  import('@/features/library/LibraryRoute').then((m) => ({ default: m.LibraryRoute })),
);
const KidsRoute = lazy(() =>
  import('@/features/kids/KidsRoute').then((m) => ({ default: m.KidsRoute })),
);
const SettingsRoute = lazy(() =>
  import('@/features/settings/SettingsRoute').then((m) => ({ default: m.SettingsRoute })),
);
const AccountDeletedRoute = lazy(() =>
  import('@/features/account-deleted/AccountDeletedRoute').then((m) => ({
    default: m.AccountDeletedRoute,
  })),
);
const PrivacyPolicyRoute = lazy(() =>
  import('@/features/privacy-policy/PrivacyPolicyRoute').then((m) => ({
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
          // Flush any cached query that might have produced bad data, then
          // clear the boundary's error so the subtree renders fresh.
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

// Standalone JSX — intentionally NOT wrapped in KidModeLayout. If the original
// crash came from KidModeLayout itself, re-rendering it would re-throw.
export const kidRouteFallback = (): ReactNode => (
  <div role="alert" className={styles.kidFallback}>
    <Link to="/" className={styles.kidFallbackBtn}>
      Tap to go back
    </Link>
  </div>
);

const parentSuspenseFallback = (
  <div className={`tal ${styles.parentSuspense}`}>
    <Spinner />
    <p className={styles.parentSuspenseBody}>Loading…</p>
  </div>
);

// Empty kid-tinted shell — no spinner, no text. Kid-mode prefers a calm
// static screen during the brief async wait while the route chunk loads.
const kidSuspenseFallback = <div className={styles.kidFallback} aria-hidden="true" />;

// ErrorBoundary wraps Suspense (not the other way around) so that a
// chunk-load failure during the dynamic import lands in the route's own
// error fallback (with Retry) instead of bubbling to the app-root fallback.
// Exported so tests can mount routes through the same wrapping the real
// router uses.
export const wrap = (el: ReactNode, variant: 'parent' | 'kid'): ReactNode => (
  <ErrorBoundary fallback={variant === 'kid' ? kidRouteFallback : parentRouteFallback}>
    <Suspense fallback={variant === 'kid' ? kidSuspenseFallback : parentSuspenseFallback}>
      {el}
    </Suspense>
  </ErrorBoundary>
);

export const router = createBrowserRouter(
  [
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
  ],
  {
    future: {
      v7_fetcherPersist: true,
      v7_normalizeFormMethod: true,
      v7_partialHydration: true,
      v7_relativeSplatPath: true,
      v7_skipActionErrorRevalidation: true,
    },
  },
);
