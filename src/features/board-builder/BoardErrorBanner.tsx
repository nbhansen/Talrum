import type { JSX } from 'react';

import styles from './BoardErrorBanner.module.css';

/**
 * Structurally compatible with every `useBoardPatch`-derived mutation
 * (rename, kind, labels, voice, kid-reorderable, set-step-ids), so this
 * banner can surface errors from any of them without widening the type.
 * The optional `retry` is provided by `useSetStepIds`; mutations without
 * a retry mechanism simply omit it.
 */
interface MutationLike {
  isError: boolean;
  reset: () => void;
  retry?: () => void;
}

interface Props {
  mutation: MutationLike;
  message?: string;
}

export const BoardErrorBanner = ({
  mutation,
  message = "Couldn't save change. Try again.",
}: Props): JSX.Element | null => {
  if (!mutation.isError) return null;
  const onRetry = mutation.retry;
  return (
    <div role="alert" className={styles.banner}>
      <span className={styles.message}>{message}</span>
      {onRetry && (
        <button
          type="button"
          className={styles.retry}
          onClick={() => {
            onRetry();
            mutation.reset();
          }}
        >
          Retry
        </button>
      )}
      <button type="button" className={styles.dismiss} onClick={() => mutation.reset()}>
        Dismiss
      </button>
    </div>
  );
};
