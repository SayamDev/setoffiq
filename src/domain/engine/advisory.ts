import { formatClock, formatDate, minutesBetween } from '../time';
import type { Advisory, Instant, Recommendation, TimeWindow } from '../types';

/**
 * Turns "leave at 18:05" into the thing the user actually wants to be told
 * right now: wait, go, or you are behind.
 */
/**
 * How long after the last plausible moment before advice to hurry stops
 * making sense. "Leave as soon as you can — 21 hr 23 min ago" is not advice
 * anyone can act on; by then the pickup has simply passed.
 */
const PASSED_AFTER_MINUTES = 60;

function clockWithDay(instant: Instant, now: Instant, timeZone: string): string {
  const clock = formatClock(instant, timeZone);
  return formatDate(instant, timeZone) === formatDate(now, timeZone)
    ? clock
    : `${clock} on ${formatDate(instant, timeZone)}`;
}

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

  if (minutesAway > 25) {
    return {
      kind: 'wait',
      headline: "Don't leave yet",
      detail: `Your passenger is unlikely to be ready before ${formatClock(readiness.earliest, timeZone)}. Leaving at ${formatClock(departure, timeZone)} means less time waiting at the airport.`,
    };
  }

  // The window is close enough that the useful instruction is "get ready",
  // not "wait" — waiting implies there is nothing to do yet.
  if (minutesAway > 10) {
    return {
      kind: 'get-ready',
      headline: 'Get ready to leave',
      detail: `Your departure time is in ${minutesAway} minutes, at ${formatClock(departure, timeZone)}.`,
    };
  }

  if (minutesAway >= -5) {
    return {
      kind: 'leave-now',
      headline: 'Leave now',
      detail: `Your journey estimate and your passenger's readiness window now line up. Aim to be at the airport for ${formatClock(readiness.earliest, timeZone)}.`,
    };
  }

  if (minutesBetween(readiness.latest, now) > PASSED_AFTER_MINUTES) {
    return {
      kind: 'blocked',
      headline: 'This pickup time has passed',
      detail: `Your passenger was most likely ready by ${clockWithDay(readiness.latest, now, timeZone)}. If the flight is still to come, check the date and time you entered.`,
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

  if (minutesAway > 25) {
    return {
      kind: 'wait',
      headline: `Leave at ${formatClock(departure, timeZone)}`,
      detail: `That is ${formatDuration(minutesAway)} from now, and puts your passenger at the terminal by about ${formatClock(terminalArrival.latest, timeZone)}.`,
    };
  }

  if (minutesAway > 10) {
    return {
      kind: 'get-ready',
      headline: 'Get ready to leave',
      detail: `Your departure time is in ${minutesAway} minutes, at ${formatClock(departure, timeZone)}.`,
    };
  }

  if (minutesAway >= -5) {
    return {
      kind: 'leave-now',
      headline: 'Leave now',
      detail: `Leaving now gets your passenger to the terminal by about ${formatClock(terminalArrival.latest, timeZone)}.`,
    };
  }

  if (minutesBetween(terminalArrival.latest, now) > PASSED_AFTER_MINUTES) {
    return {
      kind: 'blocked',
      headline: 'This drop-off time has passed',
      detail: `Your passenger needed to be at the terminal by about ${clockWithDay(terminalArrival.latest, now, timeZone)}. If the flight is still to come, check the date and time you entered.`,
    };
  }

  return {
    kind: 'running-late',
    headline: 'Leave as soon as you can',
    detail: `The suggested departure was ${formatDuration(-minutesAway)} ago. Check your airline's bag-drop deadline before setting off.`,
  };
}

/**
 * The advice for a recommendation as of `now`, not as of when it was
 * calculated.
 *
 * A recommendation is recalculated only when monitoring checks — up to an hour
 * apart — so the advisory stored on it goes stale while the page sits open. A
 * card still saying "get ready, 12 minutes to go" twenty minutes later, or a
 * notification saying "Leave at 16:18" at 16:54, is an instruction the clock
 * has already overtaken. The departure and windows do not change between
 * checks; only the advice about them does, so it is rederived here.
 */
export function advisoryAt(recommendation: Recommendation, now: Instant, timeZone: string): Advisory {
  return recommendation.kind === 'pickup'
    ? buildPickupAdvisory(now, recommendation.recommendedDeparture, recommendation.readiness.window, timeZone)
    : buildDropoffAdvisory(now, recommendation.recommendedDeparture, recommendation.terminalArrivalWindow, timeZone);
}

/** Wording for a notification: past a departure, "Leave at 16:18" is not advice. */
export function notificationTitle(advisory: Advisory, departure: Instant, timeZone: string): string {
  return advisory.kind === 'running-late' || advisory.kind === 'leave-now' || advisory.kind === 'blocked'
    ? advisory.headline
    : `Leave at ${formatClock(departure, timeZone)}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours} hr`;
  return `${hours} hr ${rest} min`;
}
