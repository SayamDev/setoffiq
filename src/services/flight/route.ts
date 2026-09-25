import type { Instant, JourneyKind } from '../../domain/types';
import { normaliseFlightNumber } from './callsigns';
import { findScheduled, loadSchedule } from './schedule';
import { loadTimetable, timetableWindow, type TimetableFlight } from './timetable';

/** The other end of a journey's flight, and when the flight is there. */
export interface FlightRoute {
  city: string | null;
  iata: string | null;
  /** ISO 3166 code, e.g. "MA". */
  country: string | null;
  /** IANA zone, e.g. "Africa/Casablanca", so its clock can be shown too. */
  timeZone: string | null;
  /**
   * For a drop-off, when it lands there; for a pickup, when it left there.
   * Worked out from the booked time here plus the timetabled time in the air,
   * so a booking that differs from the timetable still gives the right answer.
   * Null when the timetable does not give a duration.
   */
  otherEndAt: Instant | null;
  durationMinutes: number | null;
}

/** A timetabled flight this far from the booked time is a different one. */
const MATCH_WITHIN_HOURS = 3;

function matches(flight: TimetableFlight, wanted: string): boolean {
  return [flight.flight, ...flight.aliases, flight.callsign ?? ''].some(
    (number) => normaliseFlightNumber(number) === wanted,
  );
}

/**
 * Where a journey's flight goes to or comes from, from the timetable, with
 * the schedule as a fallback for the place alone. Nothing here is live: it is
 * what the airlines publish, and the page says so.
 */
export async function loadFlightRoute(
  kind: JourneyKind,
  flightNumber: string | null,
  scheduledTime: Instant,
  signal?: AbortSignal,
): Promise<FlightRoute | null> {
  if (!flightNumber) return null;
  const wanted = normaliseFlightNumber(flightNumber);
  const direction = kind === 'pickup' ? 'arrival' : 'departure';

  const timetable = await loadTimetable(signal).catch(() => null);
  if (timetable) {
    const window = MATCH_WITHIN_HOURS * 3_600_000;
    const candidates = timetableWindow(
      timetable,
      direction,
      scheduledTime - window,
      (2 * window) / 3_600_000,
      0,
    ).filter((flight) => matches(flight, wanted));
    const best = candidates.sort(
      (a, b) => Math.abs(a.at - scheduledTime) - Math.abs(b.at - scheduledTime),
    )[0];
    if (best?.otherEnd) {
      const minutes = best.durationMinutes;
      return {
        city: best.otherEnd.city,
        iata: best.otherEnd.iata,
        country: best.otherEnd.country,
        timeZone: best.otherEnd.timeZone ?? null,
        otherEndAt:
          minutes === null
            ? null
            : kind === 'pickup'
              ? scheduledTime - minutes * 60_000
              : scheduledTime + minutes * 60_000,
        durationMinutes: minutes,
      };
    }
  }

  // No timetable match: the schedule still knows the place, if not the time.
  const schedule = await loadSchedule(signal).catch(() => null);
  const onSchedule = schedule
    ? findScheduled(kind === 'pickup' ? schedule.arrivals : schedule.departures, flightNumber, scheduledTime)
    : null;
  if (onSchedule?.otherEnd) {
    return {
      city: onSchedule.otherEnd.city,
      iata: onSchedule.otherEnd.iata,
      country: onSchedule.otherEnd.country,
      timeZone: onSchedule.otherEnd.timeZone ?? null,
      otherEndAt: null,
      durationMinutes: null,
    };
  }
  return null;
}

/** "Morocco" from "MA", in British English; the code itself if unknown. */
export function countryName(code: string | null): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(['en-GB'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
