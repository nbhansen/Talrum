import { FunctionsHttpError } from '@supabase/supabase-js';
import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

import { performSignOut } from '@/lib/auth/session';
import { supabase } from '@/lib/supabase';

// Mirrored in `supabase/functions/delete-account/types.ts`, because tsconfig
// excludes supabase/. A test below fails if the two drift apart.
const DELETE_ACCOUNT_FUNCTION_NAME = 'delete-account';

// The wire contract. Add a code here and in DeleteAccountDialog's toast map
// whenever the edge function adds one.
const DELETE_ACCOUNT_ERROR_CODES = [
  'unauthorized',
  'method_not_allowed',
  'bad_request',
  'storage_purge_failed',
  'auth_delete_failed',
  'internal_error',
] as const;

export type DeleteAccountErrorCode = (typeof DELETE_ACCOUNT_ERROR_CODES)[number];

const KNOWN_CODES: ReadonlySet<DeleteAccountErrorCode> = new Set(DELETE_ACCOUNT_ERROR_CODES);

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
  message?: string | undefined;
}

export const mapErrorCode = (payload: RawErrorPayload): DeleteAccountError => {
  const code: DeleteAccountErrorCode = KNOWN_CODES.has(payload.error as DeleteAccountErrorCode)
    ? (payload.error as DeleteAccountErrorCode)
    : 'internal_error';
  return new DeleteAccountError(code, payload.message ?? '');
};

// supabase-js routes 4xx/5xx into `error`, carrying the original Response on
// `.context`, so an error body is only ever reachable by re-parsing that.
type DeleteResponse = { ok: true } | { ok: false; error: string; message: string };

export interface UseDeleteMyAccountOptions {
  /**
   * Fired before signOut. supabase-js fires onAuthStateChange synchronously
   * from inside signOut(), so anything after it runs on an unmounted tree.
   */
  onPreSignOut?: () => void;
}

export const useDeleteMyAccount = (
  options: UseDeleteMyAccountOptions = {},
): UseMutationResult<void, DeleteAccountError, void> => {
  const qc = useQueryClient();
  // Explicit generics narrow TError and make `mutate()` argument-free. The
  // lint rule rejects `void` here, but this is TanStack's documented idiom.
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  return useMutation<void, DeleteAccountError, void>({
    mutationFn: async (): Promise<void> => {
      const { data, error } = await supabase.functions.invoke<DeleteResponse>(
        DELETE_ACCOUNT_FUNCTION_NAME,
        { body: {} },
      );
      if (error) {
        // Recover the closed-set code from the body, or every toast falls
        // through to 'internal_error'.
        if (error instanceof FunctionsHttpError) {
          try {
            const body: unknown = await error.context.clone().json();
            if (
              body !== null &&
              typeof body === 'object' &&
              'error' in body &&
              typeof (body as { error: unknown }).error === 'string'
            ) {
              const errorField = (body as { error: string }).error;
              const messageField =
                'message' in body && typeof (body as { message: unknown }).message === 'string'
                  ? (body as { message: string }).message
                  : undefined;
              throw mapErrorCode({ ok: false, error: errorField, message: messageField });
            }
          } catch (parseErr) {
            // Re-throw our own mapped error; swallow JSON parse / shape
            // failures and fall through to the generic internal_error
            // throw below.
            if (parseErr instanceof DeleteAccountError) throw parseErr;
          }
        }
        throw new DeleteAccountError('internal_error', error.message);
      }
      // An empty or malformed 2xx body must not read as a completed deletion.
      if (!data?.ok) throw new DeleteAccountError('internal_error', 'Unexpected response body.');
    },
    onSuccess: async () => {
      // Clear first, so no in-flight query refetches on a live session.
      // Navigate second, while the dialog is still mounted — signOut unmounts
      // it synchronously. Sign out last.
      qc.clear();
      options.onPreSignOut?.();
      await performSignOut();
    },
  });
};
