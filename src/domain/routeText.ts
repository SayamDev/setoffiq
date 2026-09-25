import { formatClock, formatDate } from './time';
import type { Instant, JourneyKind } from './types';

export interface RouteForText {
  city: string | null;
  iata: string | null;
  countryName: string | null;
  timeZone: string | null;
  otherEndAt: Instant | null;
  durationMinutes: number | null;
  /** Nearest timetabled time here, when it is far from the time entered. */
  timetabledAt?: Instant | null;
}

export interface RouteText {
  headline: string;
  detail: string | null;
  basis: string;
}

function duration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/**
 * The other end of the flight in words: where, and when it is there, in that
 * place's own clock and in UK time. A clock in one zone alone invites the
 * wrong reading — someone in Manchester asking when a plane lands in Rabat
 * wants both.
 */
export function describeRoute(
  route: RouteForText,
  kind: JourneyKind,
  homeZone: string,
  now: Instant,
): RouteText {
  const where = [
    route.city && route.iata ? `${route.city} (${route.iata})` : (route.city ?? route.iata ?? 'Unknown airport'),
    route.countryName && route.countryName !== 'United Kingdom' ? route.countryName : null,
  ]
    .filter(Boolean)
    .join(', ');
  const headline = kind === 'pickup' ? `From ${where}` : `To ${where}`;
  const basis =
    "From the airlines' published timetable and the time on your booking. Not live: a delay on the day moves it.";

  if (route.otherEndAt === null) {
    return { headline, detail: mismatch(route, kind, homeZone), basis };
  }

  const at = route.otherEndAt;
  const place = route.city ?? route.iata ?? 'there';
  const home = formatClock(at, homeZone);
  // The day as well, when it is not today in the UK — an overnight flight
  // that lands tomorrow must say so.
  const day = formatDate(at, homeZone) !== formatDate(now, homeZone) ? ` on ${formatDate(at, homeZone)}` : '';
  const local = route.timeZone ? formatClock(at, route.timeZone) : null;
  const clocks =
    local === null
      ? `${home} UK time${day}`
      : local === home
        ? `${local}${day} — the same clock in ${place} and the UK`
        : `${local} ${place} time (${home} UK time${day})`;
  const flying = route.durationMinutes !== null ? `, ${duration(route.durationMinutes)} in the air` : '';

  return {
    headline,
    detail:
      kind === 'pickup'
        ? `Takes off from ${place} about ${clocks}${flying}.`
        : `Lands in ${place} about ${clocks}${flying}.`,
    basis,
  };
}

/**
 * The line under the flight on the recommendation card: when it is at the
 * other end, naming the place only where the clock needs it, and how long it
 * flies. "Lands 11:35 Rabat time · 3 hr 20 min in the air".
 */
export function cardMeta(
  route: Pick<RouteForText, 'city' | 'iata' | 'timeZone' | 'otherEndAt' | 'durationMinutes' | 'timetabledAt'>,
  kind: JourneyKind,
  homeZone: string,
): string | null {
  if (route.otherEndAt === null) return mismatch(route, kind, homeZone);
  const place = route.city ?? route.iata ?? 'there';
  const home = formatClock(route.otherEndAt, homeZone);
  const local = route.timeZone ? formatClock(route.otherEndAt, route.timeZone) : null;
  const clocks =
    local === null ? `${home} UK time` : local === home ? `${local} ${place} time` : `${local} ${place} time (${home} UK)`;
  const verb = kind === 'pickup' ? 'Takes off' : 'Lands';
  const flying = route.durationMinutes !== null ? ` · ${duration(route.durationMinutes)} in the air` : '';
  return `${verb} ${clocks}${flying}`;
}

/**
 * "Timetabled to land at 07:50 on Sat 26 Sept — check the time on the
 * booking." Said when the number is timetabled, just not near the time given.
 */
function mismatch(
  route: Pick<RouteForText, 'timetabledAt'>,
  kind: JourneyKind,
  homeZone: string,
): string | null {
  if (!route.timetabledAt) return null;
  return `Timetabled to ${kind === 'pickup' ? 'land' : 'leave'} at ${formatClock(route.timetabledAt, homeZone)} on ${formatDate(route.timetabledAt, homeZone)}, not the time entered — check the booking.`;
}
