import { type PointerEvent, type SyntheticEvent, useEffect, useRef } from 'react';

export const LONG_PRESS_MS = 600;
const MOVE_TOLERANCE_PX = 8;

interface UseLongPressOptions {
  onLongPress: () => void;
  onTap: () => void;
  disabled?: boolean;
}

export interface LongPressBindings {
  onPointerDown: (e: PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
  onClick: () => void;
  onContextMenu: (e: SyntheticEvent) => void;
}

/**
 * Tap goes through `click`, so keyboard activation still taps. A fired hold
 * swallows the click that follows the pointer-up.
 */
export const useLongPress = ({
  onLongPress,
  onTap,
  disabled = false,
}: UseLongPressOptions): LongPressBindings => {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = (): void => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };

  useEffect(() => {
    if (disabled) clear();
    return clear;
  }, [disabled]);

  return {
    onPointerDown: (e) => {
      if (disabled || !e.isPrimary || e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        fired.current = true;
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e) => {
      if (!start.current) return;
      const dx = e.clientX - start.current.x;
      const dy = e.clientY - start.current.y;
      if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) clear();
    },
    onPointerUp: clear,
    // Leaving or losing the pointer also drops a fired hold: the click will
    // not land on this element, and a stale flag would swallow the next
    // keyboard activation.
    onPointerCancel: () => {
      fired.current = false;
      clear();
    },
    onPointerLeave: () => {
      fired.current = false;
      clear();
    },
    onClick: () => {
      if (fired.current) {
        fired.current = false;
        return;
      }
      onTap();
    },
    onContextMenu: (e) => e.preventDefault(),
  };
};
