import { type JSX, useEffect, useState } from 'react';

import styles from './PinPad.module.css';
import { MAX_LOCK_MS } from './pinThrottle';

const PIN_LENGTH = 4;

interface PinPadProps {
  title: string;
  subtitle: string;
  onSubmit: (pin: string) => Promise<boolean>;
  onCancel: () => void;
  errorMessage?: string;
  /**
   * Throttle lock (#372): keys disable until `until` (epoch ms) and the pad
   * shows `message` as a countdown. One prop, not two, so no caller can
   * disable the keys without explaining why.
   */
  lock?: { until: number; message: (secondsLeft: number) => string };
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as const;

export const PinPad = ({
  title,
  subtitle,
  onSubmit,
  onCancel,
  errorMessage,
  lock,
}: PinPadProps): JSX.Element => {
  const lockedUntil = lock?.until ?? 0;
  const [digits, setDigits] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const locked = lockedUntil > now;

  // Tick while locked so the countdown moves and the keys re-enable on their
  // own. The zero-delay tick refreshes a `now` gone stale while the pad sat
  // open, because a bare setState in the effect body trips the lint rule.
  useEffect(() => {
    if (!locked) return;
    const tick = (): void => setNow(Date.now());
    const immediate = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 250);
    return () => {
      window.clearTimeout(immediate);
      window.clearInterval(id);
    };
  }, [locked, lockedUntil]);

  const submit = async (pin: string): Promise<void> => {
    setBusy(true);
    const ok = await onSubmit(pin);
    setBusy(false);
    if (!ok) {
      setError(errorMessage ?? 'Wrong PIN');
      setDigits('');
    }
  };

  const tap = (key: string): void => {
    if (busy || locked) return;
    setError(null);
    if (key === '⌫') {
      setDigits((d) => d.slice(0, -1));
      return;
    }
    if (!key) return;
    if (digits.length >= PIN_LENGTH) return;
    // Read `digits` from closure (not via a setDigits updater) so submit's
    // parent setStates don't fire while PinPad is mid-render. Trade-off: a
    // double-tap inside one frame would coalesce to a single digit, which
    // is fine for a 4-digit PIN entered by a parent on an iPad.
    const next = digits + key;
    setDigits(next);
    if (next.length === PIN_LENGTH) void submit(next);
  };

  return (
    <div className={styles.wrap}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.subtitle}>{subtitle}</p>
      <div className={styles.dots}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={[styles.dot, i < digits.length && styles.dotFilled]
              .filter(Boolean)
              .join(' ')}
          />
        ))}
      </div>
      <div className={styles.grid}>
        {KEYS.map((k, i) => (
          <button
            key={i}
            type="button"
            className={[styles.key, !k && styles.keyGhost].filter(Boolean).join(' ')}
            onClick={() => tap(k)}
            disabled={!k || busy || locked}
            aria-label={k === '⌫' ? 'Delete' : k || undefined}
          >
            {k}
          </button>
        ))}
      </div>
      <div className={styles.error}>
        {locked && lock
          ? // Clamped to the lock ceiling: the first locked paint still holds
            // a `now` from before the lock, and an unclamped difference would
            // flash an impossible number until the zero-delay tick lands.
            lock.message(
              Math.min(Math.max(1, Math.ceil((lockedUntil - now) / 1000)), MAX_LOCK_MS / 1000),
            )
          : (error ?? '')}
      </div>
      <button type="button" className={styles.cancel} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
};
