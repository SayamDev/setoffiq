import { formatClock } from '../domain/time';
import type { JourneyEvent } from '../domain/types';
import styles from './JourneyExtras.module.css';

/** How many entries are worth reading at a glance. */
const SHOWN = 12;

/**
 * A plain record of what SetoffIQ did and when. Useful when a recommendation
 * changes twice and the user wants to know why — which means it has to stay
 * short enough to read.
 */
export function ActivityLog({
  events,
  timeZone,
}: {
  events: JourneyEvent[];
  timeZone: string;
}): React.JSX.Element {
  /*
   * Journeys saved before checks stopped being logged still carry a "checked
   * — nothing meaningful changed" line per check, dozens deep. They said
   * nothing then and say nothing now.
   */
  const newestFirst = [...events].filter((event) => event.kind !== 'checked').reverse();
  const shown = newestFirst.slice(0, SHOWN);
  const hidden = newestFirst.length - shown.length;

  return (
    <>
      <ol className={styles.log}>
        {shown.map((event) => (
          <li className={styles.logRow} key={event.id}>
            <span className={styles.logTime}>{formatClock(event.at, timeZone)}</span>
            <span className={styles.logMessage}>{event.message}</span>
          </li>
        ))}
      </ol>
      {hidden > 0 ? (
        <p className={styles.logMore}>
          {hidden} older {hidden === 1 ? 'entry' : 'entries'} not shown.
        </p>
      ) : null}
    </>
  );
}
