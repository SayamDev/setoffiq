import { useId } from 'react';
import { formatClock, formatDate } from '../domain/time';
import type { AirportProfile, Instant } from '../domain/types';
import type { TimetableFlight } from '../services/flight';
import { Skeleton, ui } from './ui';
import styles from './InboundPicker.module.css';

/**
 * Does this flight match what has been typed into the filter?
 *
 * Matching on the number without its space — "BA 1360" finding "BA1360" — is
 * the difference between a filter that works on a boarding pass and one that
 * looks broken.
 */
export function matches(query: string, parts: (string | null)[]): boolean {
  const wanted = query.trim().toLowerCase().replace(/\s+/g, '');
  if (!wanted) return true;
  return parts.some((part) => part && part.toLowerCase().replace(/\s+/g, '').includes(wanted));
}

/** Filter by flight number, airline or city. */
export function FilterField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}): React.JSX.Element {
  const id = useId();
  return (
    <div className={styles.filter}>
      <label className={ui.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={ui.control}
        type="search"
        inputMode="search"
        autoComplete="off"
        placeholder="Flight number, airline or city"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/**
 * What a list looks like while it is being fetched.
 *
 * Rows rather than a word, because the wait is short and the shape of what is
 * coming is already known: a spinner in the same space would say less.
 */
export function LoadingRows({ label, rows = 4 }: { label: string; rows?: number }): React.JSX.Element {
  return (
    <div className={styles.loading} role="status" aria-live="polite">
      <p className={ui.hint}>{label}</p>
      <div className={styles.loadingRows} aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className={styles.loadingRow}>
            <Skeleton width="4.5rem" height="1rem" />
            <Skeleton width="60%" height="1rem" />
            <Skeleton width="3rem" height="1rem" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Timetabled flights, grouped under the day they fall on.
 *
 * The day matters here in a way it does not in the live list: this reaches
 * into tomorrow and beyond, and "09:30" alone would be ambiguous.
 */
export function TimetableList({
  flights,
  airport,
  direction,
  now,
  onPick,
}: {
  flights: TimetableFlight[];
  airport: AirportProfile;
  direction: 'arrival' | 'departure';
  now: Instant;
  onPick: (flight: TimetableFlight) => void;
}): React.JSX.Element {
  const zone = airport.timeZone;
  const days = groupByDay(flights, zone);
  const today = formatDate(now, zone);

  return (
    <>
      {days.map(([day, onThatDay]) => (
        <div key={day}>
          <h3 className={styles.dayHeading}>{day === today ? `Today, ${day}` : day}</h3>
          <ul className={styles.list}>
            {onThatDay.map((flight) => (
              <li key={`${flight.flight}-${flight.at}`}>
                <button type="button" className={styles.option} onClick={() => onPick(flight)}>
                  <span className={styles.identifier}>{flight.flight}</span>
                  <span className={styles.who}>
                    {flight.airlineName ? <span className={styles.airline}>{flight.airlineName}</span> : null}
                    {flight.place ? (
                      <span className={styles.origin}>
                        {direction === 'arrival' ? 'from' : 'to'} {flight.place}
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.detail}>{flight.terminal ? `T${flight.terminal}` : ''}</span>
                  <span className={styles.detail}>{formatClock(flight.at, zone)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function groupByDay(flights: TimetableFlight[], zone: string): [string, TimetableFlight[]][] {
  const days = new Map<string, TimetableFlight[]>();
  for (const flight of flights) {
    const day = formatDate(flight.at, zone);
    days.set(day, [...(days.get(day) ?? []), flight]);
  }
  return [...days.entries()];
}
