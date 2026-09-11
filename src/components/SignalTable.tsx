import { byConcern, type SignalId, type SignalReport, type SignalState } from '../domain/signals';
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
/** What a row can show when opened: the figure, why it is that, and the raw facts. */
export interface SignalDetail {
  value?: string;
  detail?: string;
  facts?: string[];
  /** What the provider said about this reading — why it is missing, or odd. */
  note?: string;
}

export function SignalTable({
  signals,
  confidence,
  now,
  timeZone,
  attributions = [],
  details = {},
}: {
  signals: SignalReport[];
  confidence: ConfidenceAssessment;
  now: Instant;
  timeZone: string;
  /** Licence attributions required by sources actually in use here. */
  attributions?: string[];
  /**
   * The reasoning behind each row, shown on demand. Kept here rather than in
   * a second section repeating the same six figures in different words.
   */
  details?: Partial<Record<SignalId, SignalDetail>>;
}): React.JSX.Element {
  return (
    <div>
      <ul className={styles.list}>
        {byConcern(signals).map((signal) => (
          <li className={styles.row} key={signal.id}>
            <span className={markClass(signal.state)} aria-hidden="true" />
            <span className={styles.label}>{signal.label}</span>
            <span className={styles.summary}>
              {signal.summary}
              <Detail detail={details[signal.id]} label={signal.label} />
            </span>
            <span className={styles.state}>{describeState(signal.state, now, timeZone)}</span>
          </li>
        ))}
      </ul>

      <p className={styles.footnote}>
        Overall confidence is <strong>{confidence.level}</strong>, derived from these rows. It is a
        SetoffIQ heuristic reflecting how much current information was available — not a validated
        statistical probability.
      </p>

      {attributions.length > 0 ? (
        <p className={styles.attribution}>{attributions.join(' · ')}</p>
      ) : null}
    </div>
  );
}

function Detail({ detail, label }: { detail?: SignalDetail; label: string }): React.JSX.Element | null {
  if (!detail || (!detail.value && !detail.detail && !detail.facts?.length && !detail.note)) return null;
  return (
    <details className={styles.more}>
      <summary className={styles.moreSummary}>
        Why this figure<span className={styles.visuallyHidden}> for {label}</span>
      </summary>
      <div className={styles.moreBody}>
        {detail.value ? <p className={styles.moreValue}>{detail.value}</p> : null}
        {detail.detail ? <p>{detail.detail}</p> : null}
        {detail.note ? <p className={styles.moreNote}>{detail.note}</p> : null}
        {detail.facts?.length ? <p className={styles.facts}>{detail.facts.join(' · ')}</p> : null}
      </div>
    </details>
  );
}

