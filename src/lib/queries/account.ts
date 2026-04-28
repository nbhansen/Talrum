import {
  type QueryClient,
  useMutation,
  type UseMutationResult,
  useQueryClient,
} from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

// Closed-set error codes shared with the edge function. The wire contract
// (the JSON `error` field) is the API; both sides must agree on these
// literal strings. Mirrors `supabase/functions/delete-account/types.ts:7-13`
// byte-for-byte. If the function adds a new code, add it here and update
// DeleteAccountDialog's toast map.
export type DeleteAccountErrorCode =
  | 'unauthorized'
  | 'method_not_allowed'
  | 'bad_request'
  | 'storage_purge_failed'
  | 'auth_delete_failed'
  | 'internal_error';

const KNOWN_CODES: ReadonlySet<DeleteAccountErrorCode> = new Set([
  'unauthorized',
  'method_not_allowed',
  'bad_request',
  'storage_purge_failed',
  'auth_delete_failed',
  'internal_error',
]);

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

export interface UseDeleteMyAccountOptions {
  /** Optional QueryClient injection for testing. Production code omits. */
  injectedClient?: QueryClient;
  /**
   * Callback fired BEFORE supabase.auth.signOut() — useful for navigating
   * to a public route before AuthGate transitions to 'out' and replaces
   * the subtree with <Login />. supabase-js fires onAuthStateChange
   * synchronously from inside signOut() (before the promise resolves), so
   * any post-signOut navigation runs after the dialog has already
   * unmounted. Navigating here is the only reliable order.
   */
  onPreSignOut?: () => void;
}

export const useDeleteMyAccount = (
  options: UseDeleteMyAccountOptions = {},
): UseMutationResult<void, DeleteAccountError, void> => {
  const ctxClient = useQueryClient();
  const qc = options.injectedClient ?? ctxClient;
  // Explicit generics so TError is the narrow DeleteAccountError (not the
  // TanStack default), and TVariables is `void` so callers `mutate()` with
  // no arg. The lint rule rejects `void` in generic positions; both uses
  // here are TanStack's documented "no data / no input" idiom.
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  return useMutation<void, DeleteAccountError, void>({
    mutationFn: async (): Promise<void> => {
      const { data, error } = await supabase.functions.invoke<{
        ok: boolean;
        error?: string;
        message?: string;
      }>('delete-account', { body: {} });
      if (error) {
        throw new DeleteAccountError('internal_error', error.message);
      }
      if (!data?.ok) {
        throw mapErrorCode({
          ok: false,
          error: data?.error ?? 'internal_error',
          message: data?.message,
        });
      }
    },
    onSuccess: async () => {
      // Order matters:
      //   1. clear the cache so no in-flight query refetches with a
      //      still-valid session and produces stale data.
      //   2. onPreSignOut (typically: navigate to /account-deleted) runs
      //      while the dialog is still mounted. AuthGate's
      //      onAuthStateChange listener fires synchronously inside
      //      signOut() and unmounts the dialog the instant the SIGNED_OUT
      //      event lands — too late to navigate from a useEffect on
      //      mutation.isSuccess.
      //   3. signOut last.
      qc.clear();
      options.onPreSignOut?.();
      await supabase.auth.signOut();
    },
  });
};
