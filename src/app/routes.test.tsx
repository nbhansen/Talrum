import { render, screen, waitFor } from '@testing-library/react';
import { isValidElement, type JSX, type ReactElement, Suspense } from 'react';
import {
  createMemoryRouter,
  MemoryRouter,
  type RouteObject,
  RouterProvider,
  useSearchParams,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountDeletedRoute } from '@/app/routes/AccountDeletedRoute';
import { PrivacyPolicyRoute } from '@/app/routes/PrivacyPolicyRoute';
import { clearPin, setPin } from '@/lib/pin';
import { ErrorBoundary } from '@/ui/ErrorBoundary/ErrorBoundary';

import { PUBLIC_PATHS } from './publicPaths';
import { kidRouteFallback, parentRouteFallback, router, wrap } from './routes';

const Boom = (): JSX.Element => {
  throw new Error('boom');
};

// Makes the guard's destination and its `?pin=required` reason observable.
const SettingsProbe = (): JSX.Element => {
  const [params] = useSearchParams();
  return <div data-testid="settings">{params.get('pin')}</div>;
};

// A route renamed in routes.tsx but not in publicPaths.ts would strand
// signed-out users on a Login screen they cannot dismiss.
describe('PUBLIC_PATHS ↔ router consistency', () => {
  it('every PUBLIC_PATH is a real path defined in the router', () => {
    const definedPaths = new Set((router.routes as RouteObject[]).map((r) => r.path));
    for (const p of PUBLIC_PATHS) {
      expect(definedPaths.has(p)).toBe(true);
    }
  });

  it('PUBLIC_PATHS contains exactly the documented public routes', () => {
    // Bumping this forces the author to confirm a new public route is intended.
    expect(PUBLIC_PATHS.size).toBe(2);
    expect(PUBLIC_PATHS.has('/account-deleted')).toBe(true);
    expect(PUBLIC_PATHS.has('/privacy-policy')).toBe(true);
  });
});

describe('routes — error boundary wiring', () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    errSpy.mockRestore();
  });

  // Catches an unwrapped route before a user sees a blank screen, and a
  // non-lazy one before it ships in the initial bundle.
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
      <MemoryRouter>
        <div data-testid="shell">
          <ErrorBoundary fallback={parentRouteFallback}>
            <Boom />
          </ErrorBoundary>
        </div>
      </MemoryRouter>,
    );
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
    // '/' is the signed-out landing; there is no '/login' route to point at.
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
    // The first H1 in docs/privacy-policy.md.
    expect(screen.getByRole('heading', { level: 1, name: /privacy policy/i })).toBeInTheDocument();
  });

  // The absence of any link, not the labels: relabelling a button must not
  // quietly reopen the last ungated route out of kid mode (#371).
  it('a crashing kid route contains the child instead of linking to parent home (#371)', () => {
    render(
      <MemoryRouter>
        <div data-testid="shell">
          <ErrorBoundary fallback={kidRouteFallback}>
            <Boom />
          </ErrorBoundary>
        </div>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('shell')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tap to try again' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    // The parent fallback's copy.
    expect(screen.queryByText(/Couldn.?t load this screen/i)).not.toBeInTheDocument();
  });
});

/**
 * At the router level, which is where the containment invariant lives (#353).
 * `KidModeGate.test.tsx` covers the widget and passed throughout the bug's
 * lifetime, which is why this layer needs its own tests.
 */
describe('kid routes require a device PIN (#353)', () => {
  const KidScreen = (): JSX.Element => <div data-testid="kid-screen" />;

  const mountKidRoute = (): void => {
    const memRouter = createMemoryRouter(
      [
        { path: '/kid/sequence/:boardId', element: wrap(<KidScreen />, 'kid') },
        { path: '/settings', element: <SettingsProbe /> },
        { path: '/boards/:boardId/edit', element: <div data-testid="board-builder" /> },
      ],
      { initialEntries: ['/kid/sequence/b1'] },
    );
    render(<RouterProvider router={memRouter} />);
  };

  beforeEach(() => {
    clearPin();
  });
  afterEach(() => {
    clearPin();
  });

  it('redirects to Settings with a reason instead of opening a kid screen', async () => {
    mountKidRoute();

    await waitFor(() => expect(screen.getByTestId('settings')).toBeInTheDocument());
    expect(screen.getByTestId('settings')).toHaveTextContent('required');
    expect(screen.queryByTestId('kid-screen')).not.toBeInTheDocument();
    // Never the board builder — the destructive surface the escape landed on.
    expect(screen.queryByTestId('board-builder')).not.toBeInTheDocument();
  });

  it('opens the kid screen once a PIN exists', async () => {
    await setPin('1234');
    mountKidRoute();

    await waitFor(() => expect(screen.getByTestId('kid-screen')).toBeInTheDocument());
    expect(screen.queryByTestId('settings')).not.toBeInTheDocument();
  });

  // Fails if a kid route is given the 'parent' variant to dodge the gate.
  it('every /kid/* route in the real manifest is PIN-guarded', async () => {
    const kidPaths = (router.routes as RouteObject[])
      .map((r) => r.path)
      .filter((p): p is string => typeof p === 'string' && p.startsWith('/kid/'));
    expect(kidPaths.length).toBeGreaterThan(0);

    for (const path of kidPaths) {
      clearPin();
      const concrete = path.replace(':boardId', 'b1');
      const entry = (router.routes as RouteObject[]).find((r) => r.path === path);
      const memRouter = createMemoryRouter(
        [
          { path, element: entry?.element },
          { path: '/settings', element: <SettingsProbe /> },
        ],
        { initialEntries: [concrete] },
      );
      const view = render(<RouterProvider router={memRouter} />);
      await waitFor(() => expect(screen.getByTestId('settings')).toBeInTheDocument());
      expect(screen.getByTestId('settings')).toHaveTextContent('required');
      view.unmount();
    }
  });
});
