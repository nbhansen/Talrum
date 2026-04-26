import type { ReactNode } from 'react';
import { createBrowserRouter, Link, Navigate } from 'react-router-dom';

import { BoardBuilderRoute } from '@/features/board-builder/BoardBuilderRoute';
import { KidChoiceRoute } from '@/features/kid-choice/KidChoiceRoute';
import { KidSequenceRoute } from '@/features/kid-sequence/KidSequenceRoute';
import { ParentHomeRoute } from '@/features/parent-home/ParentHomeRoute';
import { queryClient } from '@/lib/queryClient';
import { ErrorBoundary } from '@/ui/ErrorBoundary/ErrorBoundary';
import styles from '@/ui/ErrorBoundary/ErrorBoundary.module.css';

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

const wrap = (el: ReactNode, variant: 'parent' | 'kid'): ReactNode => (
  <ErrorBoundary fallback={variant === 'kid' ? kidRouteFallback : parentRouteFallback}>
    {el}
  </ErrorBoundary>
);

export const router = createBrowserRouter(
  [
    { path: '/', element: wrap(<ParentHomeRoute />, 'parent') },
    { path: '/boards/:boardId/edit', element: wrap(<BoardBuilderRoute />, 'parent') },
    { path: '/kid/sequence/:boardId', element: wrap(<KidSequenceRoute />, 'kid') },
    { path: '/kid/choice/:boardId', element: wrap(<KidChoiceRoute />, 'kid') },
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
