import type { Instant } from '../../domain/types';
import { readCache, writeCache } from '../cache';
import { fetchJson } from '../http';
import { normaliseFlightNumber } from './callsigns';
import { isCargoOperator, operatorName } from './operators';

/** One flight from the published AirLabs schedule. Times are epoch ms. */
export interface ScheduledFlight {
  flight: string;
  callsign: string | null;
  airline: string | null;
  otherEnd: { icao: string | null; iata: string | null; city: string | null; country: string | null } | null;
  scheduled: Instant;
  estimated: Instant | null;
  actual: Instant | null;
  status: 'scheduled' | 'cancelled' | 'active' | 'landed' | null;
  delayMinutes: number | null;
  terminal: string | null;
  /** Marketing numbers the same aircraft is sold under. */
  aliases: string[];
}

export interface FlightSchedule {
  generatedAt: string;
  attribution: string;
  arrivals: ScheduledFlight[];
  departures: ScheduledFlight[];
}

export const SCHEDULE_ATTRIBUTION = 'Flight schedules from AirLabs (airlabs.co)';

const SCHEDULE_PATH = 'data/flights/EGCC-schedule.json';
const CACHE_KEY = 'flight-schedule:EGCC';

/**
 * A schedule older than this is not shown as the flights of the day. The job
 * refreshes every four and a half hours; twelve means it has stopped.
 */
export const SCHEDULE_USABLE_HOURS = 12;
/** How far ahead the schedule is listed. AirLabs covers about ten hours. */
const AHEAD_HOURS = 10;
/** An arrival that landed this recently may still have a passenger inside. */
const LANDED_WITHIN_MINUTES = 45;
/** A delay worth mentioning. */
export const NOTABLE_DELAY_MINUTES = 15;

export async function loadSchedule(signal?: AbortSignal): Promise<FlightSchedule | null> {
  const now = Date.now();
  const cached = readCache<FlightSchedule>(CACHE_KEY, 15, now);
  let schedule: FlightSchedule | null = cached?.fresh ? cached.value : null;
  if (!schedule) {
    try {
      const base = import.meta.env.BASE_URL || '/';
      schedule = await fetchJson<FlightSchedule>(`${base}${SCHEDULE_PATH}`.replace(/([^:]\/)\/+/g, '$1'), {
        provider: 'flight-snapshot',
        endpoint: 'schedule',
        signal,
        // Optional data: a missing file must not hold up a plan with retries.
        retries: 0,
      });
      writeCache(CACHE_KEY, schedule, now);
    } catch {
      schedule = cached?.value ?? null;
    }
  }
  if (!schedule || !Array.isArray(schedule.arrivals)) return null;
  const age = now - Date.parse(schedule.generatedAt);
  return Number.isFinite(age) && age <= SCHEDULE_USABLE_HOURS * 3_600_000 ? schedule : null;
}

/** The time that matters now: what happened, else what is expected, else the plan. */
export function bestTime(flight: ScheduledFlight): Instant {
  return flight.actual ?? flight.estimated ?? flight.scheduled;
}

/** Minutes late, from the delay figure or the estimate, when it is worth saying. */
export function lateBy(flight: ScheduledFlight): number | null {
  const fromEstimate = flight.estimated !== null ? Math.round((flight.estimated - flight.scheduled) / 60_000) : null;
  const late = flight.delayMinutes ?? fromEstimate;
  return late !== null && late >= NOTABLE_DELAY_MINUTES ? late : null;
}

export interface ListedFlight extends ScheduledFlight {
  airlineName: string | null;
  place: string | null;
}

function listed(flight: ScheduledFlight): ListedFlight {
  return {
    ...flight,
    airlineName: flight.callsign ? operatorName(flight.callsign) : null,
    place: flight.otherEnd?.city ?? flight.otherEnd?.iata ?? null,
  };
}

/**
 * Arrivals worth offering for a pickup: due in the next ten hours, or landed
 * in the last three-quarters of an hour — and cancelled ones, so nobody plans
 * around a flight that is not coming.
 */
export function upcomingArrivals(schedule: FlightSchedule, now: Instant): ListedFlight[] {
  return schedule.arrivals
    .filter((flight) => !(flight.callsign && isCargoOperator(flight.callsign)))
    .filter((flight) => {
      const at = bestTime(flight);
      if (flight.status === 'landed') return at >= now - LANDED_WITHIN_MINUTES * 60_000;
      return at >= now - LANDED_WITHIN_MINUTES * 60_000 && flight.scheduled <= now + AHEAD_HOURS * 3_600_000;
    })
    .map(listed)
    .sort((a, b) => bestTime(a) - bestTime(b));
}

/** Departures worth offering for a drop-off: not yet gone, in the next ten hours. */
export function upcomingDepartures(schedule: FlightSchedule, now: Instant): ListedFlight[] {
  return schedule.departures
    .filter((flight) => !(flight.callsign && isCargoOperator(flight.callsign)))
    .filter((flight) => flight.status !== 'active' && flight.status !== 'landed')
    .filter((flight) => bestTime(flight) >= now && flight.scheduled <= now + AHEAD_HOURS * 3_600_000)
    .map(listed)
    .sort((a, b) => a.scheduled - b.scheduled);
}

/**
 * The scheduled flight a journey is about: the same number (or a codeshare of
 * it) nearest the time the user entered, within twelve hours either side.
 */
export function findScheduled(
  list: ScheduledFlight[],
  flightNumber: string,
  around: Instant,
): ScheduledFlight | null {
  const wanted = normaliseFlightNumber(flightNumber);
  let best: ScheduledFlight | null = null;
  for (const flight of list) {
    const numbers = [flight.flight, ...flight.aliases, flight.callsign ?? ''].map(normaliseFlightNumber);
    if (!numbers.includes(wanted)) continue;
    const gap = Math.abs(flight.scheduled - around);
    if (gap > 12 * 3_600_000) continue;
    if (!best || gap < Math.abs(best.scheduled - around)) best = flight;
  }
  return best;
}
