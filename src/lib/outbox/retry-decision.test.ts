import { describe, expect, it } from 'vitest';

import { RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS } from './drain-state';
import { decideRetry, type DrainPass, MAX_STALLED_DRAINS } from './retry-decision';

const pass = (over: Partial<DrainPass> = {}): DrainPass => ({
  sawProgress: false,
  stoppedBy: undefined,
  fromTimer: false,
  online: true,
  pendingDrain: false,
  ...over,
});

const schedule = { retryDelayMs: 8_000, stalledDrains: 0 };

describe('decideRetry', () => {
  it('arms no timer and resets the backoff after a clean pass', () => {
    expect(decideRetry(pass(), schedule)).toEqual({
      retryInMs: undefined,
      retryDelayMs: RETRY_BASE_DELAY_MS,
      stalledDrains: 0,
    });
  });

  it('arms the current delay and doubles it after a transient failure', () => {
    expect(decideRetry(pass({ stoppedBy: 'transient' }), schedule)).toEqual({
      retryInMs: 8_000,
      retryDelayMs: 16_000,
      stalledDrains: 0,
    });
  });

  it('caps the doubled delay', () => {
    const decision = decideRetry(pass({ stoppedBy: 'transient' }), {
      ...schedule,
      retryDelayMs: 16_000,
    });
    expect(decision.retryInMs).toBe(16_000);
    expect(decision.retryDelayMs).toBe(RETRY_MAX_DELAY_MS);
  });

  // A queue that lands entries each pass is not the sustained-failure case
  // the doubling exists for (#391).
  it('restarts the backoff when the pass also made progress', () => {
    expect(decideRetry(pass({ stoppedBy: 'transient', sawProgress: true }), schedule)).toEqual({
      retryInMs: RETRY_BASE_DELAY_MS,
      retryDelayMs: RETRY_BASE_DELAY_MS * 2,
      stalledDrains: 0,
    });
  });

  // The same write re-landing every pass is not queue progress (#449).
  it('keeps walking the backoff up for an uncleared entry, progress or not', () => {
    const decision = decideRetry(pass({ stoppedBy: 'uncleared', sawProgress: true }), schedule);
    expect(decision.retryInMs).toBe(8_000);
    expect(decision.retryDelayMs).toBe(16_000);
  });

  it('arms no timer offline and keeps the delay for the online event', () => {
    expect(decideRetry(pass({ stoppedBy: 'transient', online: false }), schedule)).toEqual({
      retryInMs: undefined,
      retryDelayMs: 8_000,
      stalledDrains: 0,
    });
  });

  it('leaves the retry to the follow-up drain that is already queued', () => {
    const decision = decideRetry(pass({ stoppedBy: 'transient', pendingDrain: true }), schedule);
    expect(decision.retryInMs).toBeUndefined();
    expect(decision.retryDelayMs).toBe(8_000);
  });

  describe('stalled drains (#458)', () => {
    const stalled = pass({ stoppedBy: 'threw' });

    it('counts only timer wakes towards the give-up bound', () => {
      expect(decideRetry(stalled, schedule).stalledDrains).toBe(0);
      expect(decideRetry({ ...stalled, fromTimer: true }, schedule).stalledDrains).toBe(1);
    });

    it('stops arming the timer at the bound', () => {
      const atBound = { ...schedule, stalledDrains: MAX_STALLED_DRAINS - 1 };
      const decision = decideRetry({ ...stalled, fromTimer: true }, atBound);
      expect(decision.stalledDrains).toBe(MAX_STALLED_DRAINS);
      expect(decision.retryInMs).toBeUndefined();
    });

    it('resets the count when a pass makes progress or does not throw', () => {
      const walked = { ...schedule, stalledDrains: 3 };
      expect(decideRetry({ ...stalled, sawProgress: true }, walked).stalledDrains).toBe(0);
      expect(decideRetry(pass({ stoppedBy: 'uncleared' }), walked).stalledDrains).toBe(0);
      expect(decideRetry(pass({ stoppedBy: 'transient' }), walked).stalledDrains).toBe(0);
      expect(decideRetry(pass(), walked).stalledDrains).toBe(0);
    });
  });
});
