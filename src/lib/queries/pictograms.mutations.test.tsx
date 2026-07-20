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
/** Supabase Storage errors carry an HTTP statusCode instead of a PG code. */
interface MockStorageError {
  statusCode: number;
  message: string;
}
interface MockResult {
  error: MockPostgrestError | MockStorageError | null;
}

// Rename / clear-audio row updates: from('pictograms').update({...}).eq('id', ...)
// — the eq call is the awaited terminal.
const eqMock = vi.fn<(col: string, val: string) => Promise<MockResult>>();
const updateMock = vi.fn(() => ({ eq: eqMock }));
// Photo creation inserts the row after the storage upload.
const insertMock = vi.fn<(row: Record<string, unknown>) => Promise<MockResult>>();
// Delete runs server-side through the `delete_pictogram` RPC.
const rpcMock = vi.fn<(fn: string, args: Record<string, unknown>) => Promise<MockResult>>();
// Blob-planting mutations upload through the outbox before touching the row.
const uploadMock = vi.fn<(path: string, blob: Blob, opts: unknown) => Promise<MockResult>>();
// Clear-audio best-effort removes the recording from storage before the row update.
const removeMock = vi.fn<(paths: string[]) => Promise<MockResult>>();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ update: updateMock, insert: insertMock }),
    rpc: (fn: string, args: Record<string, unknown>) => rpcMock(fn, args),
    storage: { from: () => ({ remove: removeMock, upload: uploadMock }) },
  },
}));

// Import after the mock is registered.
const { pictogramsQueryKey } = await import('./pictograms.read');
const { boardsQueryKey } = await import('./boards.read');
const {
  __test_revokePictogramBlobs,
  useClearPictogramAudio,
  useCreatePhotoPictogram,
  useDeletePictogram,
  useRenamePictogram,
  useReplacePictogramImage,
  useSetPictogramAudio,
} = await import('./pictograms.mutations');
const { TestSessionProvider } = await import('@/lib/auth/session.test-utils');

const makeWrapper = (qc: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

// The upload mutations read the owner id from the session.
const makeSessionWrapper = (qc: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={qc}>
      <TestSessionProvider>{children}</TestSessionProvider>
    </QueryClientProvider>
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
  insertMock.mockReset();
  rpcMock.mockReset();
  uploadMock.mockReset();
  removeMock.mockReset();
  // Fresh per test: later describes spyOn/assert these, and a mock carried
  // across tests would leak call history into their counts.
  URL.createObjectURL = vi.fn(() => 'blob:planted');
  URL.revokeObjectURL = vi.fn();
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

describe('useSetPictogramAudio', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:planted-audio');
    URL.revokeObjectURL = vi.fn();
  });

  it('plants a blob URL optimistically, uploads, points the row at the path, then revokes and invalidates', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, pictogramSeed());
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    let resolveUpload: (v: MockResult) => void = () => {
      throw new Error('resolver not assigned');
    };
    uploadMock.mockReturnValue(new Promise((r) => (resolveUpload = r)));
    eqMock.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useSetPictogramAudio(), {
      wrapper: makeSessionWrapper(qc),
    });

    const blob = new Blob(['voice'], { type: 'audio/webm' });
    act(() => {
      result.current.mutate({ pictogramId: 'p2', blob, extension: 'webm', previousPath: null });
    });

    // Optimistic window: tile plays the local blob before the upload lands.
    await waitFor(() => {
      const list = qc.getQueryData<Pictogram[]>(pictogramsQueryKey);
      expect(list?.find((p) => p.id === 'p2')?.audioPath).toBe('blob:planted-audio');
    });

    resolveUpload({ error: null });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [path, uploadedBlob] = uploadMock.mock.calls[0] as [string, Blob, unknown];
    expect(path).toMatch(/\/p2\.webm$/);
    expect(uploadedBlob).toBe(blob);
    expect(updateMock).toHaveBeenCalledWith({ audio_path: path });
    expect(eqMock).toHaveBeenCalledWith('id', 'p2');
    // No previous recording → no storage cleanup.
    expect(removeMock).not.toHaveBeenCalled();
    // Settle sweep: the planted blob URL is revoked, then the cache refetches.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:planted-audio');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: pictogramsQueryKey });
  });

  it('cleans up the previous recording when the extension changed', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, pictogramSeed());
    uploadMock.mockResolvedValue({ error: null });
    eqMock.mockResolvedValue({ error: null });
    removeMock.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useSetPictogramAudio(), {
      wrapper: makeSessionWrapper(qc),
    });

    act(() => {
      result.current.mutate({
        pictogramId: 'p1',
        blob: new Blob(['voice'], { type: 'audio/webm' }),
        extension: 'webm',
        previousPath: 'owner-uuid/p1.m4a',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(removeMock).toHaveBeenCalledWith(['owner-uuid/p1.m4a']);
  });

  it('still revokes the planted blob URL and invalidates when the upload fails permanently', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, pictogramSeed());
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    uploadMock.mockResolvedValue({ error: { statusCode: 403, message: 'not allowed' } });

    const { result } = renderHook(() => useSetPictogramAudio(), {
      wrapper: makeSessionWrapper(qc),
    });

    act(() => {
      result.current.mutate({
        pictogramId: 'p2',
        blob: new Blob(['voice'], { type: 'audio/webm' }),
        extension: 'webm',
        previousPath: null,
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(updateMock).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:planted-audio');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: pictogramsQueryKey });
  });
});

describe('useCreatePhotoPictogram', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:planted-photo');
    URL.revokeObjectURL = vi.fn();
  });

  it('appends an optimistic row, uploads + inserts, and resolves with the real path', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, pictogramSeed());
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    let resolveUpload: (v: MockResult) => void = () => {
      throw new Error('resolver not assigned');
    };
    uploadMock.mockReturnValue(new Promise((r) => (resolveUpload = r)));
    insertMock.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useCreatePhotoPictogram(), {
      wrapper: makeSessionWrapper(qc),
    });

    const blob = new Blob(['jpeg'], { type: 'image/jpeg' });
    let created: { id: string; imagePath: string } | undefined;
    act(() => {
      void result.current
        .mutateAsync({ label: '  Cereal bowl  ', blob, extension: 'jpg' })
        .then((r) => (created = r));
    });

    // Optimistic window: the new tile renders from the local blob, trimmed label.
    await waitFor(() => {
      const list = qc.getQueryData<Pictogram[]>(pictogramsQueryKey);
      const optimistic = list?.find((p) => p.label === 'Cereal bowl');
      expect(optimistic).toMatchObject({ style: 'photo', imagePath: 'blob:planted-photo' });
    });

    resolveUpload({ error: null });
    await waitFor(() => expect(created).toBeDefined());

    // The resolved path is the real server path the refetch will serve.
    expect(created?.imagePath.endsWith(`/${created?.id ?? ''}.jpg`)).toBe(true);
    expect(insertMock).toHaveBeenCalledWith({
      id: created?.id,
      owner_id: expect.any(String) as unknown,
      label: 'Cereal bowl',
      style: 'photo',
      image_path: created?.imagePath,
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:planted-photo');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: pictogramsQueryKey });
  });

  it('removes the uploaded blob from storage when the row insert fails', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, pictogramSeed());
    uploadMock.mockResolvedValue({ error: null });
    insertMock.mockResolvedValue({ error: rlsError });
    removeMock.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useCreatePhotoPictogram(), {
      wrapper: makeSessionWrapper(qc),
    });

    act(() => {
      result.current.mutate({
        label: 'Cereal bowl',
        blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
        extension: 'jpg',
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const [uploadedPath] = uploadMock.mock.calls[0] as [string, Blob, unknown];
    expect(removeMock).toHaveBeenCalledWith([uploadedPath]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:planted-photo');
  });
});

describe('useReplacePictogramImage', () => {
  const photoSeed = (): Pictogram[] => [
    { id: 'ph1', label: 'Cereal', style: 'photo', imagePath: 'owner-uuid/ph1.jpg' },
    ...pictogramSeed(),
  ];

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:planted-replace');
    URL.revokeObjectURL = vi.fn();
  });

  it('optimistically swaps only photo-style rows to the local blob URL', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, photoSeed());
    uploadMock.mockReturnValue(new Promise(() => undefined)); // hold the optimistic window open

    const { result } = renderHook(() => useReplacePictogramImage(), {
      wrapper: makeSessionWrapper(qc),
    });

    act(() => {
      result.current.mutate({
        pictogramId: 'ph1',
        blob: new Blob(['jpeg']),
        extension: 'jpg',
        previousPath: 'owner-uuid/ph1.jpg',
      });
    });

    await waitFor(() => {
      const list = qc.getQueryData<Pictogram[]>(pictogramsQueryKey);
      const ph1 = list?.find((p) => p.id === 'ph1');
      expect(ph1?.style === 'photo' && ph1.imagePath).toBe('blob:planted-replace');
    });
    // Illustrated rows are guarded — an id mixup must not graft an imagePath
    // onto an illus pictogram.
    expect(qc.getQueryData<Pictogram[]>(pictogramsQueryKey)?.find((p) => p.id === 'p1')).toEqual(
      pictogramSeed()[0],
    );
  });

  it('uploads, updates the row, and removes the replaced image on success', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, photoSeed());
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    uploadMock.mockResolvedValue({ error: null });
    eqMock.mockResolvedValue({ error: null });
    removeMock.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useReplacePictogramImage(), {
      wrapper: makeSessionWrapper(qc),
    });

    act(() => {
      result.current.mutate({
        pictogramId: 'ph1',
        blob: new Blob(['jpeg']),
        extension: 'png',
        previousPath: 'owner-uuid/ph1.jpg',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [path] = uploadMock.mock.calls[0] as [string, Blob, unknown];
    expect(path).toMatch(/\/ph1\.png$/);
    expect(updateMock).toHaveBeenCalledWith({ image_path: path });
    expect(removeMock).toHaveBeenCalledWith(['owner-uuid/ph1.jpg']);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:planted-replace');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: pictogramsQueryKey });
  });

  it('restores the previous image path and revokes the planted blob on a permanent error', async () => {
    const qc = makeClient();
    qc.setQueryData(pictogramsQueryKey, photoSeed());
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    uploadMock.mockResolvedValue({ error: { statusCode: 403, message: 'not allowed' } });

    const { result } = renderHook(() => useReplacePictogramImage(), {
      wrapper: makeSessionWrapper(qc),
    });

    act(() => {
      result.current.mutate({
        pictogramId: 'ph1',
        blob: new Blob(['jpeg']),
        extension: 'jpg',
        previousPath: 'owner-uuid/ph1.jpg',
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<Pictogram[]>(pictogramsQueryKey)).toEqual(photoSeed());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:planted-replace');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: pictogramsQueryKey });
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
