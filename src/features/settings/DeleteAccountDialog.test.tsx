import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mutateMock = vi.fn();
const mutationState = {
  isPending: false,
  isError: false,
  isSuccess: false,
  error: null as Error | null,
};

vi.mock('@/lib/queries/account', () => ({
  useDeleteMyAccount: () => ({
    mutate: mutateMock,
    isPending: mutationState.isPending,
    isError: mutationState.isError,
    isSuccess: mutationState.isSuccess,
    error: mutationState.error,
  }),
  DeleteAccountError: class extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

const { DeleteAccountDialog } = await import('./DeleteAccountDialog');

const makeWrapper = (children: ReactNode): JSX.Element => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

beforeEach(() => {
  mutateMock.mockReset();
  mutationState.isPending = false;
  mutationState.isError = false;
  mutationState.isSuccess = false;
  mutationState.error = null;
});

describe('DeleteAccountDialog', () => {
  const renderDialog = (
    onSuccess = vi.fn(),
    onCancel = vi.fn(),
  ): { onSuccess: typeof onSuccess; onCancel: typeof onCancel } => {
    render(makeWrapper(<DeleteAccountDialog onSuccess={onSuccess} onCancel={onCancel} />));
    return { onSuccess, onCancel };
  };

  it('initially: destructive button disabled, cancel enabled', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: /delete forever/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeEnabled();
  });

  it('typing wrong phrase keeps button disabled', async () => {
    renderDialog();
    const input = screen.getByLabelText(/type/i);
    await userEvent.type(input, 'delete me');
    expect(screen.getByRole('button', { name: /delete forever/i })).toBeDisabled();
  });

  it('typing "delete my account" enables the button', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText(/type/i), 'delete my account');
    expect(screen.getByRole('button', { name: /delete forever/i })).toBeEnabled();
  });

  it('case-insensitive: "DELETE MY ACCOUNT" enables', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText(/type/i), 'DELETE MY ACCOUNT');
    expect(screen.getByRole('button', { name: /delete forever/i })).toBeEnabled();
  });

  it('whitespace tolerated: "  delete my account  " enables', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText(/type/i), '  delete my account  ');
    expect(screen.getByRole('button', { name: /delete forever/i })).toBeEnabled();
  });

  it('clicking destructive fires the mutation', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText(/type/i), 'delete my account');
    await userEvent.click(screen.getByRole('button', { name: /delete forever/i }));
    expect(mutateMock).toHaveBeenCalledTimes(1);
  });

  it('while pending: both buttons disabled, spinner visible', () => {
    mutationState.isPending = true;
    renderDialog();
    expect(screen.getByRole('button', { name: /delete forever/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('Cancel button → onCancel prop fires; mutation NOT called', async () => {
    const { onCancel } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('default focus is the Cancel button', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: /cancel/i })).toHaveFocus();
  });

  it('shows toast on storage_purge_failed error', () => {
    mutationState.isError = true;
    mutationState.error = Object.assign(new Error('m'), { code: 'storage_purge_failed' });
    renderDialog();
    expect(screen.getByRole('alert')).toHaveTextContent(/media files/i);
  });

  it('shows toast on auth_delete_failed error', () => {
    mutationState.isError = true;
    mutationState.error = Object.assign(new Error('m'), { code: 'auth_delete_failed' });
    renderDialog();
    expect(screen.getByRole('alert')).toHaveTextContent(/complete the deletion/i);
  });

  it('falls back to generic toast on unknown error', () => {
    mutationState.isError = true;
    mutationState.error = Object.assign(new Error('m'), { code: 'internal_error' });
    renderDialog();
    expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i);
  });
});
