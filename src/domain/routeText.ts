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
    'Other-airport times are inferred from your saved flight time and the weekly timetable’s estimated duration. They are not airline-confirmed or live times.';

  if (route.otherEndAt === null || route.timetabledAt) {
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
  if (route.otherEndAt === null || route.timetabledAt) return mismatch(route, kind, homeZone);
  const place = route.city ?? route.iata ?? 'there';
  const home = formatClock(route.otherEndAt, homeZone);
  const local = route.timeZone ? formatClock(route.otherEndAt, route.timeZone) : null;
  const clocks =
    local === null ? `${home} UK time` : local === home ? `${local} ${place} time` : `${local} ${place} time (${home} UK)`;
  const verb = kind === 'pickup' ? 'Estimated take-off' : 'Estimated arrival';
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
  return `Weekly timetable ${kind === 'pickup' ? 'arrival' : 'departure'}: ${formatClock(route.timetabledAt, homeZone)} Manchester time on ${formatDate(route.timetabledAt, homeZone)}. It may not apply to your booking date. Your saved flight time is kept; use your airline booking.`;
}
