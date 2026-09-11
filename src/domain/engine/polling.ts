import { POLLING_INTERVALS_MINUTES } from '../assumptions';
import { HOUR_MS } from '../time';
import type { FlightPhase, Instant } from '../types';

/**
 * How long to wait before checking a monitored journey again.
 *
 * Checking a flight that departs next week every thirty seconds would be both
 * useless and rude to a free public service. The interval tightens as the
 * journey approaches and stops entirely once there is nothing left to learn.
 * Returns null when polling should stop.
 */
export function nextPollDelayMinutes(
  now: Instant,
  eventTime: Instant,
  phase: FlightPhase,
): number | null {
  if (phase === 'cancelled' || phase === 'diverted') return null;

  const hoursUntil = (eventTime - now) / HOUR_MS;

  // An hour past the event there is nothing further to recalculate.
  if (hoursUntil < -1) return null;
  if (phase === 'landed' && hoursUntil < 0) return null;

  if (phase === 'airborne') return POLLING_INTERVALS_MINUTES.airborne;
  if (hoursUntil > 24) return POLLING_INTERVALS_MINUTES.moreThan24Hours;
  if (hoursUntil > 6) return POLLING_INTERVALS_MINUTES.sixToTwentyFourHours;
  if (hoursUntil > 1) return POLLING_INTERVALS_MINUTES.oneToSixHours;
  return POLLING_INTERVALS_MINUTES.withinOneHour;
}
