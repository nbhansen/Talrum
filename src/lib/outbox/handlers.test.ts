import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ClearPictogramAudioEntry,
  CreatePhotoPictogramEntry,
  DeleteKidEntry,
  DeletePictogramEntry,
  RenameKidEntry,
  RenamePictogramEntry,
  ReplacePictogramImageEntry,
  SetPictogramAudioEntry,
  UpdateBoardEntry,
} from './types';

interface MockPostgrestError {
  code: string;
  message: string;
  details: string;
  hint: string;
}

const eqMock = vi.fn<(c: string, v: string) => Promise<{ error: MockPostgrestError | null }>>();
type UpdateSelectResult = Promise<{
  data: { updated_at: string }[] | null;
  error: MockPostgrestError | null;
}>;
const guardSelectMock = vi.fn<(cols: string) => UpdateSelectResult>();
const unguardedSelectMock = vi.fn<(cols: string) => UpdateSelectResult>();
const matchMock = vi.fn((_filter: Record<string, string>) => ({ select: guardSelectMock }));
// `.eq()` serves two chain shapes: pictogram/kid handlers await it as the
// terminal, the unguarded boards path chains `.select('updated_at')` off it.
// Mirrors supabase-js, where the filter builder is a thenable with `.select`.
const updateMock = vi.fn(() => ({
  eq: (c: string, v: string) => Object.assign(eqMock(c, v), { select: unguardedSelectMock }),
  match: matchMock,
}));
const upsertMock =
  vi.fn<(row: unknown, opts?: unknown) => Promise<{ error: MockPostgrestError | null }>>();
const inMock = vi.fn<
  (
    c: string,
    vs: readonly string[],
  ) => Promise<{
    data: { id: string; step_ids: string[] }[] | null;
    error: MockPostgrestError | null;
  }>
>();
const selectMock = vi.fn((_cols: string) => ({ in: inMock }));
const deleteEqMock =
  vi.fn<(c: string, v: string) => Promise<{ error: MockPostgrestError | null }>>();
const deleteMock = vi.fn(() => ({ eq: deleteEqMock }));
const fromMock = vi.fn((_table: string) => ({
  update: updateMock,
  upsert: upsertMock,
  select: selectMock,
  delete: deleteMock,
}));

const uploadMock =
  vi.fn<(path: string, blob: Blob, opts?: unknown) => Promise<{ error: Error | null }>>();
const removeMock = vi.fn<(paths: string[]) => Promise<{ error: Error | null }>>();
const createSignedUrlMock = vi.fn();
const storageFromMock = vi.fn((_bucket: string) => ({
  upload: uploadMock,
  remove: removeMock,
  createSignedUrl: createSignedUrlMock,
}));

const rpcMock =
  vi.fn<
    (fn: string, args: Record<string, unknown>) => Promise<{ error: MockPostgrestError | null }>
  >();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => fromMock(table),
    rpc: (fn: string, args: Record<string, unknown>) => rpcMock(fn, args),
    storage: { from: (bucket: string) => storageFromMock(bucket) },
  },
}));

const captureExceptionMock = vi.fn();
vi.mock('@/lib/telemetry', () => ({
  captureException: (err: unknown, ctx?: unknown) => captureExceptionMock(err, ctx),
}));

const { BOARD_CONFLICT_MESSAGE, HANDLER_TIMEOUT_MS, runHandler, UnretryableOutboxError } =
  await import('./handlers');
const { __resetBoardClockForTests } = await import('./board-clock');

const baseProps = {
  id: '01HZZA',
  enqueuedAt: 0,
  attemptCount: 0,
  status: 'pending' as const,
};

beforeEach(() => {
  eqMock.mockReset();
  guardSelectMock.mockReset();
  unguardedSelectMock.mockReset();
  matchMock.mockClear();
  updateMock.mockClear();
  upsertMock.mockReset();
  inMock.mockReset();
  selectMock.mockClear();
  deleteEqMock.mockReset();
  deleteMock.mockClear();
  uploadMock.mockReset();
  removeMock.mockReset();
  captureExceptionMock.mockReset();
  fromMock.mockClear();
  storageFromMock.mockClear();
  // Defaults: every supabase call succeeds.
  eqMock.mockResolvedValue({ error: null });
  unguardedSelectMock.mockResolvedValue({
    data: [{ updated_at: '2026-06-11T09:00:00.000001+00:00' }],
    error: null,
  });
  upsertMock.mockResolvedValue({ error: null });
  inMock.mockResolvedValue({ data: [], error: null });
  deleteEqMock.mockResolvedValue({ error: null });
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ error: null });
  uploadMock.mockResolvedValue({ error: null });
  removeMock.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runHandler · updateBoard', () => {
  it('passes the patch through and resolves on success', async () => {
    const entry: UpdateBoardEntry = {
      ...baseProps,
      kind: 'updateBoard',
      boardId: 'b-1',
      patch: { name: 'Sunrise' },
    };
    await runHandler(entry);
    expect(updateMock).toHaveBeenCalledWith({ name: 'Sunrise' });
    expect(eqMock).toHaveBeenCalledWith('id', 'b-1');
  });

  it('wraps coded DB errors in UnretryableOutboxError', async () => {
    unguardedSelectMock.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied', details: '', hint: '' },
    });
    const entry: UpdateBoardEntry = {
      ...baseProps,
      kind: 'updateBoard',
      boardId: 'b-1',
      patch: { name: 'X' },
    };
    // The instanceof check is what the drain branches on; the message is
    // user-visible via `lastError`, including extraction from a plain
    // (non-Error) PostgREST object. Pin both.
    await expect(runHandler(entry)).rejects.toBeInstanceOf(UnretryableOutboxError);
    await expect(runHandler(entry)).rejects.toMatchObject({
      message: 'db 42501: permission denied',
    });
  });
});

describe('runHandler · updateBoard conflict guard (#281)', () => {
  const T0 = '2026-06-11T10:00:00.000001+00:00';
  const T1 = '2026-06-11T10:00:01.000001+00:00';
  const T2 = '2026-06-11T10:00:02.000001+00:00';

  const guarded = (expectedUpdatedAt: string, boardId = 'b-1'): UpdateBoardEntry => ({
    ...baseProps,
    kind: 'updateBoard',
    boardId,
    patch: { step_ids: ['s-1'] },
    expectedUpdatedAt,
  });

  beforeEach(() => {
    __resetBoardClockForTests();
  });

  it('updates conditionally on the baseline and resolves when a row matches', async () => {
    guardSelectMock.mockResolvedValue({ data: [{ updated_at: T1 }], error: null });
    await runHandler(guarded(T0));
    expect(updateMock).toHaveBeenCalledWith({ step_ids: ['s-1'] });
    expect(matchMock).toHaveBeenCalledWith({ id: 'b-1', updated_at: T0 });
    expect(eqMock).not.toHaveBeenCalled();
  });

  it('rejects with the conflict kind when zero rows match the baseline', async () => {
    guardSelectMock.mockResolvedValue({ data: [], error: null });
    await expect(runHandler(guarded(T0))).rejects.toMatchObject({
      name: 'UnretryableOutboxError',
      failureKind: 'conflict',
      message: BOARD_CONFLICT_MESSAGE,
    });
  });

  it('keeps the unguarded path for entries without a baseline', async () => {
    eqMock.mockResolvedValue({ error: null });
    const entry: UpdateBoardEntry = {
      ...baseProps,
      kind: 'updateBoard',
      boardId: 'b-1',
      patch: { name: 'X' },
    };
    await runHandler(entry);
    expect(eqMock).toHaveBeenCalledWith('id', 'b-1');
    expect(matchMock).not.toHaveBeenCalled();
  });

  it('replaces a stale baseline with the updated_at its own prior write produced', async () => {
    // Two entries enqueued against the same snapshot (offline chain): the
    // first replay bumps the server clock, so the second must guard against
    // the produced T1, not its own stale T0 — guarding with T0 would
    // conflict against ourselves.
    guardSelectMock
      .mockResolvedValueOnce({ data: [{ updated_at: T1 }], error: null })
      .mockResolvedValueOnce({ data: [{ updated_at: T2 }], error: null });
    await runHandler(guarded(T0));
    await runHandler(guarded(T0));
    expect(matchMock).toHaveBeenNthCalledWith(2, { id: 'b-1', updated_at: T1 });
  });

  it('prefers a newer entry baseline over an older produced timestamp', async () => {
    // A refetch can hand a later edit a baseline newer than anything this
    // device produced; the device clock must not drag the guard backwards.
    guardSelectMock
      .mockResolvedValueOnce({ data: [{ updated_at: T1 }], error: null })
      .mockResolvedValueOnce({ data: [{ updated_at: T2 }], error: null });
    await runHandler(guarded(T0));
    await runHandler(guarded(T2));
    expect(matchMock).toHaveBeenNthCalledWith(2, { id: 'b-1', updated_at: T2 });
  });

  it('feeds the board clock from unguarded successes too', async () => {
    // An unguarded replay (pre-#281 entry, or a conflict retry with the
    // guard stripped) bumps the server clock like any other write. A queued
    // guarded entry for the same board must not self-conflict against it.
    unguardedSelectMock.mockResolvedValue({ data: [{ updated_at: T1 }], error: null });
    await runHandler({ ...baseProps, kind: 'updateBoard', boardId: 'b-1', patch: { name: 'X' } });
    guardSelectMock.mockResolvedValue({ data: [{ updated_at: T2 }], error: null });
    await runHandler(guarded(T0));
    expect(matchMock).toHaveBeenCalledWith({ id: 'b-1', updated_at: T1 });
  });

  it('keeps zero rows on the unguarded path a silent success (board already gone)', async () => {
    unguardedSelectMock.mockResolvedValue({ data: [], error: null });
    await expect(
      runHandler({ ...baseProps, kind: 'updateBoard', boardId: 'b-1', patch: { name: 'X' } }),
    ).resolves.toBeUndefined();
  });

  it('scopes produced timestamps per board', async () => {
    guardSelectMock
      .mockResolvedValueOnce({ data: [{ updated_at: T1 }], error: null })
      .mockResolvedValueOnce({ data: [{ updated_at: T2 }], error: null });
    await runHandler(guarded(T0, 'b-1'));
    await runHandler(guarded(T0, 'b-2'));
    expect(matchMock).toHaveBeenNthCalledWith(2, { id: 'b-2', updated_at: T0 });
  });

  it('wraps coded DB errors from the guarded path in UnretryableOutboxError', async () => {
    guardSelectMock.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied', details: '', hint: '' },
    });
    await expect(runHandler(guarded(T0))).rejects.toBeInstanceOf(UnretryableOutboxError);
  });
});

describe('runHandler · retryable Postgres codes stay transient (#394)', () => {
  const entry: RenamePictogramEntry = {
    ...baseProps,
    kind: 'renamePicto',
    pictogramId: 'p-1',
    label: 'Apple',
  };

  it.each(['40001', '40P01', '08000', '08006', '53300', '57P03', '57014'])(
    'throws %s as a plain Error so the drain keeps the entry pending',
    async (code) => {
      // A plain object, not an Error instance — the shape supabase-js can
      // hand back. The drain persists `err.message` as `lastError`, so the
      // wrapper must be a real Error and must carry the SQLSTATE.
      const dbError = { code, message: 'try again', details: '', hint: '' };
      eqMock.mockResolvedValue({ error: dbError });
      let caught: unknown;
      try {
        await runHandler(entry);
      } catch (err) {
        caught = err;
      }
      expect(caught).not.toBeInstanceOf(UnretryableOutboxError);
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe(`db ${code}: try again`);
      expect((caught as Error).cause).toBe(dbError);
    },
  );

  it.each(['23514', '08P01'])('keeps the blanket permanent rule for %s', async (code) => {
    // 08P01 (protocol_violation) shares the 08 class prefix but is a
    // malformed request — retrying it cannot succeed.
    eqMock.mockResolvedValue({
      error: { code, message: 'nope', details: '', hint: '' },
    });
    await expect(runHandler(entry)).rejects.toBeInstanceOf(UnretryableOutboxError);
  });
});

describe('runHandler · createPhotoPicto', () => {
  it('uploads then inserts the row, ignoring a duplicate (#393)', async () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    const entry: CreatePhotoPictogramEntry = {
      ...baseProps,
      kind: 'createPhotoPicto',
      pictogramId: 'p-1',
      ownerId: 'o-1',
      label: 'Park',
      blob,
      extension: 'jpg',
    };
    await runHandler(entry);
    expect(uploadMock).toHaveBeenCalledWith(
      'o-1/p-1.jpg',
      blob,
      expect.objectContaining({ upsert: true }),
    );
    // `ignoreDuplicates: true` is the idempotency contract: a replay of a
    // landed create hits ON CONFLICT DO NOTHING instead of a 23505, which
    // classifyAndThrow would mark permanent and flip the entry to failed.
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'p-1',
        owner_id: 'o-1',
        style: 'photo',
        image_path: 'o-1/p-1.jpg',
      }),
      { ignoreDuplicates: true },
    );
  });

  it('converges when the same entry replays after the create landed (#393)', async () => {
    // Stateful mock with real duplicate-key semantics: a second write of the
    // same id raises 23505 unless `ignoreDuplicates` is passed (ON CONFLICT
    // DO NOTHING). A revert to a plain `.insert` — or dropping the option —
    // fails this test the way it would fail against Postgres.
    const inserted = new Set<string>();
    upsertMock.mockImplementation((row, opts) => {
      const { id } = row as { id: string };
      if (inserted.has(id) && !(opts as { ignoreDuplicates?: boolean })?.ignoreDuplicates) {
        return Promise.resolve({
          error: { code: '23505', message: 'duplicate key', details: '', hint: '' },
        });
      }
      inserted.add(id);
      return Promise.resolve({ error: null });
    });
    const entry: CreatePhotoPictogramEntry = {
      ...baseProps,
      kind: 'createPhotoPicto',
      pictogramId: 'p-1',
      ownerId: 'o-1',
      label: 'Park',
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      extension: 'jpg',
    };
    // First attempt lands the row; the tab crashes before the entry is
    // marked done. The replay re-uploads (storage upsert) and the row
    // upsert resolves without error under ON CONFLICT DO NOTHING.
    await runHandler(entry);
    await expect(runHandler(entry)).resolves.toBeUndefined();
    expect(upsertMock).toHaveBeenCalledTimes(2);
    // No cleanup: the blob belongs to the row that already exists.
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('treats a 5xx storage error as transient — not Unretryable (#32)', async () => {
    const uploadErr = Object.assign(new Error('boom'), { statusCode: 500 });
    uploadMock.mockResolvedValue({ error: uploadErr });
    const entry: CreatePhotoPictogramEntry = {
      ...baseProps,
      kind: 'createPhotoPicto',
      pictogramId: 'p-1',
      ownerId: 'o-1',
      label: 'Park',
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      extension: 'jpg',
    };
    let caught: unknown;
    try {
      await runHandler(entry);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught).not.toBeInstanceOf(UnretryableOutboxError);
    // Lock in that the original storage error reaches the drain layer with
    // its statusCode intact — drain.ts uses this to bump attemptCount and
    // schedule a retry. A regression that re-wrapped 5xx in some other
    // custom subclass would trip this.
    expect(caught).toBe(uploadErr);
    expect((caught as { statusCode?: number }).statusCode).toBe(500);
    // Insert never ran because upload threw first; the bucket cleanup path
    // only fires when insert fails after a successful upload.
    expect(upsertMock).not.toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('cleans up the uploaded blob if insert fails', async () => {
    upsertMock.mockResolvedValue({
      error: { code: '42501', message: 'permission denied', details: '', hint: '' },
    });
    const entry: CreatePhotoPictogramEntry = {
      ...baseProps,
      kind: 'createPhotoPicto',
      pictogramId: 'p-1',
      ownerId: 'o-1',
      label: 'Park',
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      extension: 'jpg',
    };
    await expect(runHandler(entry)).rejects.toBeInstanceOf(UnretryableOutboxError);
    expect(removeMock).toHaveBeenCalledWith(['o-1/p-1.jpg']);
  });
});

describe('runHandler · setPictoAudio', () => {
  it('uploads, updates the row, and removes the previous recording', async () => {
    const blob = new Blob(['x'], { type: 'audio/webm' });
    const entry: SetPictogramAudioEntry = {
      ...baseProps,
      kind: 'setPictoAudio',
      pictogramId: 'p-1',
      ownerId: 'o-1',
      blob,
      extension: 'webm',
      previousPath: 'o-1/p-1.m4a',
    };
    await runHandler(entry);
    expect(uploadMock).toHaveBeenCalledWith(
      'o-1/p-1.webm',
      blob,
      expect.objectContaining({ upsert: true }),
    );
    expect(updateMock).toHaveBeenCalledWith({ audio_path: 'o-1/p-1.webm' });
    expect(removeMock).toHaveBeenCalledWith(['o-1/p-1.m4a']);
  });
});

describe('runHandler · clearPictoAudio', () => {
  it('removes the file and nulls audio_path', async () => {
    const entry: ClearPictogramAudioEntry = {
      ...baseProps,
      kind: 'clearPictoAudio',
      pictogramId: 'p-1',
      path: 'o-1/p-1.webm',
    };
    await runHandler(entry);
    expect(removeMock).toHaveBeenCalledWith(['o-1/p-1.webm']);
    expect(updateMock).toHaveBeenCalledWith({ audio_path: null });
  });

  it('reports a failed file removal to telemetry but still nulls audio_path', async () => {
    removeMock.mockResolvedValue({ error: new Error('storage offline') });
    const entry: ClearPictogramAudioEntry = {
      ...baseProps,
      kind: 'clearPictoAudio',
      pictogramId: 'p-1',
      path: 'o-1/p-1.webm',
    };
    await runHandler(entry);
    // Cleanup failure is swallowed — the row is still updated.
    expect(updateMock).toHaveBeenCalledWith({ audio_path: null });
    // ...but the leak is reported, not silent (#255).
    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { component: 'outbox', op: 'storage-cleanup' } }),
    );
  });
});

describe('runHandler · renamePicto', () => {
  it('updates the label column scoped to the pictogram id', async () => {
    const entry: RenamePictogramEntry = {
      ...baseProps,
      kind: 'renamePicto',
      pictogramId: 'p-1',
      label: 'Local park',
    };
    await runHandler(entry);
    expect(fromMock).toHaveBeenCalledWith('pictograms');
    expect(updateMock).toHaveBeenCalledWith({ label: 'Local park' });
    expect(eqMock).toHaveBeenCalledWith('id', 'p-1');
  });
});

describe('runHandler · replacePictoImage', () => {
  it('uploads the new blob, points the row at it, and removes the prior upload', async () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    const entry: ReplacePictogramImageEntry = {
      ...baseProps,
      kind: 'replacePictoImage',
      pictogramId: 'p-1',
      ownerId: 'o-1',
      blob,
      extension: 'jpg',
      previousPath: 'o-1/p-1.webp',
    };
    await runHandler(entry);
    expect(uploadMock).toHaveBeenCalledWith(
      'o-1/p-1.jpg',
      blob,
      expect.objectContaining({ upsert: true }),
    );
    expect(updateMock).toHaveBeenCalledWith({ image_path: 'o-1/p-1.jpg' });
    expect(removeMock).toHaveBeenCalledWith(['o-1/p-1.webp']);
  });

  it('skips removeFromBucket when the previous path is a stock sentinel', async () => {
    const entry: ReplacePictogramImageEntry = {
      ...baseProps,
      kind: 'replacePictoImage',
      pictogramId: 'p-1',
      ownerId: 'o-1',
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      extension: 'jpg',
      previousPath: 'stock:park',
    };
    await runHandler(entry);
    expect(uploadMock).toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('skips removeFromBucket when the new path matches the previous path', async () => {
    const entry: ReplacePictogramImageEntry = {
      ...baseProps,
      kind: 'replacePictoImage',
      pictogramId: 'p-1',
      ownerId: 'o-1',
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      extension: 'jpg',
      previousPath: 'o-1/p-1.jpg',
    };
    await runHandler(entry);
    // Same key — upsert overwrote the bytes; deleting it would lose the new image.
    expect(removeMock).not.toHaveBeenCalled();
  });
});

describe('runHandler · deletePicto', () => {
  it('cleans up uploads then deletes via the delete_pictogram RPC', async () => {
    const entry: DeletePictogramEntry = {
      ...baseProps,
      kind: 'deletePicto',
      pictogramId: 'p-1',
      previousImagePath: 'o-1/p-1.jpg',
      previousAudioPath: 'o-1/p-1.webm',
    };
    await runHandler(entry);
    expect(removeMock).toHaveBeenCalledWith(['o-1/p-1.jpg']);
    expect(removeMock).toHaveBeenCalledWith(['o-1/p-1.webm']);
    expect(rpcMock).toHaveBeenCalledWith('delete_pictogram', { p_pictogram_id: 'p-1' });
    // The boards scrub + row delete happen inside the RPC — no table traffic.
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('skips storage cleanup for stock-prefixed previous paths', async () => {
    const entry: DeletePictogramEntry = {
      ...baseProps,
      kind: 'deletePicto',
      pictogramId: 'p-1',
      previousImagePath: 'stock:park',
    };
    await runHandler(entry);
    expect(rpcMock).toHaveBeenCalledWith('delete_pictogram', { p_pictogram_id: 'p-1' });
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('classifies a coded RPC error as unretryable', async () => {
    rpcMock.mockResolvedValue({
      error: { code: '42501', message: 'denied', details: '', hint: '' },
    });
    const entry: DeletePictogramEntry = {
      ...baseProps,
      kind: 'deletePicto',
      pictogramId: 'p-1',
    };
    await expect(runHandler(entry)).rejects.toBeInstanceOf(UnretryableOutboxError);
  });
});

describe('runHandler · renameKid', () => {
  it('updates the name column scoped to the kid id', async () => {
    const entry: RenameKidEntry = {
      ...baseProps,
      kind: 'renameKid',
      kidId: 'k-1',
      name: 'Mia',
    };
    await runHandler(entry);
    expect(fromMock).toHaveBeenCalledWith('kids');
    expect(updateMock).toHaveBeenCalledWith({ name: 'Mia' });
    expect(eqMock).toHaveBeenCalledWith('id', 'k-1');
  });

  it('wraps coded DB errors in UnretryableOutboxError', async () => {
    eqMock.mockResolvedValue({
      error: { code: '42501', message: 'permission denied', details: '', hint: '' },
    });
    const entry: RenameKidEntry = {
      ...baseProps,
      kind: 'renameKid',
      kidId: 'k-1',
      name: 'Mia',
    };
    await expect(runHandler(entry)).rejects.toBeInstanceOf(UnretryableOutboxError);
  });
});

describe('runHandler · deleteKid', () => {
  it('deletes the kid row by id', async () => {
    const entry: DeleteKidEntry = {
      ...baseProps,
      kind: 'deleteKid',
      kidId: 'k-1',
    };
    await runHandler(entry);
    expect(fromMock).toHaveBeenCalledWith('kids');
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteEqMock).toHaveBeenCalledWith('id', 'k-1');
  });

  it('does not touch boards or storage — server-side cascade handles them', async () => {
    const entry: DeleteKidEntry = {
      ...baseProps,
      kind: 'deleteKid',
      kidId: 'k-1',
    };
    await runHandler(entry);
    // No boards SELECT/UPDATE — the FK cascade strips boards on the server.
    expect(selectMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
  });
});

describe('runHandler · handler IO timeout (#413)', () => {
  beforeEach(() => {
    // Only the timer pair the timeout uses; Date and microtasks stay real.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const photoEntry = (): CreatePhotoPictogramEntry => ({
    ...baseProps,
    kind: 'createPhotoPicto',
    pictogramId: 'p-1',
    ownerId: 'o-1',
    label: 'Park',
    blob: new Blob(['x'], { type: 'image/jpeg' }),
    extension: 'jpg',
  });

  it('a hung upload rejects after HANDLER_TIMEOUT_MS with a transient error', async () => {
    // The upload is the IO an abort-based bound could not cover: storage-js
    // upload() takes no AbortSignal. A socket stuck open pends forever.
    uploadMock.mockReturnValue(new Promise<{ error: Error | null }>(() => undefined));
    const outcome = runHandler(photoEntry()).then(
      () => 'resolved',
      (err: unknown) => err,
    );
    await vi.advanceTimersByTimeAsync(HANDLER_TIMEOUT_MS);
    const err = await outcome;
    expect(err).toBeInstanceOf(Error);
    // Transient, not Unretryable: the entry must stay pending and retry.
    expect(err).not.toBeInstanceOf(UnretryableOutboxError);
    expect((err as Error).message).toMatch(/timed out after 30s/);
  });

  it('swallows the losing run’s late rejection after a timeout', async () => {
    let rejectLate: (err: Error) => void = () => undefined;
    uploadMock.mockReturnValue(
      new Promise<{ error: Error | null }>((_, reject) => {
        rejectLate = reject;
      }),
    );
    const outcome = runHandler(photoEntry()).then(
      () => 'resolved',
      (err: unknown) => (err as Error).message,
    );
    await vi.advanceTimersByTimeAsync(HANDLER_TIMEOUT_MS);
    expect(await outcome).toMatch(/timed out/);
    // The zombie request fails long after the entry was re-queued. Vitest
    // fails the run on unhandled rejections, so this test passing clean is
    // the assertion.
    rejectLate(new TypeError('Failed to fetch'));
    await vi.advanceTimersByTimeAsync(0);
  });

  it('a handler that settles in time clears its timeout timer', async () => {
    const entry: RenameKidEntry = {
      ...baseProps,
      kind: 'renameKid',
      kidId: 'k-1',
      name: 'Mia',
    };
    await runHandler(entry);
    // A leaked timer would fire a stray rejection 30 s into some later
    // handler run (and shows up here as a pending fake timer).
    expect(vi.getTimerCount()).toBe(0);
  });
});
