import { formatClock, formatDate } from '../domain/time';
import type { AirportProfile } from '../domain/types';
import { Button, ui } from './ui';
import { Wordmark } from './Wordmark';
import styles from './InboundPicker.module.css';

/**
 * How far ahead the timetable is listed.
 *
 * The picker is for choosing a likely flight, not browsing the airport's whole
 * week. Two days is enough for planned lifts without expanding thousands of
 * timetable rows into the page.
 */
export const HORIZONS = [
  { hours: 12, label: 'Next 12 hours' },
  { hours: 24, label: 'Next 24 hours' },
  { hours: 48, label: 'Next 48 hours' },
] as const;

export function HorizonChoice({
  hours,
  onChange,
  shown,
  capped = false,
}: {
  hours: number;
  onChange: (hours: number) => void;
  /** How many flights are shown in the current choice. */
  shown: number;
  /** Whether this is a capped browsing set rather than every match in the period. */
  capped?: boolean;
}): React.JSX.Element {
  return (
    <div className={styles.horizon}>
      <div className={styles.horizonButtons} role="group" aria-label="How far ahead to list flights">
        {HORIZONS.map((option) => (
          <button
            key={option.hours}
            type="button"
            className={option.hours === hours ? styles.horizonOn : styles.horizonOff}
            aria-pressed={option.hours === hours}
            onClick={() => onChange(option.hours)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className={ui.hint}>
        {shown === 0
          ? 'No timetabled flights in this period.'
          : capped
            ? `First ${shown} flights`
            : `${shown} flights`}
      </p>
    </div>
  );
}

export function RefreshPopup(): React.JSX.Element {
  return (
    <div className={styles.refreshBackdrop} role="status" aria-live="polite" aria-atomic="true">
      <div className={styles.refreshPanel}>
        <div className={styles.refreshDial} aria-hidden="true">
          <span className={styles.refreshSweep} />
          <span className={styles.refreshHand} />
          <span className={styles.refreshCentre} />
        </div>
        <div className={styles.refreshCopy}>
          <span className={styles.refreshBrand} aria-hidden="true">
            <Wordmark />
          </span>
          <strong>Refreshing flight data</strong>
          <span>Checking the latest positions and times...</span>
        </div>
      </div>
    </div>
  );
}

export function ShowMoreControl({
  total,
  shown,
  onShowMore,
}: {
  total: number;
  shown: number;
  onShowMore: () => void;
}): React.JSX.Element | null {
  const remaining = total - shown;
  if (remaining <= 0) return null;

  return (
    <div className={styles.showMore}>
      <Button variant="secondary" onClick={onShowMore}>
        Show more
      </Button>
      <span className={ui.hint}>
        Showing {Math.min(shown, total)} of {total}. {remaining} more hidden.
      </span>
    </div>
  );
}

/** What the timetable is, said once, where it is used. */
export function TimetableNote({
  generatedAt,
  airport,
  direction,
}: {
  generatedAt: string;
  airport: AirportProfile;
  direction: 'arrival' | 'departure';
}): React.JSX.Element {
  const when = Date.parse(generatedAt);
  return (
    <p className={ui.hint}>
      The airlines' published weekly timetable, from AirLabs
      {Number.isFinite(when) ? `, last updated ${formatDate(when, airport.timeZone)}` : null}. It
      says what is meant to {direction === 'arrival' ? 'land' : 'leave'} and when — not what is
      happening today: delays and cancellations are not known this far ahead. Check with the airline
      before you set off.
    </p>
  );
}

/** Said when every list is empty, rather than leaving a blank panel. */
export function NothingFound({
  query,
  onClear,
  airport,
  now,
}: {
  query: string;
  onClear: () => void;
  airport: AirportProfile;
  now: number;
}): React.JSX.Element {
  if (query.trim()) {
    return (
      <p className={ui.hint}>
        Nothing matches “{query.trim()}”.{' '}
        <button type="button" className={styles.inlineButton} onClick={onClear}>
          Clear the filter
        </button>
      </p>
    );
  }
  return (
    <p className={ui.hint}>
      No flights could be listed for {airport.name} just now — as of{' '}
      {formatClock(now, airport.timeZone)}. Enter the flight number and time from the booking below.
    </p>
  );
}
