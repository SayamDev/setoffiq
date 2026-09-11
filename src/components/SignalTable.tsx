import { byConcern, type SignalReport, type SignalState } from '../domain/signals';
import { formatClock, formatRelative } from '../domain/time';
import type { ConfidenceAssessment, Instant } from '../domain/types';
import styles from './SignalTable.module.css';

function markClass(state: SignalState): string {
  switch (state.kind) {
    case 'live':
      return styles.markLive!;
    case 'stale':
      return styles.markStale!;
    case 'unavailable':
      return styles.markUnavailable!;
    case 'not-configured':
      return styles.markAssumed!;
    default:
      return styles.markAssumed!;
  }
}

function describeState(state: SignalState, now: Instant, timeZone: string): string {
  switch (state.kind) {
    case 'live':
      return `Live · ${formatClock(state.observedAt, timeZone)}`;
    case 'stale':
      return `Stale · ${formatRelative(state.observedAt, now)}`;
    case 'user-supplied':
      return 'From you';
    case 'assumed':
      return 'Estimated';
    case 'not-configured':
      return 'Not checked';
    case 'unavailable':
      return 'Unavailable';
  }
}

/**
 * Each input to the recommendation, in its own terms.
 *
 * Answers the question people actually have — "does it really know this?" —
 * which a single confidence score never could. Confidence is derived from
 * exactly these rows, so the two can never contradict each other.
 */
export function SignalTable({
  signals,
  confidence,
  now,
  timeZone,
}: {
  signals: SignalReport[];
  confidence: ConfidenceAssessment;
  now: Instant;
  timeZone: string;
}): React.JSX.Element {
  return (
    <div>
      <ul className={styles.list}>
        {byConcern(signals).map((signal) => (
          <li className={styles.row} key={signal.id}>
            <span className={markClass(signal.state)} aria-hidden="true" />
            <span className={styles.label}>{signal.label}</span>
            <span className={styles.summary}>{signal.summary}</span>
            <span className={styles.state}>{describeState(signal.state, now, timeZone)}</span>
          </li>
        ))}
      </ul>

      <p className={styles.footnote}>
        Overall confidence is <strong>{confidence.level}</strong>, derived from these rows. It is a
        SetoffIQ heuristic reflecting how much current information was available — not a validated
        statistical probability.
      </p>
    </div>
  );
}
