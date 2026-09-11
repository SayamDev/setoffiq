import { DEFAULT_NOTIFICATION_THRESHOLD_MINUTES } from '../assumptions';
import { minutesBetween } from '../time';
import type { FlightPhase, Instant, Recommendation, RecommendationVersion } from '../types';

export interface RecommendationChange {
  /** True when the change is worth interrupting the user for. */
  meaningful: boolean;
  departureDeltaMinutes: number;
  phaseChanged: boolean;
  reason: string;
}

/**
 * Decides whether a recalculation is worth showing or notifying about.
 *
 * A departure time that wanders by a minute is noise. A ten-minute move, or a
 * flight going from scheduled to airborne to landed, is not.
 */
export function compareRecommendations(
  previous: RecommendationVersion,
  next: Recommendation,
  nextPhase: FlightPhase,
  thresholdMinutes: number = DEFAULT_NOTIFICATION_THRESHOLD_MINUTES,
): RecommendationChange {
  const departureDeltaMinutes = minutesBetween(previous.departure, next.recommendedDeparture);
  const phaseChanged = previous.flightPhase !== nextPhase;
  const movedEnough = Math.abs(departureDeltaMinutes) >= thresholdMinutes;

  return {
    meaningful: movedEnough || phaseChanged,
    departureDeltaMinutes,
    phaseChanged,
    reason: describe(departureDeltaMinutes, phaseChanged, previous.flightPhase, nextPhase),
  };
}

function describe(
  deltaMinutes: number,
  phaseChanged: boolean,
  from: FlightPhase,
  to: FlightPhase,
): string {
  const parts: string[] = [];
  if (phaseChanged) parts.push(`The flight went from ${phaseWording(from)} to ${phaseWording(to)}.`);
  if (deltaMinutes > 0) {
    parts.push(`Your departure time moved ${deltaMinutes} minutes later.`);
  } else if (deltaMinutes < 0) {
    parts.push(`Your departure time moved ${Math.abs(deltaMinutes)} minutes earlier.`);
  } else if (!phaseChanged) {
    parts.push('Nothing meaningful changed.');
  }
  return parts.join(' ');
}

function phaseWording(phase: FlightPhase): string {
  switch (phase) {
    case 'scheduled':
      return 'scheduled';
    case 'airborne':
      return 'airborne';
    case 'landed':
      return 'landed';
    case 'cancelled':
      return 'cancelled';
    case 'diverted':
      return 'diverted';
    case 'unknown':
      return 'an unknown status';
  }
}

export function toVersion(
  recommendation: Recommendation,
  phase: FlightPhase,
  observedAt: Instant | null,
  reason: string | null,
  id: string,
): RecommendationVersion {
  return {
    id,
    createdAt: recommendation.computedAt,
    departure: recommendation.recommendedDeparture,
    confidence: recommendation.confidence.level,
    reason,
    flightPhase: phase,
    dataObservedAt: observedAt,
  };
}
