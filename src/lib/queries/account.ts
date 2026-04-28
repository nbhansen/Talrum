import { FunctionsHttpError } from '@supabase/supabase-js';
import {
  type QueryClient,
  useMutation,
  type UseMutationResult,
  useQueryClient,
} from '@tanstack/react-query';

import { performSignOut } from '@/lib/auth/session';
import { supabase } from '@/lib/supabase';

// Edge function name. Mirrored byte-for-byte by DELETE_ACCOUNT_FUNCTION_NAME
// in `supabase/functions/delete-account/types.ts` — tsconfig doesn't include
// supabase/ so a cross-import isn't possible. Extracting the literal here at
// least fails one test (below) if the directory is renamed without updating
// both sides.
const DELETE_ACCOUNT_FUNCTION_NAME = 'delete-account';

// Closed-set error codes shared with the edge function. The wire contract
// (the JSON `error` field) is the API; both sides must agree on these
// literal strings. Mirrors `supabase/functions/delete-account/types.ts`
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

// supabase-js wire shapes:
//   2xx → { data: <parsed body>, error: null }
//   4xx/5xx → { data: null, error: FunctionsHttpError } where error.context
//             is the original Response (body must be re-parsed by us).
// The edge function's success body is { ok: true }; its error body is
// { ok: false, error: <code>, message: <copy> }. We only ever see the latter
// inside FunctionsHttpError.context, never as a 2xx { ok: false } payload.
type DeleteResponse = { ok: true } | { ok: false; error: string; message: string };

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
      const { data, error } = await supabase.functions.invoke<DeleteResponse>(
        DELETE_ACCOUNT_FUNCTION_NAME,
        { body: {} },
      );
      if (error) {
        // supabase-js routes 4xx/5xx into `error` (a FunctionsHttpError)
        // with the original Response on `.context`. Parse the body to
        // recover the closed-set error code; without this the toast in
        // DeleteAccountDialog always falls through to 'internal_error'
        // and the unauthorized / storage_purge_failed / auth_delete_failed
        // branches are unreachable.
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
      if (!data?.ok) {
        // Defensive: the function never emits a 2xx { ok: false } today,
        // but if it ever did we'd still want to map the code.
        throw mapErrorCode({
          ok: false,
          error: (data as { error?: string } | null)?.error ?? 'internal_error',
          message: (data as { message?: string } | null)?.message,
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
      await performSignOut();
    },
  });
};
