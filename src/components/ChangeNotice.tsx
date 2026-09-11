import { formatClock } from '../domain/time';
import type { Instant } from '../domain/types';
import { Button } from './ui';
import styles from './JourneyExtras.module.css';

/**
 * Shown when a recalculation actually moved the departure time.
 *
 * It says the old time, the new time and why — a bare "flight updated" would
 * leave the user to work out whether they need to do anything.
 */
export function ChangeNotice({
  previousDeparture,
  nextDeparture,
  reason,
  timeZone,
  onDismiss,
}: {
  previousDeparture: Instant;
  nextDeparture: Instant;
  reason: string;
  timeZone: string;
  onDismiss: () => void;
}): React.JSX.Element {
  return (
    <div className={styles.change} role="status" aria-live="polite">
      <p className={styles.changeTitle}>Your departure time changed</p>
      <p className={styles.changeTimes}>
        <span className={styles.was}>{formatClock(previousDeparture, timeZone)}</span>
        <span className={styles.arrow} aria-hidden="true">
          →
        </span>
        <span className={styles.now}>{formatClock(nextDeparture, timeZone)}</span>
      </p>
      <p>{reason}</p>
      <p>
        <Button variant="secondary" onClick={onDismiss}>
          Got it
        </Button>
      </p>
    </div>
  );
}
