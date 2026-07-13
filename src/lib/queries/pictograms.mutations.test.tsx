import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Board, Pictogram } from '@/types/domain';

interface MockPostgrestError {
  code: string;
  message: string;
  details: string;
  hint: string;
}
interface MockResult {
  error: MockPostgrestError | null;
}

// Rename / clear-audio row updates: from('pictograms').update({...}).eq('id', ...)
// — the eq call is the awaited terminal.
const eqMock = vi.fn<(col: string, val: string) => Promise<MockResult>>();
const updateMock = vi.fn(() => ({ eq: eqMock }));
// Delete runs server-side through the `delete_pictogram` RPC.
const rpcMock = vi.fn<(fn: string, args: Record<string, unknown>) => Promise<MockResult>>();
// Clear-audio best-effort removes the recording from storage before the row update.
const removeMock = vi.fn<(paths: string[]) => Promise<MockResult>>();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ update: updateMock }),
    rpc: (fn: string, args: Record<string, unknown>) => rpcMock(fn, args),
    storage: { from: () => ({ remove: removeMock }) },
  },
}));

// Import after the mock is registered.
const { pictogramsQueryKey } = await import('./pictograms.read');
const { boardsQueryKey } = await import('./boards.read');
const {
  __test_revokePictogramBlobs,
  useClearPictogramAudio,
  useDeletePictogram,
  useRenamePictogram,
} = await import('./pictograms.mutations');

const makeWrapper = (qc: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

const makeClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

const pictogramSeed = (): Pictogram[] => [
  {
    id: 'p1',
    label: 'Brush teeth',
    style: 'illus',
    glyph: 'tooth',
    tint: 'oklch(88% 0.06 90)',
    audioPath: 'owner-uuid/p1.webm',
  },
  { id: 'p2', label: 'Bed', style: 'illus', glyph: 'bed', tint: 'oklch(88% 0.06 200)' },
];

const boardSeed = (): Board[] => [
  {
    id: 'morning',
    ownerId: 'owner-uuid',
    kidId: 'liam',
    name: 'Morning routine',
    kind: 'sequence',
    labelsVisible: true,
    voiceMode: 'tts',
    stepIds: ['p1', 'p2'],
    kidReorderable: false,
    accent: 'peach',
    updatedLabel: 'Edited just now',
  },
  {
    id: 'evening',
    ownerId: 'owner-uuid',
    kidId: 'liam',
    name: 'Evening routine',
    kind: 'sequence',
    labelsVisible: true,
    voiceMode: 'tts',
    stepIds: ['p2'],
    kidReorderable: false,
    accent: 'peach',
    updatedLabel: 'Edited just now',
  },
];

// The outbox classifies coded errors (Postgres / PostgREST) as permanent —
// that's the path that triggers React Query's onError, which rolls the
// optimistic patch back. A plain TypeError without a code would instead
// enqueue silently.
const rlsError: MockPostgrestError = {
  code: '42501',
  message: 'row-level-security',
  details: '',
  hint: '',
};

beforeEach(() => {
  eqMock.mockReset();
  updateMock.mockClear();
  rpcMock.mockReset();
  removeMock.mockReset();
});

describe('useRenamePictogram', () => {
  it('applies an optimistic label patch before the DB responds, then invalidates on settle', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, pictogramSeed());
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    // Block the mutation so we can observe the optimistic state.
    let resolveEq: (v: MockResult) => void = () => {
      throw new Error('resolver not assigned');
    };
    eqMock.mockReturnValue(new Promise((r) => (resolveEq = r)));

    const { result } = renderHook(() => useRenamePictogram(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ pictogramId: 'p1', label: 'Floss' });
    });

    await waitFor(() => {
      const list = qc.getQueryData<Pictogram[]>(pictogramsQueryKey);
      expect(list?.find((p) => p.id === 'p1')?.label).toBe('Floss');
    });
    expect(
      qc.getQueryData<Pictogram[]>(pictogramsQueryKey)?.find((p) => p.id === 'p2')?.label,
    ).toBe('Bed');

    resolveEq({ error: null });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: pictogramsQueryKey });
  });

  it('rolls back the cache on a non-retryable DB error (RLS denial)', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, pictogramSeed());
    eqMock.mockResolvedValueOnce({ error: rlsError });

    const { result } = renderHook(() => useRenamePictogram(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ pictogramId: 'p1', label: 'Floss' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<Pictogram[]>(pictogramsQueryKey)).toEqual(pictogramSeed());
  });
});

describe('useDeletePictogram', () => {
  it('optimistically removes the pictogram and scrubs it from referencing boards, then invalidates both caches', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, pictogramSeed());
    qc.setQueryData(boardsQueryKey, boardSeed());
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    let resolveRpc: (v: MockResult) => void = () => {
      throw new Error('resolver not assigned');
    };
    rpcMock.mockReturnValue(new Promise((r) => (resolveRpc = r)));

    const { result } = renderHook(() => useDeletePictogram(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ pictogramId: 'p1' });
    });

    await waitFor(() => {
      expect(qc.getQueryData<Pictogram[]>(pictogramsQueryKey)?.map((p) => p.id)).toEqual(['p2']);
    });
    const boards = qc.getQueryData<Board[]>(boardsQueryKey);
    expect(boards?.find((b) => b.id === 'morning')?.stepIds).toEqual(['p2']);
    // A board that never referenced the pictogram keeps its steps untouched.
    expect(boards?.find((b) => b.id === 'evening')?.stepIds).toEqual(['p2']);

    resolveRpc({ error: null });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpcMock).toHaveBeenCalledWith('delete_pictogram', { p_pictogram_id: 'p1' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: pictogramsQueryKey });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: boardsQueryKey });
  });

  it('rolls back both caches on a non-retryable DB error', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, pictogramSeed());
    qc.setQueryData(boardsQueryKey, boardSeed());
    rpcMock.mockResolvedValueOnce({ error: rlsError });

    const { result } = renderHook(() => useDeletePictogram(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ pictogramId: 'p1' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<Pictogram[]>(pictogramsQueryKey)).toEqual(pictogramSeed());
    expect(qc.getQueryData<Board[]>(boardsQueryKey)).toEqual(boardSeed());
  });
});

describe('useClearPictogramAudio', () => {
  it('optimistically drops audioPath on the target pictogram only, then invalidates on settle', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, pictogramSeed());
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    removeMock.mockResolvedValue({ error: null });
    let resolveEq: (v: MockResult) => void = () => {
      throw new Error('resolver not assigned');
    };
    eqMock.mockReturnValue(new Promise((r) => (resolveEq = r)));

    const { result } = renderHook(() => useClearPictogramAudio(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ pictogramId: 'p1', path: 'owner-uuid/p1.webm' });
    });

    await waitFor(() => {
      const list = qc.getQueryData<Pictogram[]>(pictogramsQueryKey);
      expect(list?.find((p) => p.id === 'p1')?.audioPath).toBeUndefined();
    });
    expect(qc.getQueryData<Pictogram[]>(pictogramsQueryKey)?.find((p) => p.id === 'p2')).toEqual(
      pictogramSeed()[1],
    );

    resolveEq({ error: null });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(removeMock).toHaveBeenCalledWith(['owner-uuid/p1.webm']);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: pictogramsQueryKey });
  });

  it('restores audioPath on a non-retryable DB error (RLS denial)', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, pictogramSeed());
    removeMock.mockResolvedValue({ error: null });
    eqMock.mockResolvedValueOnce({ error: rlsError });

    const { result } = renderHook(() => useClearPictogramAudio(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ pictogramId: 'p1', path: 'owner-uuid/p1.webm' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<Pictogram[]>(pictogramsQueryKey)).toEqual(pictogramSeed());
  });
});

describe('revokePictogramBlobs (#28)', () => {
  // jsdom doesn't ship URL.revokeObjectURL; install a stub so vi.spyOn has
  // something to wrap. restoreAllMocks unwraps the spy, not the stub itself —
  // leaving the stub in place is harmless.
  if (typeof URL.revokeObjectURL !== 'function') {
    (URL as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => undefined;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('revokes blob:-prefixed imagePath and audioPath in the cache', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const qc = new QueryClient();
    qc.setQueryData<Pictogram[]>(pictogramsQueryKey, [
      { id: 'a', label: 'A', style: 'photo', imagePath: 'blob:http://localhost/photo-a' },
      {
        id: 'b',
        label: 'B',
        style: 'illus',
        glyph: 'sun',
        tint: 'oklch(90% 0.06 90)',
        audioPath: 'blob:http://localhost/audio-b',
      },
      // Already-uploaded rows have real signed-URL paths; never revoke those.
      { id: 'c', label: 'C', style: 'photo', imagePath: 'photos/c.jpg' },
    ]);
    __test_revokePictogramBlobs(qc);
    expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost/photo-a');
    expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost/audio-b');
    expect(revokeSpy).not.toHaveBeenCalledWith('photos/c.jpg');
    expect(revokeSpy).toHaveBeenCalledTimes(2);
  });

  it('is a no-op when the pictograms cache is empty', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const qc = new QueryClient();
    __test_revokePictogramBlobs(qc);
    expect(revokeSpy).not.toHaveBeenCalled();
  });
});
