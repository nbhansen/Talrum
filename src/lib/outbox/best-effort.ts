import { captureException } from '@/lib/platform/telemetry';

/**
 * Run IDB bookkeeping that must not decide a write's outcome (#446): a device
 * that cannot write IndexedDB must keep making online writes. Takes a thunk so
 * a synchronous throw cannot bypass the catch. Reports whether the work ran.
 */
export const bestEffort = async (op: string, work: () => Promise<void>): Promise<boolean> => {
  try {
    await work();
    return true;
  } catch (err) {
    captureException(err, { level: 'warning', tags: { component: 'outbox', op } });
    return false;
  }
};
