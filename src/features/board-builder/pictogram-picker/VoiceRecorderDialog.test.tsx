import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { TestSessionProvider } from '@/lib/auth/session.test-utils';
import type * as recordingModule from '@/lib/recording';
import type { Pictogram } from '@/types/domain';

interface MockError {
  code?: string;
  statusCode?: number;
  message: string;
}
interface MockResult {
  error: MockError | null;
}

// Boundary mock: the save/clear mutations run for real through the outbox
// (enqueueAndDrain → handlers → uploadBlob/removeFromBucket → supabase).
const uploadMock = vi.fn<(path: string, blob: Blob, opts: unknown) => Promise<MockResult>>();
const removeMock = vi.fn<(paths: string[]) => Promise<MockResult>>();
const storageBucketsUsed: string[] = [];
const eqMock = vi.fn<(col: string, val: string) => Promise<MockResult>>();
const updateMock = vi.fn((patch: Record<string, unknown>) => ({
  eq: (col: string, val: string) => {
    updatePatches.push(patch);
    return eqMock(col, val);
  },
}));
const updatePatches: Record<string, unknown>[] = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ update: updateMock }),
    storage: {
      from: (bucket: string) => {
        storageBucketsUsed.push(bucket);
        return { upload: uploadMock, remove: removeMock };
      },
    },
  },
}));

// Playback needs a real <audio> pipeline; the module is a 14-line signed-URL +
// Audio wrapper. The dialog's contract is "call it, surface its failure".
vi.mock('@/lib/audio', () => ({
  playPictogramAudio: vi.fn(),
}));

// startRecording/isRecordingSupported have their own behavioral tests against
// a fake MediaRecorder (recording.test.ts); here they're the seam that lets
// the test steer permission-denied vs. captured-blob outcomes.
vi.mock('@/lib/recording', async (importOriginal) => {
  const actual = await importOriginal<typeof recordingModule>();
  return {
    ...actual,
    isRecordingSupported: vi.fn(() => true),
    startRecording: vi.fn(),
  };
});

const { playPictogramAudio } = await import('@/lib/audio');
const { isRecordingSupported, startRecording } = await import('@/lib/recording');
const { VoiceRecorderDialog } = await import('./VoiceRecorderDialog');

const playMock = vi.mocked(playPictogramAudio);
const supportedMock = vi.mocked(isRecordingSupported);
const startMock = vi.mocked(startRecording);

const pictoWithoutAudio: Pictogram = {
  id: 'p1',
  label: 'Brush teeth',
  style: 'illus',
  glyph: 'tooth',
  tint: 'oklch(88% 0.06 90)',
};

const pictoWithAudio: Pictogram = { ...pictoWithoutAudio, audioPath: 'owner-uuid/p1.m4a' };

interface FakeRecording {
  stop: Mock<() => Promise<Blob>>;
  cancel: Mock<() => void>;
}

const fakeRecording = (blob = new Blob(['voice'], { type: 'audio/webm' })): FakeRecording => ({
  stop: vi.fn(() => Promise.resolve(blob)),
  cancel: vi.fn(),
});

const renderDialog = (picto: Pictogram): ReturnType<typeof render> => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <TestSessionProvider>
        <VoiceRecorderDialog picto={picto} onClose={vi.fn()} />
      </TestSessionProvider>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  uploadMock.mockReset().mockResolvedValue({ error: null });
  removeMock.mockReset().mockResolvedValue({ error: null });
  eqMock.mockReset().mockResolvedValue({ error: null });
  updateMock.mockClear();
  updatePatches.length = 0;
  storageBucketsUsed.length = 0;
  playMock.mockReset().mockResolvedValue(undefined);
  supportedMock.mockReset().mockReturnValue(true);
  startMock.mockReset();
});

describe('VoiceRecorderDialog', () => {
  it('explains and disables recording in a browser without capture support', () => {
    supportedMock.mockReturnValue(false);
    renderDialog(pictoWithoutAudio);

    expect(screen.getByText(/can.t record audio/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /record/i })).toBeDisabled();
  });

  it('surfaces a microphone-permission denial and lets the user retry', async () => {
    const user = userEvent.setup();
    startMock.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    renderDialog(pictoWithoutAudio);

    await user.click(screen.getByRole('button', { name: /record/i }));

    expect(
      await screen.findByText('Microphone unavailable. Grant permission and retry.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /record/i })).toBeEnabled();
  });

  it('records, uploads to the audio bucket, and points the row at the new path', async () => {
    const user = userEvent.setup();
    startMock.mockResolvedValue(fakeRecording());
    renderDialog(pictoWithoutAudio);

    await user.click(screen.getByRole('button', { name: /record/i }));
    expect(await screen.findByText('Recording…')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /stop/i }));

    await waitFor(() => {
      expect(uploadMock).toHaveBeenCalledTimes(1);
    });
    const [path, blob] = uploadMock.mock.calls[0] as [string, Blob, unknown];
    expect(path).toMatch(/\/p1\.webm$/);
    expect(blob.type).toBe('audio/webm');
    expect(storageBucketsUsed).toContain('pictogram-audio');
    await waitFor(() => {
      expect(updatePatches).toContainEqual({ audio_path: path });
    });
    expect(eqMock).toHaveBeenCalledWith('id', 'p1');
    // No previous recording → nothing to clean up.
    expect(removeMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/failed|could not/i)).not.toBeInTheDocument();
    // hasAudio is prop-driven (the parent re-renders with the fresh picto);
    // within this dialog instance the idle button returns as plain "Record".
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Record' })).toBeEnabled();
    });
  });

  it('removes the old recording from storage when re-recording changes the extension', async () => {
    const user = userEvent.setup();
    startMock.mockResolvedValue(fakeRecording(new Blob(['voice'], { type: 'audio/webm' })));
    renderDialog(pictoWithAudio);

    await user.click(screen.getByRole('button', { name: /re-record/i }));
    await user.click(await screen.findByRole('button', { name: /stop/i }));

    await waitFor(() => {
      expect(removeMock).toHaveBeenCalledWith(['owner-uuid/p1.m4a']);
    });
  });

  it('reports an upload failure and does not touch the pictogram row', async () => {
    const user = userEvent.setup();
    startMock.mockResolvedValue(fakeRecording());
    // 4xx storage error → the outbox classifies it permanent → mutateAsync rejects.
    uploadMock.mockResolvedValue({ error: { statusCode: 403, message: 'not allowed' } });
    renderDialog(pictoWithoutAudio);

    await user.click(screen.getByRole('button', { name: /record/i }));
    await user.click(await screen.findByRole('button', { name: /stop/i }));

    expect(
      await screen.findByText('Upload failed. Check your connection and try again.'),
    ).toBeInTheDocument();
    expect(updateMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /record/i })).toBeEnabled();
  });

  it('deletes the recording from storage and clears the row path', async () => {
    const user = userEvent.setup();
    renderDialog(pictoWithAudio);

    await user.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => {
      expect(removeMock).toHaveBeenCalledWith(['owner-uuid/p1.m4a']);
    });
    await waitFor(() => {
      expect(updatePatches).toContainEqual({ audio_path: null });
    });
    expect(screen.queryByText(/could not/i)).not.toBeInTheDocument();
  });

  it('reports a failed delete', async () => {
    const user = userEvent.setup();
    eqMock.mockResolvedValue({ error: { code: '42501', message: 'row-level-security' } });
    renderDialog(pictoWithAudio);

    await user.click(screen.getByRole('button', { name: /delete/i }));

    expect(await screen.findByText('Could not remove recording.')).toBeInTheDocument();
  });

  it('plays the saved recording and reports playback failure', async () => {
    const user = userEvent.setup();
    playMock.mockRejectedValueOnce(new Error('no audio output'));
    renderDialog(pictoWithAudio);

    await user.click(screen.getByRole('button', { name: /play/i }));
    expect(await screen.findByText('Could not play recording.')).toBeInTheDocument();

    playMock.mockResolvedValueOnce(undefined);
    await user.click(screen.getByRole('button', { name: /play/i }));
    await waitFor(() => {
      expect(playMock).toHaveBeenCalledTimes(2);
    });
    expect(playMock).toHaveBeenCalledWith('owner-uuid/p1.m4a');
    expect(screen.queryByText('Could not play recording.')).not.toBeInTheDocument();
  });

  it('releases the microphone if the dialog unmounts mid-recording', async () => {
    const user = userEvent.setup();
    const rec = fakeRecording();
    startMock.mockResolvedValue(rec);
    const { unmount } = renderDialog(pictoWithoutAudio);

    await user.click(screen.getByRole('button', { name: /record/i }));
    await screen.findByText('Recording…');
    unmount();

    expect(rec.cancel).toHaveBeenCalled();
  });
});
