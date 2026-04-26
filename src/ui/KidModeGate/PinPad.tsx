import { type JSX, useState } from 'react';

import styles from './PinPad.module.css';

const PIN_LENGTH = 4;

interface PinPadProps {
  title: string;
  subtitle: string;
  onSubmit: (pin: string) => Promise<boolean>;
  onCancel: () => void;
  errorMessage?: string;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as const;

export const PinPad = ({
  title,
  subtitle,
  onSubmit,
  onCancel,
  errorMessage,
}: PinPadProps): JSX.Element => {
  const [digits, setDigits] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    if (busy) return;
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
            disabled={!k || busy}
            aria-label={k === '⌫' ? 'Delete' : k || undefined}
          >
            {k}
          </button>
        ))}
      </div>
      <div className={styles.error}>{error ?? ''}</div>
      <button type="button" className={styles.cancel} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
};
