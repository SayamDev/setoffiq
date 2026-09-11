import { formatClock, minutesBetween } from '../time';
import type { Advisory, Instant, TimeWindow } from '../types';

/**
 * Turns "leave at 18:05" into the thing the user actually wants to be told
 * right now: wait, go, or you are behind.
 */
export function buildPickupAdvisory(
  now: Instant,
  departure: Instant,
  readiness: TimeWindow,
  timeZone: string,
): Advisory {
  const minutesAway = minutesBetween(now, departure);

  if (minutesAway > 180) {
    return {
      kind: 'plan',
      headline: `Plan to leave at ${formatClock(departure, timeZone)}`,
      detail: `That is ${formatDuration(minutesAway)} from now. Monitor the journey and SetoffIQ will update this if the flight changes.`,
    };
  }

  if (minutesAway > 10) {
    return {
      kind: 'wait',
      headline: "Don't leave yet",
      detail: `Your passenger is unlikely to be ready before ${formatClock(readiness.earliest, timeZone)}. Leaving at ${formatClock(departure, timeZone)} means less time waiting at the airport.`,
    };
  }

  if (minutesAway >= -5) {
    return {
      kind: 'leave-now',
      headline: 'Leave now',
      detail: `Your journey estimate and your passenger's readiness window now line up. Aim to be at the airport for ${formatClock(readiness.earliest, timeZone)}.`,
    };
  }

  return {
    kind: 'running-late',
    headline: 'Leave as soon as you can',
    detail: `The suggested departure was ${formatDuration(-minutesAway)} ago. Your passenger may be waiting from ${formatClock(readiness.earliest, timeZone)}.`,
  };
}

export function buildDropoffAdvisory(
  now: Instant,
  departure: Instant,
  terminalArrival: TimeWindow,
  timeZone: string,
): Advisory {
  const minutesAway = minutesBetween(now, departure);

  if (minutesAway > 180) {
    return {
      kind: 'plan',
      headline: `Plan to leave at ${formatClock(departure, timeZone)}`,
      detail: `That puts your passenger at the terminal by about ${formatClock(terminalArrival.latest, timeZone)}.`,
    };
  }

  if (minutesAway > 10) {
    return {
      kind: 'wait',
      headline: `Leave at ${formatClock(departure, timeZone)}`,
      detail: `That is ${formatDuration(minutesAway)} from now, and puts your passenger at the terminal by about ${formatClock(terminalArrival.latest, timeZone)}.`,
    };
  }

  if (minutesAway >= -5) {
    return {
      kind: 'leave-now',
      headline: 'Leave now',
      detail: `Leaving now gets your passenger to the terminal by about ${formatClock(terminalArrival.latest, timeZone)}.`,
    };
  }

  return {
    kind: 'running-late',
    headline: 'Leave as soon as you can',
    detail: `The suggested departure was ${formatDuration(-minutesAway)} ago. Check your airline's bag-drop deadline before setting off.`,
  };
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours} hr`;
  return `${hours} hr ${rest} min`;
}
