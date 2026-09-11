import { formatClock } from '../domain/time';
import type { AirportProfile } from '../domain/types';
import { bestTime, lateBy, type ListedFlight } from '../services/flight';
import styles from './InboundPicker.module.css';

/**
 * Scheduled flights as rows to pick from, each saying plainly where it stands:
 * cancelled, delayed and by how much, in the air, landed — or nothing, when it
 * is simply on schedule.
 */
export function ScheduledList({
  flights,
  airport,
  direction,
  onPick,
}: {
  flights: ListedFlight[];
  airport: AirportProfile;
  direction: 'arrival' | 'departure';
  onPick: (flight: ListedFlight) => void;
}): React.JSX.Element {
  const zone = airport.timeZone;
  return (
    <ul className={styles.list}>
      {flights.map((flight) => {
        const late = lateBy(flight);
        const expected = flight.estimated !== null && Math.abs(flight.estimated - flight.scheduled) >= 5 * 60_000;
        return (
          <li key={`${flight.flight}-${flight.scheduled}`}>
            <button type="button" className={styles.option} onClick={() => onPick(flight)}>
              <span className={styles.identifier}>{flight.flight}</span>
              <span className={styles.who}>
                {flight.airlineName ? <span className={styles.airline}>{flight.airlineName}</span> : null}
                {flight.place ? (
                  <span className={styles.origin}>
                    {direction === 'arrival' ? 'from' : 'to'} {flight.place}
                  </span>
                ) : null}
                <Status flight={flight} late={late} zone={zone} direction={direction} />
              </span>
              <span className={styles.detail}>{formatClock(flight.scheduled, zone)}</span>
              <span className={styles.detail}>
                {flight.status !== 'cancelled' && expected ? `exp ${formatClock(bestTime(flight), zone)}` : ''}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Status({
  flight,
  late,
  zone,
  direction,
}: {
  flight: ListedFlight;
  late: number | null;
  zone: string;
  direction: 'arrival' | 'departure';
}): React.JSX.Element | null {
  if (flight.status === 'cancelled') return <span className={styles.cancelled}>Cancelled</span>;
  if (direction === 'arrival' && flight.status === 'landed') {
    return <span className={styles.origin}>Landed {formatClock(bestTime(flight), zone)}</span>;
  }
  if (late !== null) return <span className={styles.notice}>Delayed ~{late} min</span>;
  if (direction === 'arrival' && flight.status === 'active') return <span className={styles.origin}>In the air</span>;
  return null;
}

/** One line describing a picked scheduled flight's state, for the summary. */
export function describeScheduled(flight: ListedFlight, zone: string, direction: 'arrival' | 'departure'): string {
  const when = formatClock(flight.scheduled, zone);
  const verb = direction === 'arrival' ? 'arrive' : 'depart';
  if (flight.status === 'cancelled') return `Scheduled to ${verb} at ${when}, but listed as cancelled. Check with the airline.`;
  if (direction === 'arrival' && flight.status === 'landed') return `Scheduled ${when}; landed at about ${formatClock(bestTime(flight), zone)}.`;
  const late = lateBy(flight);
  if (late !== null) return `Scheduled to ${verb} at ${when}; running about ${late} minutes late, expected ${formatClock(bestTime(flight), zone)}.`;
  return `Scheduled to ${verb} at ${when}.`;
}
