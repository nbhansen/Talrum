import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { TestProviders } from '@/lib/queries/queries.test-utils';

import { SettingsRoute } from './SettingsRoute';

vi.mock('@/lib/queries/boards', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, useBoards: () => ({ data: [], isPending: false }) };
});

vi.mock('@/lib/queries/account', () => ({
  useDeleteMyAccount: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
  }),
}));

const renderRoute = (): void => {
  render(
    <TestProviders>
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<SettingsRoute />} />
        </Routes>
      </MemoryRouter>
    </TestProviders>,
  );
};

describe('SettingsRoute', () => {
  it('renders the Settings header and the signed-in account block', () => {
    renderRoute();
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('parent@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sign out$/i })).toBeInTheDocument();
  });

  it('renders the Language section (#304)', () => {
    renderRoute();
    expect(screen.getByRole('heading', { name: 'Language' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Dansk' })).toBeInTheDocument();
  });

  it('renders the Delete-my-account section', () => {
    renderRoute();
    expect(screen.getByRole('button', { name: /delete my account/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /privacy policy/i })).toBeInTheDocument();
  });
});
