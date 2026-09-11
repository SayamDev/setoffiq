import { FLIGHT_SNAPSHOT_STALE_AFTER_MINUTES } from '../domain/assumptions';
import { formatClock, formatRelative } from '../domain/time';
import type { Instant } from '../domain/types';
import styles from './DataFreshnessLabel.module.css';

/**
 * Every piece of live data on screen says when it was last updated. A number
 * with no timestamp next to it is an invitation to trust something stale.
 */
export function DataFreshnessLabel({
  observedAt,
  now,
  timeZone,
  label = 'Updated',
}: {
  observedAt: Instant | null;
  now: Instant;
  timeZone: string;
  label?: string;
}): React.JSX.Element {
  if (observedAt === null) {
    return <p className={styles.label}>No update time available</p>;
  }

  const ageMinutes = Math.round((now - observedAt) / 60_000);
  const stale = ageMinutes > FLIGHT_SNAPSHOT_STALE_AFTER_MINUTES;

  return (
    <p className={stale ? styles.labelStale : styles.label}>
      {stale ? <span aria-hidden="true">⚠ </span> : null}
      {label} {formatClock(observedAt, timeZone)}
      <span className={styles.relative}> · {formatRelative(observedAt, now)}</span>
    </p>
  );
}
