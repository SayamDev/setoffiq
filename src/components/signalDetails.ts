import type { SignalId } from '../domain/signals';
import type { RecommendationFactor } from '../domain/types';
import type { JourneyPlan } from '../services/plan';
import type { SignalDetail } from './SignalTable';

/**
 * The reasoning and the raw readings, arranged by the row they explain.
 *
 * These used to be three further sections — the factors, a bulleted repeat of
 * the same rows, and two cards restating the flight and the weather. Every
 * figure appeared four times. Here each one sits with the row it belongs to,
 * behind a disclosure.
 */
export function signalDetails(plan: JourneyPlan): Partial<Record<SignalId, SignalDetail>> {
  const recommendation = plan.recommendation;
  if (recommendation.kind === 'unavailable') return {};

  const factor = (id: string): { value?: string; detail?: string } => {
    const found = recommendation.factors.find((entry: RecommendationFactor) => entry.id === id);
    return found ? { value: found.value, detail: found.detail } : {};
  };

  const flight = plan.flight.value;
  const position = flight?.position;
  const flightFacts = [
    position ? `${position.distanceToAirportKm} km out` : null,
    position?.baroAltitudeM != null ? `${position.baroAltitudeM.toLocaleString('en-GB')} m` : null,
    position?.groundSpeedMps != null
      ? `${Math.round((position.groundSpeedMps * 3600) / 1000)} km/h`
      : null,
    flight?.callsign ?? null,
  ].filter((entry): entry is string => Boolean(entry));

  const weather = plan.weather.value;
  const weatherFacts = weather
    ? [
        `${Math.round(weather.temperatureC)}°C`,
        `${Math.round(weather.windSpeedKph)} km/h wind`,
        `${weather.precipitationMm.toFixed(1)} mm rain`,
        weather.visibilityM !== null ? `${(weather.visibilityM / 1000).toFixed(1)} km visibility` : null,
      ].filter((entry): entry is string => Boolean(entry))
    : [];

  // The time at the airport is part of getting out of it, not a row of its own.
  const mode = recommendation.factors.find((entry: RecommendationFactor) => entry.id === 'mode');

  return {
    flight: { ...factor('flight'), facts: flightFacts, note: plan.flight.message ?? undefined },
    route: { ...factor('journey'), note: plan.route.message ?? undefined },
    'journey-weather': { ...factor('weather'), facts: weatherFacts, note: plan.weather.message ?? undefined },
    processing: {
      ...factor(recommendation.kind === 'pickup' ? 'processing' : 'check-in'),
      facts: mode ? [`${mode.label}: ${mode.value}`] : [],
    },
    'airport-conditions': {},
    'road-disruption': plan.roadDisruption.value
      ? {
          facts: [
            `${plan.roadDisruption.value.disruptions.filter((entry) => entry.routeMatch === 'on-route').length} matched to this drive`,
            `${plan.roadDisruption.value.disruptions.filter((entry) => entry.routeMatch !== 'on-route').length} nearby but unconfirmed`,
          ],
          note: plan.roadDisruption.value.source.includes('tomtom')
            ? 'TomTom incident reports can include accidents, queues and roadworks. Route matching uses reported event locations; it does not measure your actual travel time.'
            : 'National Highways covers major roads near Manchester Airport. Route matching uses the reported event location; it is not a live traffic measurement. Local roads are not included.',
        }
      : {},
  };
}
