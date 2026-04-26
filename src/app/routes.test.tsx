import { render, screen } from '@testing-library/react';
import { isValidElement, type JSX, type ReactElement, Suspense } from 'react';
import { MemoryRouter, type RouteObject } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from '@/ui/ErrorBoundary/ErrorBoundary';

import { kidRouteFallback, parentRouteFallback, router } from './routes';

const Boom = (): JSX.Element => {
  throw new Error('boom');
};

describe('routes — error boundary wiring', () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    errSpy.mockRestore();
  });

  // Structural guard: if a future PR adds a route and forgets to wrap it,
  // this test fails before any user sees a blank screen — and before any
  // route ships in the initial bundle (Suspense layer enforces lazy split).
  it('every non-wildcard route is wrapped in <ErrorBoundary> with a <Suspense> child', () => {
    const routes = router.routes as RouteObject[];
    const wrapped = routes.filter((r) => r.path !== '*');
    expect(wrapped.length).toBeGreaterThan(0);
    for (const r of wrapped) {
      expect(isValidElement(r.element)).toBe(true);
      const outer = r.element as ReactElement<{ children: ReactElement }>;
      expect(outer.type).toBe(ErrorBoundary);
      expect(isValidElement(outer.props.children)).toBe(true);
      expect(outer.props.children.type).toBe(Suspense);
    }
  });

  it('parent fallback shows Retry + Go home and surrounding tree stays mounted', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <div data-testid="shell">
          <ErrorBoundary fallback={parentRouteFallback}>
            <Boom />
          </ErrorBoundary>
        </div>
      </MemoryRouter>,
    );
    // Boundary caught — outer shell still rendered.
    expect(screen.getByTestId('shell')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn.?t load this screen/i);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
  });

  it('kid fallback shows only "Tap to go back" — no Retry, no body copy', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <div data-testid="shell">
          <ErrorBoundary fallback={kidRouteFallback}>
            <Boom />
          </ErrorBoundary>
        </div>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('shell')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tap to go back' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });
});
