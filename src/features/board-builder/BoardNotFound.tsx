import type { JSX } from 'react';

import { type ParentNavKey, ParentShell } from '@/layouts/ParentShell';
import { Button } from '@/ui/Button/Button';

import styles from './BoardNotFound.module.css';

export type BoardLoadFailureVariant = 'not-found' | 'error';

interface BoardNotFoundProps {
  variant: BoardLoadFailureVariant;
  onBack: () => void;
  onRetry?: () => void;
  onKidMode: () => void;
  onNav?: (id: ParentNavKey) => void;
}

const COPY: Record<BoardLoadFailureVariant, { title: string; body: string }> = {
  'not-found': {
    title: 'Board not found',
    body: 'This board doesn’t exist, or it belongs to another account.',
  },
  error: {
    title: 'Could not load board',
    body: 'We couldn’t reach the server. Check your connection and try again.',
  },
};

export const BoardNotFound = ({
  variant,
  onBack,
  onRetry,
  onKidMode,
  onNav,
}: BoardNotFoundProps): JSX.Element => {
  const { title, body } = COPY[variant];
  return (
    <ParentShell active="home" onKidMode={onKidMode} {...(onNav ? { onNav } : {})}>
      <div className={styles.wrap}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.body}>{body}</p>
        <div className={styles.actions}>
          <Button variant="primary" onClick={onBack}>
            Back to boards
          </Button>
          {variant === 'error' && onRetry && (
            <Button variant="ghost" onClick={onRetry}>
              Retry
            </Button>
          )}
        </div>
      </div>
    </ParentShell>
  );
};
