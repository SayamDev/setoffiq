import { CONFIDENCE_THRESHOLDS } from '../assumptions';
import type { SignalImpact, SignalReport, SignalState } from '../signals';
import { HOUR_MS } from '../time';
import type { ConfidenceAssessment, ConfidenceReason, Instant } from '../types';

/**
 * Confidence, derived from the signals rather than computed alongside them.
 *
 * This matters for more than tidiness: because the score comes from the same
 * reports the UI renders under "What's affecting your timing?", the number can
 * never disagree with the table that explains it. Previously the two were
 * calculated separately and could drift.
 *
 * It remains a transparent heuristic, not a calibrated probability, and the
 * interface says so.
 */

/** What each unknown costs. Stated as data so the weighting is inspectable. */
const STATE_PENALTY: Record<SignalState['kind'], number> = {
  live: 0,
  stale: 12,
  'user-supplied': 6,
  assumed: 8,
  unavailable: 18,
};

const IMPACT_PENALTY: Record<SignalImpact, number> = {
  none: 0,
  low: 3,
  moderate: 9,
  high: 18,
};

export function assessConfidence(
  reports: SignalReport[],
  now: Instant,
  eventTime: Instant,
): ConfidenceAssessment {
  const reasons: ConfidenceReason[] = [];
  let score = 100;

  for (const report of reports) {
    const penalty = STATE_PENALTY[report.state.kind] + IMPACT_PENALTY[report.impact];
    score -= penalty;

    reasons.push({
      label: report.label,
      detail: report.summary,
      impact: penalty === 0 ? 'positive' : 'negative',
    });
  }

  // Distance in time is its own uncertainty: conditions will change before then.
  const hoursAhead = (eventTime - now) / HOUR_MS;
  if (hoursAhead > 24) {
    score -= 12;
    reasons.push({
      label: 'More than a day ahead',
      detail: 'Flight and traffic conditions will change before then.',
      impact: 'negative',
    });
  }

  const boundedScore = Math.max(0, Math.min(100, score));
  const level =
    boundedScore >= CONFIDENCE_THRESHOLDS.high
      ? 'high'
      : boundedScore >= CONFIDENCE_THRESHOLDS.medium
        ? 'medium'
        : 'low';

  return { level, score: boundedScore, reasons };
}
