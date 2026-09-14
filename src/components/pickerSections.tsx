import { formatClock, formatDate } from '../domain/time';
import type { AirportProfile } from '../domain/types';
import { ui } from './ui';
import styles from './InboundPicker.module.css';

/**
 * How far ahead the timetable is listed.
 *
 * A day covers tonight and tomorrow morning, which is what most pickups need.
 * Three days and a week are there because people book a lift long before they
 * book a taxi, and the timetable can answer that — nothing else here can.
 */
export const HORIZONS = [
  { hours: 24, label: 'Next 24 hours' },
  { hours: 72, label: 'Next 3 days' },
  { hours: 168, label: 'Next week' },
] as const;

export function HorizonChoice({
  hours,
  onChange,
  shown,
}: {
  hours: number;
  onChange: (hours: number) => void;
  /** How many flights the current choice is showing, so the control means something. */
  shown: number;
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
        {shown === 0 ? 'No timetabled flights in this period.' : `${shown} flights`}
      </p>
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
