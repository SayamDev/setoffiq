import { DEFAULT_AIRPORT } from '../domain/airports';
import { todayInZone } from '../domain/time';
import type { FlightSchedule, ScheduledFlight } from './flight/schedule';
import { SCHEDULE_USABLE_HOURS } from './flight/schedule';
import { normaliseFlightNumber } from './flight/callsigns';

/** Only fresh, dated records can fill a clock; recurring timetables cannot. */
export function quickFlightMatches(
  schedule: FlightSchedule | null,
  number: string,
  date: string,
  now: number,
  kind: 'pickup' | 'dropoff' = 'pickup',
): ScheduledFlight[] {
  if (!schedule) return [];
  const age = now - Date.parse(schedule.generatedAt);
  if (
    !Number.isFinite(age) ||
    age < -60_000 ||
    age > SCHEDULE_USABLE_HOURS * 3_600_000
  )
    return [];
  const wanted = normaliseFlightNumber(number);
  const seen = new Set<number>();
  return (kind === 'pickup' ? schedule.arrivals : schedule.departures).filter(
    (flight) => {
      if (
        ![flight.flight, ...flight.aliases].some(
          (value) => normaliseFlightNumber(value) === wanted,
        )
      )
        return false;
      if (
        !Number.isFinite(flight.scheduled) ||
        todayInZone(flight.scheduled, DEFAULT_AIRPORT.timeZone) !== date ||
        seen.has(flight.scheduled)
      )
        return false;
      seen.add(flight.scheduled);
      return true;
    },
  );
}
