import { render, screen, waitFor } from '@testing-library/react';
import { isValidElement, type JSX, type ReactElement, Suspense } from 'react';
import {
  createMemoryRouter,
  MemoryRouter,
  type RouteObject,
  RouterProvider,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountDeletedRoute } from '@/features/account-deleted/AccountDeletedRoute';
import { PrivacyPolicyRoute } from '@/features/privacy-policy/PrivacyPolicyRoute';
import { ErrorBoundary } from '@/ui/ErrorBoundary/ErrorBoundary';

import { kidRouteFallback, parentRouteFallback, router, wrap } from './routes';

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

  it('/account-deleted is reachable without authentication', async () => {
    const memRouter = createMemoryRouter(
      [{ path: '/account-deleted', element: wrap(<AccountDeletedRoute />, 'parent') }],
      { initialEntries: ['/account-deleted'] },
    );
    render(<RouterProvider router={memRouter} />);
    await waitFor(() => {
      expect(screen.getByTestId('account-deleted-route')).toBeInTheDocument();
    });
    // The link points at '/' — the canonical signed-out landing (Login).
    // There is no '/login' route in routes.tsx; the previous test that
    // stubbed one masked a dead link.
    expect(screen.getByRole('link', { name: /sign up again/i }).getAttribute('href')).toBe('/');
  });

  it('/privacy-policy renders the markdown content', async () => {
    const memRouter = createMemoryRouter(
      [{ path: '/privacy-policy', element: wrap(<PrivacyPolicyRoute />, 'parent') }],
      { initialEntries: ['/privacy-policy'] },
    );
    render(<RouterProvider router={memRouter} />);
    await waitFor(() => {
      expect(screen.getByTestId('privacy-policy-route')).toBeInTheDocument();
    });
    // First H1 in docs/privacy-policy.md is "Privacy Policy".
    expect(screen.getByRole('heading', { level: 1, name: /privacy policy/i })).toBeInTheDocument();
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
