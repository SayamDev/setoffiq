import { CONFIDENCE_THRESHOLDS, FLIGHT_SNAPSHOT_STALE_AFTER_MINUTES } from '../assumptions';
import { HOUR_MS, minutesBetween } from '../time';
import type { ConfidenceAssessment, ConfidenceReason, Instant } from '../types';
import type { JourneyEngineInput } from './inputs';
import type { JourneyEstimate } from './journeyWindow';

/**
 * A transparent scoring heuristic, not a calibrated probability.
 *
 * It starts at 100 and subtracts for each thing SetoffIQ does not know. The
 * number is only meaningful when comparing one SetoffIQ recommendation with
 * another, and the UI says so.
 */
export function assessConfidence(
  input: JourneyEngineInput,
  journey: JourneyEstimate,
  eventTime: Instant,
): ConfidenceAssessment {
  const reasons: ConfidenceReason[] = [];
  let score = 100;

  const deduct = (points: number, label: string, detail: string): void => {
    score -= points;
    reasons.push({ label, detail, impact: 'negative' });
  };
  const credit = (label: string, detail: string): void => {
    reasons.push({ label, detail, impact: 'positive' });
  };

  const flight = input.flight.value;

  // A drop-off is planned around a departure time the user already has from
  // their booking. Not having seen the aircraft says nothing about how good
  // that plan is, so tracking gaps must not drag its confidence down.
  if (input.journeyKind === 'pickup') {
    if (input.flight.state === 'unavailable' || !flight) {
      deduct(22, 'No live flight data', 'Working from the scheduled arrival time you entered.');
    } else if (flight.position) {
      credit(
        'Live aircraft position',
        'The aircraft was seen in the air and its arrival was estimated from that.',
      );
    } else {
      deduct(
        18,
        'No live aircraft position',
        'The aircraft has not been seen in the covered area, so the scheduled time is being used.',
      );
    }

    if (input.flight.observedAt !== null) {
      // input.now, never the wall clock: the engine must stay deterministic.
      const ageMinutes = -minutesBetween(input.now, input.flight.observedAt);
      if (ageMinutes > FLIGHT_SNAPSHOT_STALE_AFTER_MINUTES) {
        deduct(
          15,
          'Flight data is stale',
          `The last flight observation is ${describeAge(ageMinutes)} old.`,
        );
      }
    }

    if (flight?.phase === 'unknown') {
      deduct(
        10,
        'Flight status unknown',
        'We could not establish whether the flight is scheduled, airborne or landed.',
      );
    }
  } else {
    credit(
      'Departure time from your booking',
      'A drop-off is planned around the time on the ticket, which does not depend on tracking the aircraft.',
    );
  }

  if (!journey.routed) {
    deduct(28, 'No routing available', 'The journey time is estimated from straight-line distance.');
  } else {
    credit('Journey routed', 'The drive was routed over the real road network.');
  }

  if (input.weather.state === 'unavailable') {
    deduct(8, 'No weather data', 'Weather could not be checked, so it is not reflected in the range.');
  } else {
    credit('Weather checked', 'Conditions around the journey time were taken into account.');
  }

  const hoursAhead = (eventTime - input.now) / HOUR_MS;
  if (hoursAhead > 24) {
    deduct(12, 'More than a day ahead', 'Flight and traffic conditions will change before then.');
  }

  const spread = journey.range.maxMinutes - journey.range.minMinutes;
  if (journey.baseMinutes > 0 && spread / journey.baseMinutes > 0.3) {
    deduct(8, 'Wide journey range', 'Conditions make the drive time harder to pin down than usual.');
  }

  const boundedScore = Math.max(0, Math.min(100, score));
  const level =
    boundedScore >= CONFIDENCE_THRESHOLDS.high
      ? 'high'
      : boundedScore >= CONFIDENCE_THRESHOLDS.medium
        ? 'medium'
        : 'low';

  return { level, score: boundedScore, reasons };
}

/** "2 hours", "18 minutes" — a raw minute count in the thousands reads as a bug. */
function describeAge(minutes: number): string {
  if (minutes < 90) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}
