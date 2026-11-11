import type { KeyboardEvent } from 'react';

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/** Arrow, Home and End keys for a tablist or radiogroup: select the next item and focus it. */
export const rovingKeyDown = <V>(
  e: KeyboardEvent<HTMLElement>,
  role: 'tab' | 'radio',
  values: readonly V[],
  current: V | null,
  select: (next: V) => void,
): void => {
  const step = STEP[e.key];
  const last = values.length - 1;
  const at = current === null ? -1 : values.indexOf(current);
  let next: number;
  if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = last;
  else if (step === undefined) return;
  else if (at < 0) next = step > 0 ? 0 : last;
  else next = (at + step + values.length) % values.length;
  const value = values[next];
  if (value === undefined) return;
  e.preventDefault();
  if (value !== current) select(value);
  e.currentTarget.querySelectorAll<HTMLElement>(`[role="${role}"]`)[next]?.focus();
};
