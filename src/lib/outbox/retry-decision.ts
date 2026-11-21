import { RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS } from './drain-state';

/** Drains in a row that achieved nothing before the retry timer stops (#458). */
export const MAX_STALLED_DRAINS = 6;

export interface DrainPass {
  sawProgress: boolean;
  /** What ended the pass early. Undefined for a pass that ran the queue dry. */
  stoppedBy: 'transient' | 'uncleared' | 'threw' | undefined;
  fromTimer: boolean;
  online: boolean;
  pendingDrain: boolean;
}

export interface RetrySchedule {
  /** Doubles per transient pass, up to RETRY_MAX_DELAY_MS. */
  retryDelayMs: number;
  stalledDrains: number;
}

export interface RetryDecision extends RetrySchedule {
  /** Delay for the timer to arm, or undefined for no timer. */
  retryInMs: number | undefined;
}

/**
 * What a finished drain pass does to the retry schedule. Pure so the ordering
 * constraints are tested here instead of end-to-end through IDB (#559).
 */
export const decideRetry = (pass: DrainPass, schedule: RetrySchedule): RetryDecision => {
  // Progress resets the backoff: a queue that lands entries each pass is not
  // the sustained-failure case the doubling exists for (#391). An uncleared
  // entry re-lands every pass, so it cannot pass for progress (#449).
  const resetBackoff =
    pass.stoppedBy !== 'uncleared' && (pass.sawProgress || pass.stoppedBy === undefined);
  const delay = resetBackoff ? RETRY_BASE_DELAY_MS : schedule.retryDelayMs;

  // A drain that IndexedDB stopped from running the queue may never heal, so
  // the timer would wake for the rest of an idle session. Only a timer wake
  // spends the budget: a burst of writes drains once each and would empty it
  // in a second. `online` stays a trigger; Retry does not (no `failed` entry).
  const stalled = pass.stoppedBy === 'threw' && !pass.sawProgress;
  const stalledDrains = !stalled
    ? 0
    : pass.fromTimer
      ? schedule.stalledDrains + 1
      : schedule.stalledDrains;
  const giveUp = stalledDrains >= MAX_STALLED_DRAINS;

  // An uncleared entry needs the timer too: nothing else clears a landed write
  // the delete left `pending` (#449). A timer set after the device dropped
  // would wake once, hit the offline branch, and cancel itself; the `online`
  // event is the next trigger. A queued follow-up drain owns the decision.
  const retry = pass.stoppedBy !== undefined && !pass.pendingDrain && pass.online && !giveUp;
  return {
    retryInMs: retry ? delay : undefined,
    retryDelayMs: retry ? Math.min(delay * 2, RETRY_MAX_DELAY_MS) : delay,
    stalledDrains,
  };
};
