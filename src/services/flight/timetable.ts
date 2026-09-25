import type { Instant } from '../../domain/types';
import { readCache, writeCache } from '../cache';
import { fetchJson } from '../http';
import { dataUrl } from './dataUrl';
import { normaliseFlightNumber } from './callsigns';
import { isCargoOperator, operatorName } from './operators';

/** Where the other end of a timetabled flight is. */
interface Place {
  icao: string | null;
  iata: string | null;
  city: string | null;
  country: string | null;
  /** IANA timezone of that airport, e.g. "Africa/Casablanca", when known. */
  timeZone?: string | null;
}

/** One line of the airlines' weekly timetable, as published by the deploy job. */
export interface TimetableEntry {
  flight: string;
  callsign: string | null;
  airline: string | null;
  otherEnd: Place | null;
  /** Days of the week it operates, as 'mon' … 'sun'. */
  days: string[];
  /** Minutes after UTC midnight that it leaves its origin. */
  departureMinute: number;
  /** Time in the air, so an arrival can be placed from the departure. */
  durationMinutes: number | null;
  terminal: string | null;
  aliases: string[];
}

export interface FlightTimetable {
  generatedAt: string;
  attribution: string;
  arrivals: TimetableEntry[];
  departures: TimetableEntry[];
}

/** A timetabled flight placed on a real day. */
export interface TimetableFlight {
  flight: string;
  callsign: string | null;
  airlineName: string | null;
  place: string | null;
  otherEnd: Place | null;
  /** When it is timetabled to land here, or to leave here. */
  at: Instant;
  terminal: string | null;
  aliases: string[];
  /** Time in the air, when the timetable gives it. */
  durationMinutes: number | null;
}

const TIMETABLE_PATH = 'data/flights/EGCC-timetable.json';
const CACHE_KEY = 'flight-timetable:EGCC';

/**
 * A timetable is a season's worth of intent, so it ages in weeks. The job
 * refreshes it every 28 days; this leaves room for a late run without the
 * list blanking, and stops a forgotten file being shown months later.
 */
export const TIMETABLE_USABLE_DAYS = 45;

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const DAY_MS = 86_400_000;

export async function loadTimetable(
  signal?: AbortSignal,
  options: { forceRefresh?: boolean } = {},
): Promise<FlightTimetable | null> {
  const now = Date.now();
  const cached = readCache<FlightTimetable>(CACHE_KEY, 60, now);
  let timetable = cached?.fresh && !options.forceRefresh ? cached.value : null;
  if (!timetable) {
    try {
      timetable = await fetchJson<FlightTimetable>(dataUrl(TIMETABLE_PATH, options.forceRefresh), {
        provider: 'flight-snapshot',
        endpoint: 'timetable',
        signal,
        // Optional data: a missing file must not hold up a plan with retries.
        retries: 0,
      });
      writeCache(CACHE_KEY, timetable, now);
    } catch {
      timetable = cached?.value ?? null;
    }
  }
  if (!timetable || !Array.isArray(timetable.arrivals)) return null;
  const age = now - Date.parse(timetable.generatedAt);
  return Number.isFinite(age) && age <= TIMETABLE_USABLE_DAYS * DAY_MS ? timetable : null;
}

/**
 * Place the timetable on real days.
 *
 * Each entry gives a departure time in UTC and the days it runs, so a flight
 * is placed by adding its time to a UTC midnight, and an arrival here by
 * adding the time in the air to that. Working from the departure rather than
 * the published arrival time keeps flights that land the day after they leave
 * on the right day.
 */
export function timetableWindow(
  timetable: FlightTimetable,
  direction: 'arrival' | 'departure',
  now: Instant,
  hoursAhead: number,
  /** How far back to reach, so a flight due a few minutes ago is still offered. */
  minutesBehind = 20,
): TimetableFlight[] {
  const entries = direction === 'arrival' ? timetable.arrivals : timetable.departures;
  const from = now - minutesBehind * 60_000;
  const to = now + hoursAhead * 3_600_000;
  const results: TimetableFlight[] = [];
  const seen = new Set<string>();

  // A day either side of the window covers flights placed by a departure that
  // is on the previous UTC day, and the last hours of the final day.
  const firstDay = Math.floor(from / DAY_MS) - 1;
  const lastDay = Math.floor(to / DAY_MS) + 1;

  for (const entry of entries) {
    if (entry.callsign && isCargoOperator(entry.callsign)) continue;
    const flightMinutes = direction === 'arrival' ? entry.durationMinutes : 0;
    if (flightMinutes === null) continue;

    for (let day = firstDay; day <= lastDay; day += 1) {
      const midnight = day * DAY_MS;
      const weekday = DAYS[new Date(midnight).getUTCDay()] as string;
      if (!entry.days.includes(weekday)) continue;
      const at = midnight + entry.departureMinute * 60_000 + flightMinutes * 60_000;
      if (at < from || at > to) continue;
      const key = `${entry.flight}@${at}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        flight: entry.flight,
        callsign: entry.callsign,
        airlineName: entry.callsign ? operatorName(entry.callsign) : null,
        place: entry.otherEnd?.city ?? entry.otherEnd?.iata ?? null,
        otherEnd: entry.otherEnd,
        at,
        terminal: entry.terminal,
        aliases: entry.aliases,
        durationMinutes: entry.durationMinutes,
      });
    }
  }

  return results.sort((a, b) => a.at - b.at);
}

/**
 * Drop timetabled flights the live schedule already covers, so the same flight
 * is never offered twice — once with a status and once without.
 */
export function withoutScheduled(
  flights: TimetableFlight[],
  scheduled: { flight: string; aliases: string[]; scheduled: Instant }[],
): TimetableFlight[] {
  const known = new Map<string, Instant[]>();
  for (const entry of scheduled) {
    for (const number of [entry.flight, ...entry.aliases]) {
      const key = normaliseFlightNumber(number);
      known.set(key, [...(known.get(key) ?? []), entry.scheduled]);
    }
  }
  return flights.filter((flight) => {
    const times = known.get(normaliseFlightNumber(flight.flight)) ?? [];
    // The same number on the same day, give or take: the timetable and the
    // schedule rarely agree to the minute.
    return !times.some((time) => Math.abs(time - flight.at) < 6 * 3_600_000);
  });
}
