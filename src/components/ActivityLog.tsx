import { formatClock } from '../domain/time';
import type { JourneyEvent } from '../domain/types';
import styles from './JourneyExtras.module.css';

/**
 * A plain record of what SetoffIQ did and when. Useful when a recommendation
 * changes twice and the user wants to know why.
 */
export function ActivityLog({
  events,
  timeZone,
}: {
  events: JourneyEvent[];
  timeZone: string;
}): React.JSX.Element {
  const newestFirst = [...events].reverse();

  return (
    <ol className={styles.log}>
      {newestFirst.map((event) => (
        <li className={styles.logRow} key={event.id}>
          <span className={styles.logTime}>{formatClock(event.at, timeZone)}</span>
          <span className={styles.logMessage}>{event.message}</span>
        </li>
      ))}
    </ol>
  );
}
