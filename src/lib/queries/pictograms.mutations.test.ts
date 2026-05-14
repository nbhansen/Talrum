import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Pictogram } from '@/types/domain';

import { __test_revokePictogramBlobs } from './pictograms.mutations';
import { pictogramsQueryKey } from './pictograms.read';

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
