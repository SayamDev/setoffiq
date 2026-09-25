import type { ReadinessProgress, ReadinessStage } from '../signals';
import { minutesBetween } from '../time';
import type { FlightStatus, Instant, MinuteRange } from '../types';

/** Inside this distance an arrival is on approach rather than merely airborne. */
const APPROACHING_KM = 80;

/**
 * Work out how far along the passenger is.
 *
 * A landed flight is not a ready passenger — that gap is the entire product —
 * so the stages past `landed` are inferred from elapsed time against the
 * processing assumptions, and flagged as inferred rather than observed.
 */
export function assessReadinessStage(
  flight: FlightStatus | null,
  landing: Instant,
  processing: MinuteRange,
  now: Instant,
): ReadinessProgress {
  if (!flight || flight.phase === 'unknown') {
    return {
      stage: 'unknown',
      observed: false,
      detail: 'No live information for this flight, so its progress is not being tracked.',
    };
  }

  if (flight.phase === 'cancelled' || flight.phase === 'diverted') {
    return {
      stage: 'unknown',
      observed: true,
      detail:
        flight.phase === 'cancelled'
          ? 'The flight is showing as cancelled.'
          : 'The flight has been diverted away from this airport.',
    };
  }

  const minutesSinceLanding = minutesBetween(landing, now);

  if (flight.phase === 'landed' || minutesSinceLanding >= 0) {
    if (minutesSinceLanding >= processing.maxMinutes) {
      return {
        stage: 'ready',
        observed: false,
        detail: `Past the far end of the processing estimate — your passenger should be out.`,
      };
    }
    if (minutesSinceLanding >= processing.minMinutes) {
      return {
        stage: 'ready',
        observed: false,
        detail: 'Inside the window when your passenger could come out at any point.',
      };
    }
    return {
      stage: 'disembarking',
      observed: flight.phase === 'landed',
      detail:
        flight.phase === 'landed'
          ? `On the ground ${minutesSinceLanding} min ago. Still getting off and through the airport.`
          : 'Expected on the ground, and now working through the airport.',
    };
  }

  const distanceKm = flight.position?.distanceToAirportKm ?? null;
  if (flight.position && distanceKm !== null && distanceKm <= APPROACHING_KM) {
    return {
      stage: 'approaching',
      observed: true,
      detail: `Seen ${distanceKm} km out and inbound.`,
    };
  }

  if (flight.phase === 'airborne') {
    return {
      stage: 'airborne',
      observed: true,
      detail: distanceKm === null ? 'In the air.' : `Seen in the air, ${distanceKm} km out.`,
    };
  }

  return {
    stage: 'scheduled',
    observed: false,
    detail: 'Not yet seen in the air. Working from the scheduled time you entered.',
  };
}

export function stageLabel(stage: ReadinessStage): string {
  switch (stage) {
    case 'scheduled':
      return 'Scheduled';
    case 'airborne':
      return 'Airborne';
    case 'approaching':
      return 'Approaching';
    case 'landed':
      return 'Landed';
    case 'disembarking':
      return 'Getting through the airport';
    case 'ready':
      return 'Could be ready';
    case 'unknown':
      return 'Not tracked';
  }
}
