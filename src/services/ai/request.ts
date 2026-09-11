import { formatClock, minutesBetween } from '../../domain/time';
import type { AirportProfile, Recommendation } from '../../domain/types';
import type { JourneyPlan } from '../plan';
import type { ExplanationRequest } from './types';

/**
 * Build the explanation payload.
 *
 * Note what is absent: the origin postcode, its coordinates, the passenger's
 * name and the journey label. A model explaining "leave at 18:05" does not
 * need to know where the user lives, so it is never sent — the drive is
 * described purely as a duration.
 */
export function buildExplanationRequest(
  plan: JourneyPlan,
  recommendation: Recommendation,
  airport: AirportProfile,
): ExplanationRequest {
  const zone = airport.timeZone;
  const status = plan.flight.value;
  const live = status?.estimatedArrivalSource === 'live-position';
  const scheduled =
    recommendation.kind === 'pickup'
      ? recommendation.readiness.landing
      : recommendation.flightDeparture;

  const scheduledFromBooking = status?.scheduledArrival ?? status?.scheduledDeparture ?? scheduled;

  return {
    kind: recommendation.kind,
    airportName: airport.name,
    flightStatus: status?.phase ?? 'unknown',
    scheduledTime: formatClock(scheduledFromBooking, zone),
    estimatedArrival: status?.estimatedArrival ? formatClock(status.estimatedArrival, zone) : null,
    arrivalDeltaMinutes:
      status?.estimatedArrival && status.scheduledArrival
        ? minutesBetween(status.scheduledArrival, status.estimatedArrival)
        : null,
    readinessWindow:
      recommendation.kind === 'pickup'
        ? [
            formatClock(recommendation.readiness.window.earliest, zone),
            formatClock(recommendation.readiness.window.latest, zone),
          ]
        : null,
    terminalWindow:
      recommendation.kind === 'dropoff'
        ? [
            formatClock(recommendation.terminalArrivalWindow.earliest, zone),
            formatClock(recommendation.terminalArrivalWindow.latest, zone),
          ]
        : null,
    journeyMinutes: [recommendation.journey.minMinutes, recommendation.journey.maxMinutes],
    airportArrivalWindow: [
      formatClock(recommendation.airportArrivalWindow.earliest, zone),
      formatClock(recommendation.airportArrivalWindow.latest, zone),
    ],
    recommendedDeparture: formatClock(recommendation.recommendedDeparture, zone),
    weather: plan.weather.value?.description ?? 'Unavailable',
    confidence: recommendation.confidence.level,
    liveFlightData: Boolean(live),
    routed: plan.route.state !== 'unavailable' && plan.route.value !== null,
  };
}
