import { fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LONG_PRESS_MS, useLongPress } from './useLongPress';

const Target = ({
  onLongPress,
  onTap,
  disabled,
}: {
  onLongPress: () => void;
  onTap: () => void;
  disabled?: boolean;
}): JSX.Element => {
  const press = useLongPress({
    onLongPress,
    onTap,
    ...(disabled === undefined ? {} : { disabled }),
  });
  return (
    <button type="button" {...press}>
      Tile
    </button>
  );
};

const down = (el: HTMLElement, x = 10, y = 10): void => {
  fireEvent.pointerDown(el, { isPrimary: true, button: 0, clientX: x, clientY: y });
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useLongPress', () => {
  it('fires onLongPress after the hold and suppresses the following click', () => {
    const onLongPress = vi.fn();
    const onTap = vi.fn();
    render(<Target onLongPress={onLongPress} onTap={onTap} />);
    const el = screen.getByRole('button');

    down(el);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    fireEvent.pointerUp(el);
    fireEvent.click(el);

    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onTap).not.toHaveBeenCalled();
  });

  it('a shorter press calls onTap on click', () => {
    const onLongPress = vi.fn();
    const onTap = vi.fn();
    render(<Target onLongPress={onLongPress} onTap={onTap} />);
    const el = screen.getByRole('button');

    down(el);
    vi.advanceTimersByTime(LONG_PRESS_MS / 2);
    fireEvent.pointerUp(el);
    fireEvent.click(el);

    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a move past the tolerance',
      (el: HTMLElement) => fireEvent.pointerMove(el, { clientX: 40, clientY: 10 }),
    ],
    ['pointercancel', (el: HTMLElement) => fireEvent.pointerCancel(el)],
    ['pointerleave', (el: HTMLElement) => fireEvent.pointerLeave(el)],
  ])('cancels the hold on %s', (_label, interrupt) => {
    const onLongPress = vi.fn();
    render(<Target onLongPress={onLongPress} onTap={vi.fn()} />);
    const el = screen.getByRole('button');

    down(el);
    vi.advanceTimersByTime(LONG_PRESS_MS / 2);
    interrupt(el);
    vi.advanceTimersByTime(LONG_PRESS_MS);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('clears a pending hold when disabled flips true', () => {
    const onLongPress = vi.fn();
    const { rerender } = render(<Target onLongPress={onLongPress} onTap={vi.fn()} />);
    const el = screen.getByRole('button');

    down(el);
    rerender(<Target onLongPress={onLongPress} onTap={vi.fn()} disabled />);
    vi.advanceTimersByTime(LONG_PRESS_MS);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('prevents the context menu so a hold does not open a browser menu', () => {
    render(<Target onLongPress={vi.fn()} onTap={vi.fn()} />);
    const el = screen.getByRole('button');
    const prevented = !fireEvent.contextMenu(el);
    expect(prevented).toBe(true);
  });
});
