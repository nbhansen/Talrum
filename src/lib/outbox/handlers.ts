import { supabase } from '@/lib/supabase';

import type { OutboxEntry, UpdateBoardEntry } from './types';

/**
 * Thrown by handlers when the failure is permanent (RLS denial, validation,
 * not-found). The drain loop converts these to a `failed` status and stops
 * re-trying the entry. Anything else is treated as transient (network, 5xx)
 * and the entry stays pending for the next drain.
 */
export class UnretryableOutboxError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'UnretryableOutboxError';
  }
}

/**
 * Supabase's PostgrestError carries a Postgres error code (e.g. `42501` for
 * RLS denied) or a PostgREST sentinel (e.g. `PGRST116` for not-found via
 * `.single()`). Treat any coded error as the server's deliberate response
 * and refuse to retry it. Network failures surface as TypeError without a
 * code — those stay retryable.
 */
const isCodedError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string';

const handleUpdateBoard = async (entry: UpdateBoardEntry): Promise<void> => {
  const { error } = await supabase.from('boards').update(entry.patch).eq('id', entry.boardId);
  if (!error) return;
  if (isCodedError(error)) {
    throw new UnretryableOutboxError(error.message, { cause: error });
  }
  throw error;
};

export const runHandler = (entry: OutboxEntry): Promise<void> => {
  switch (entry.kind) {
    case 'updateBoard':
      return handleUpdateBoard(entry);
  }
};
