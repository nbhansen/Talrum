// Stub: contract surface only. Real implementation lands in the next commit.
// This file exists to satisfy module resolution for the test file in the
// same red-state commit; every export here intentionally throws so the
// tests fail at runtime as TDD requires.
import type { QueryClient, UseMutationResult } from '@tanstack/react-query';

export type DeleteAccountErrorCode =
  | 'unauthorized'
  | 'method_not_allowed'
  | 'bad_request'
  | 'storage_purge_failed'
  | 'auth_delete_failed'
  | 'internal_error';

export class DeleteAccountError extends Error {
  constructor(
    public readonly code: DeleteAccountErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DeleteAccountError';
  }
}

interface RawErrorPayload {
  ok: false;
  error: string;
  message?: string;
}

export const mapErrorCode = (_payload: RawErrorPayload): DeleteAccountError => {
  throw new Error('not implemented');
};

export const useDeleteMyAccount = (
  _injectedClient?: QueryClient,
): UseMutationResult<void, DeleteAccountError, void> => {
  throw new Error('not implemented');
};
