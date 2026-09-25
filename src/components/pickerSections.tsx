import { formatClock, formatDate, todayInZone } from '../domain/time';
import type { AirportProfile } from '../domain/types';
import { Button, ui } from './ui';
import { Wordmark } from './Wordmark';
import styles from './InboundPicker.module.css';

/**
 * How many days of the timetable the picker offers: today, tomorrow and the
 * day after — enough for a lift arranged a couple of days ahead.
 *
 * Days, not "next N hours". Overlapping windows sorted by time always start
 * with the same flights, so switching from 12 to 48 hours looked as if nothing
 * had happened. A day is a distinct list, and "tomorrow" is how people think
 * about a pickup anyway.
 */
export const TIMETABLE_DAYS = 3;

export interface TimetableDay {
  /** The airport's local date, as YYYY-MM-DD. */
  key: string;
  label: string;
  count: number;
}

/** The airport's local date an instant falls on. */
export function dayKey(at: number, timeZone: string): string {
  return todayInZone(at, timeZone);
}

/** The days the timetable offers, today first, with how many flights each holds. */
export function timetableDays(
  flights: { at: number }[],
  now: number,
  timeZone: string,
): TimetableDay[] {
  const counts = new Map<string, number>();
  for (const flight of flights) {
    const key = dayKey(flight.at, timeZone);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const today = dayKey(now, timeZone);
  const tomorrow = dayKey(now + 86_400_000, timeZone);
  const days: TimetableDay[] = [];
  // Walk forward a day at a time from today, so a day with no flights still
  // appears as a choice (saying so) rather than silently vanishing.
  for (let offset = 0; days.length < TIMETABLE_DAYS && offset < TIMETABLE_DAYS + 1; offset += 1) {
    const at = now + offset * 86_400_000;
    const key = dayKey(at, timeZone);
    if (days.some((day) => day.key === key)) continue;
    const label = key === today ? 'Today' : key === tomorrow ? 'Tomorrow' : formatDate(at, timeZone);
    days.push({ key, label, count: counts.get(key) ?? 0 });
  }
  return days;
}

export function DayChoice({
  days,
  selected,
  onChange,
  filtering,
}: {
  days: TimetableDay[];
  selected: string;
  onChange: (key: string) => void;
  /** While filtering, every day is searched, so no single day is "on". */
  filtering: boolean;
}): React.JSX.Element {
  return (
    <div className={styles.horizon}>
      <div className={styles.horizonButtons} role="group" aria-label="Which day to list flights for">
        {days.map((day) => {
          const on = !filtering && day.key === selected;
          return (
            <button
              key={day.key}
              type="button"
              className={on ? styles.horizonOn : styles.horizonOff}
              aria-pressed={on}
              aria-label={`${day.label}, ${day.count} ${day.count === 1 ? 'flight' : 'flights'}`}
              onClick={() => onChange(day.key)}
            >
              {day.label}
              <span className={styles.dayCount} aria-hidden="true">
                {day.count}
              </span>
            </button>
          );
        })}
      </div>
      {filtering ? <p className={ui.hint}>Searching all {days.length} days.</p> : null}
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
