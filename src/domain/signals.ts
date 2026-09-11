/**
 * Signals: the uniform way every input to a recommendation reports itself.
 *
 * Before this existed, "flight data" was a catch-all and confidence was a
 * single opaque score. Separating the inputs by domain — the flight, the
 * airport, the road, the assumptions — means the interface can answer the
 * question users actually ask, which is not "how confident are you?" but
 * "what is affecting my timing, and do you actually know it?"
 *
 * Every signal reports the same shape, so the UI renders them uniformly and
 * confidence is derived from them rather than computed alongside them.
 */
import type { Instant } from './types';

export type SignalId =
  | 'flight'
  | 'airport-conditions'
  | 'journey-weather'
  | 'route'
  | 'processing';

/**
 * What kind of knowledge this is. The distinction that matters most is
 * `measured` versus `assumed` — a figure we observed versus one we chose.
 */
export type SignalState =
  /** Observed from a source, and current. */
  | { kind: 'live'; observedAt: Instant }
  /** Observed, but older than we would like. */
  | { kind: 'stale'; observedAt: Instant; ageMinutes: number }
  /** The user told us, e.g. a scheduled time from a booking. */
  | { kind: 'user-supplied' }
  /** A SetoffIQ product assumption. Never presented as measurement. */
  | { kind: 'assumed' }
  /** We tried and could not find out. */
  | { kind: 'unavailable'; reason: string };

/** How much this signal is widening the recommendation's uncertainty. */
export type SignalImpact = 'none' | 'low' | 'moderate' | 'high';

export interface SignalReport {
  id: SignalId;
  label: string;
  state: SignalState;
  /** One line a non-technical user can read. */
  summary: string;
  impact: SignalImpact;
}

export function isMeasured(state: SignalState): boolean {
  return state.kind === 'live' || state.kind === 'stale';
}

/** Ordered worst-first, so the UI can lead with what is actually a problem. */
export function byConcern(reports: SignalReport[]): SignalReport[] {
  const impactRank: Record<SignalImpact, number> = { high: 0, moderate: 1, low: 2, none: 3 };
  const stateRank: Record<SignalState['kind'], number> = {
    unavailable: 0,
    stale: 1,
    assumed: 2,
    'user-supplied': 3,
    live: 4,
  };
  return [...reports].sort(
    (a, b) =>
      impactRank[a.impact] - impactRank[b.impact] || stateRank[a.state.kind] - stateRank[b.state.kind],
  );
}

/**
 * The stages between a flight existing and a passenger being collectable.
 *
 * Only some of these are observable. `airborne`, `approaching` and `landed`
 * come from an aircraft position; `disembarking` and `ready` are inferred from
 * elapsed time against the processing assumptions. The UI says which is which
 * rather than implying the whole chain is tracked.
 */
export type ReadinessStage =
  | 'scheduled'
  | 'airborne'
  | 'approaching'
  | 'landed'
  | 'disembarking'
  | 'ready'
  | 'unknown';

export const READINESS_STAGES: ReadinessStage[] = [
  'scheduled',
  'airborne',
  'approaching',
  'landed',
  'disembarking',
  'ready',
];

export interface ReadinessProgress {
  stage: ReadinessStage;
  /** True when the stage was observed rather than inferred from the clock. */
  observed: boolean;
  detail: string;
}
