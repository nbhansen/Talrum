import { fireEvent, render, screen } from '@testing-library/react';
import { type JSX, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from './ErrorBoundary';

const Boom = ({ msg = 'boom' }: { msg?: string }): JSX.Element => {
  throw new Error(msg);
};

describe('ErrorBoundary', () => {
  // React logs caught errors to console.error during render. Silence so the
  // test output isn't polluted; restore so unrelated errors still surface.
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    errSpy.mockRestore();
  });

  it('renders children when no error', () => {
    render(
      <ErrorBoundary fallback={() => <span>fallback</span>}>
        <span>child</span>
      </ErrorBoundary>,
    );
    expect(screen.getByText('child')).toBeInTheDocument();
    expect(screen.queryByText('fallback')).not.toBeInTheDocument();
  });

  it('renders fallback when a child throws', () => {
    render(
      <ErrorBoundary fallback={() => <span>fallback</span>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('fallback')).toBeInTheDocument();
  });

  it('clears error state when reset() is called from the fallback', () => {
    // Toggleable child: throws while toggle=true, renders normally otherwise.
    // The fallback's button flips the toggle AND calls reset, so the next
    // render finds clean children.
    const Harness = (): JSX.Element => {
      const [throwing, setThrowing] = useState(true);
      return (
        <ErrorBoundary
          fallback={(reset) => (
            <button
              type="button"
              onClick={() => {
                setThrowing(false);
                reset();
              }}
            >
              retry
            </button>
          )}
        >
          {throwing ? <Boom /> : <span>recovered</span>}
        </ErrorBoundary>
      );
    };
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'retry' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(screen.getByText('recovered')).toBeInTheDocument();
  });

  it('catches a second throw after reset (state is not latched)', () => {
    // Reset clears the error, but a child that throws again on the next
    // render must re-trigger the fallback rather than bubble out.
    const Harness = (): JSX.Element => {
      const [n, setN] = useState(0);
      return (
        <ErrorBoundary
          fallback={(reset) => (
            <button
              type="button"
              onClick={() => {
                setN((x) => x + 1);
                reset();
              }}
            >
              retry-{n}
            </button>
          )}
        >
          <Boom msg={`boom-${n}`} />
        </ErrorBoundary>
      );
    };
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'retry-0' }));
    // Reset cleared, child re-rendered, child threw again → fallback again
    // with the bumped counter visible.
    expect(screen.getByRole('button', { name: 'retry-1' })).toBeInTheDocument();
  });
});
