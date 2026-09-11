import type { AirportProfile, Instant } from '../../domain/types';
import { parseLocalDateTime, todayInZone } from '../../domain/time';
import { readCache, writeCache } from '../cache';
import { fetchJson } from '../http';
import { callsignToFlightNumber } from './callsigns';
import { isCargoOperator, operatorName } from './operators';

/** SetoffIQ's own record of landings, written by the snapshot job. */
export interface ArrivalHistory {
  generatedAt: string;
  recordingSince: string;
  keepDays: number;
  flights: Record<
    string,
    {
      from: { icao: string; city: string | null; country: string | null } | null;
      landings: { date: string; minute: number; km?: number }[];
    }
  >;
}

export type UsualStatus =
  /** Its usual time is still to come today (or tonight). */
  | 'expected'
  /** Its usual time has passed and it has not been seen — late, cancelled, or not flying today. */
  | 'not-seen-yet';

export interface UsualArrival {
  callsign: string;
  flightNumber: string | null;
  airline: string | null;
  from: string | null;
  fromCountry: string | null;
  /** The next time it would land if it keeps to its pattern: touchdown. */
  usualAt: Instant;
  daysSeen: number;
  daysConsidered: number;
  status: UsualStatus;
}

const HISTORY_PATH = 'data/flights/EGCC-history.json';
const CACHE_KEY = 'arrival-history:EGCC';

/** A flight must have landed on this many of the recent days to count as usual. */
export const USUAL_MIN_DAYS = 3;
/** The recent days a pattern is judged over. */
const LOOKBACK_DAYS = 7;
/** How far ahead "usually later" looks: the rest of the day and the night. */
const LOOK_AHEAD_HOURS = 12;
/** After its usual time, how long a missing flight is still worth mentioning. */
const NOT_SEEN_WINDOW_MINUTES = { from: 20, to: 180 };

export async function loadArrivalHistory(signal?: AbortSignal): Promise<ArrivalHistory | null> {
  const now = Date.now();
  const cached = readCache<ArrivalHistory>(CACHE_KEY, 30, now);
  if (cached?.fresh) return cached.value;
  try {
    const base = import.meta.env.BASE_URL || '/';
    const history = await fetchJson<ArrivalHistory>(`${base}${HISTORY_PATH}`.replace(/([^:]\/)\/+/g, '$1'), {
      provider: 'flight-snapshot',
      endpoint: 'history',
      signal,
    });
    writeCache(CACHE_KEY, history, now);
    return history;
  } catch {
    return cached?.value ?? null;
  }
}

/** Mean of times of day on a clock face, so 23:55 and 00:05 average to midnight. */
export function circularMeanMinute(minutes: number[]): number {
  const angles = minutes.map((minute) => (minute / 1440) * 2 * Math.PI);
  const x = angles.reduce((sum, a) => sum + Math.cos(a), 0);
  const y = angles.reduce((sum, a) => sum + Math.sin(a), 0);
  const mean = Math.atan2(y, x);
  return Math.round((((mean / (2 * Math.PI)) * 1440) % 1440 + 1440) % 1440);
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(y!, m! - 1, d! + days));
  return shifted.toISOString().slice(0, 10);
}

function clock(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

/** How many of the recent days a pattern can be judged over, given when recording began. */
function daysAvailable(history: ArrivalHistory, today: string): number {
  let days = 0;
  for (let back = 1; back <= LOOKBACK_DAYS; back += 1) {
    if (shiftDate(today, -back) >= history.recordingSince) days += 1;
  }
  return days;
}

export function usualTimeFor(
  history: ArrivalHistory,
  callsign: string,
  today: string,
): { minute: number; daysSeen: number; daysConsidered: number } | null {
  const record = history.flights[callsign];
  const daysConsidered = daysAvailable(history, today);
  if (!record || daysConsidered === 0) return null;
  const earliest = shiftDate(today, -LOOKBACK_DAYS);
  const recent = record.landings.filter((landing) => landing.date >= earliest && landing.date < today);
  if (recent.length < USUAL_MIN_DAYS) return null;
  return { minute: circularMeanMinute(recent.map((landing) => landing.minute)), daysSeen: recent.length, daysConsidered };
}

/**
 * Flights that usually land in the next twelve hours, from the record — and
 * those whose usual time has recently passed without them being seen.
 *
 * Aircraft already in the air are left to the live list, and anything seen
 * landing today is left out: it has already come.
 */
export function usualArrivals(
  history: ArrivalHistory,
  airport: AirportProfile,
  now: Instant,
  inTheAir: ReadonlySet<string>,
): UsualArrival[] {
  const today = todayInZone(now, airport.timeZone);
  const results: UsualArrival[] = [];

  for (const [callsign, record] of Object.entries(history.flights)) {
    if (inTheAir.has(callsign) || isCargoOperator(callsign)) continue;
    const usual = usualTimeFor(history, callsign, today);
    if (!usual) continue;
    if (record.landings.some((landing) => landing.date === today)) continue;

    const onToday = parseLocalDateTime(today, clock(usual.minute), airport.timeZone);
    if (onToday === null) continue;
    const minutesSince = (now - onToday) / 60_000;

    let usualAt: Instant;
    let status: UsualStatus;
    if (minutesSince >= NOT_SEEN_WINDOW_MINUTES.from && minutesSince <= NOT_SEEN_WINDOW_MINUTES.to) {
      usualAt = onToday;
      status = 'not-seen-yet';
    } else if (minutesSince < NOT_SEEN_WINDOW_MINUTES.from) {
      usualAt = onToday;
      status = 'expected';
    } else {
      const tomorrow = parseLocalDateTime(shiftDate(today, 1), clock(usual.minute), airport.timeZone);
      if (tomorrow === null) continue;
      usualAt = tomorrow;
      status = 'expected';
    }
    if (status === 'expected' && usualAt - now > LOOK_AHEAD_HOURS * 3_600_000) continue;

    results.push({
      callsign,
      flightNumber: callsignToFlightNumber(callsign),
      airline: operatorName(callsign),
      from: record.from?.city ?? record.from?.icao ?? null,
      fromCountry: record.from?.country ?? null,
      usualAt,
      daysSeen: usual.daysSeen,
      daysConsidered: usual.daysConsidered,
      status,
    });
  }

  return results.sort((a, b) => a.usualAt - b.usualAt);
}

/**
 * Minutes later (positive) or earlier than usual an aircraft in the air is
 * running, from its on-stand estimate. Null when there is no pattern, or the
 * difference is too small to be worth saying.
 */
export function minutesAgainstUsual(
  history: ArrivalHistory | null,
  callsign: string,
  estimatedOnStand: Instant | null,
  airport: AirportProfile,
  taxiMinutes: number,
): number | null {
  if (!history || estimatedOnStand === null) return null;
  const touchdown = estimatedOnStand - taxiMinutes * 60_000;
  const today = todayInZone(touchdown, airport.timeZone);
  const usual = usualTimeFor(history, callsign, today);
  if (!usual) return null;
  const usualAt = parseLocalDateTime(today, clock(usual.minute), airport.timeZone);
  if (usualAt === null) return null;
  let diff = Math.round((touchdown - usualAt) / 60_000);
  // Across midnight, the nearer of yesterday's and tomorrow's usual time.
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;
  return Math.abs(diff) >= 15 ? diff : null;
}
