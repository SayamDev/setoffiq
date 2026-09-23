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

/**
 * When most live rows were read at the same minute, the minute belongs under
 * the table once rather than on every row. Only a row that differs carries its
 * own time — which is exactly the row worth noticing.
 */
function commonLiveMinute(signals: SignalReport[]): Instant | null {
  const minutes = signals
    .filter((signal) => signal.state.kind === 'live')
    .map((signal) => Math.floor((signal.state as { observedAt: Instant }).observedAt / 60_000));
  if (minutes.length < 3) return null;
  const counts = new Map<number, number>();
  for (const minute of minutes) counts.set(minute, (counts.get(minute) ?? 0) + 1);
  const [best, count] = [...counts].sort((a, b) => b[1] - a[1])[0]!;
  return count >= Math.ceil(minutes.length / 2) ? best * 60_000 : null;
}

function describeState(
  state: SignalState,
  now: Instant,
  timeZone: string,
  commonLive: Instant | null,
): string {
  switch (state.kind) {
    case 'live':
      return commonLive !== null && Math.floor(state.observedAt / 60_000) === Math.floor(commonLive / 60_000)
        ? 'Live'
        : `Live · ${formatClock(state.observedAt, timeZone)}`;
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
  const commonLive = commonLiveMinute(signals);

  return (
    <div>
      <ul className={styles.list}>
        {byConcern(signals).map((signal) => (
          <li
            className={`${styles.row} ${signal.id === 'road-disruption' && (signal.impact === 'high' || signal.impact === 'moderate') ? styles.roadAttention : ''}`}
            key={signal.id}
          >
            <span className={markClass(signal.state)} aria-hidden="true" />
            <span className={styles.label}>{signal.label}</span>
            <span className={styles.summary}>
              {signal.summary}
              <Detail detail={details[signal.id]} label={signal.label} />
            </span>
            <span className={styles.state}>{describeState(signal.state, now, timeZone, commonLive)}</span>
          </li>
        ))}
      </ul>

      {commonLive !== null ? (
        <p className={styles.asOf}>Live data as of {formatClock(commonLive, timeZone)}.</p>
      ) : null}

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
