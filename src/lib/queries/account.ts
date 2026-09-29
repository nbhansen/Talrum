import { FunctionsHttpError } from '@supabase/supabase-js';
import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

import { performSignOut } from '@/lib/auth/session';
import { CodedError, codeFromHttpError } from '@/lib/queries/edgeFunction';
import { supabase } from '@/lib/supabase';

// Mirrored in `supabase/functions/delete-account/types.ts`, because tsconfig
// excludes supabase/. wireContract.test.ts fails if the two drift apart.
export const DELETE_ACCOUNT_FUNCTION_NAME = 'delete-account';

// The wire contract. Add a code here and in DeleteAccountDialog's toast map
// whenever the edge function adds one.
export const DELETE_ACCOUNT_ERROR_CODES = [
  'unauthorized',
  'method_not_allowed',
  'bad_request',
  'storage_purge_failed',
  'auth_delete_failed',
  'internal_error',
] as const;

type DeleteAccountErrorCode = (typeof DELETE_ACCOUNT_ERROR_CODES)[number];

export type DeleteAccountError = CodedError<DeleteAccountErrorCode>;

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
        const code =
          error instanceof FunctionsHttpError
            ? await codeFromHttpError(error, DELETE_ACCOUNT_ERROR_CODES)
            : 'internal_error';
        throw new CodedError(code, error.message);
      }
      // An empty or malformed 2xx body must not read as a completed deletion.
      if (!data?.ok) throw new CodedError('internal_error', 'Unexpected response body.');
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
