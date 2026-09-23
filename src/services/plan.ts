import { DEFAULT_AIRPORT, findAirport, routingDestination } from '../domain/airports';
import { calculateDropoffRecommendation, calculatePickupRecommendation } from '../domain/engine';
import type { ProviderInput } from '../domain/engine';
import type {
  AirportConditions,
  FlightStatus,
  RoadDisruptionSnapshot,
  JourneyInput,
  Observed,
  RecommendationResult,
  RouteResult,
  WeatherSnapshot,
} from '../domain/types';
import { metarConditionsProvider } from './conditions';
import { snapshotFlightProvider } from './flight';
import { findScenario, scenarioFlightStatus } from './flight/scenarios';
import { haversineKm } from './geo';
import { roadDisruptionProvider } from './roads';
import { matchDisruptionsToRoute } from './roads/routeMatch';
import { osrmRoutingProvider } from './routing';
import { openMeteoProvider } from './weather';

export interface JourneyPlan {
  recommendation: RecommendationResult;
  flight: Observed<FlightStatus>;
  route: Observed<RouteResult>;
  /** Forecast along the drive. */
  weather: Observed<WeatherSnapshot>;
  /** Observed at the aerodrome. A different question from the forecast. */
  airportConditions: Observed<AirportConditions>;
  /** Absent unless a key is configured — see DATA-SOURCES.md. */
  roadDisruption: Observed<RoadDisruptionSnapshot>;
  computedAt: number;
}

function toProviderInput<T>(observed: Observed<T>): ProviderInput<T> {
  return {
    value: observed.value,
    state: observed.state,
    observedAt: observed.observedAt,
    fetchedAt: observed.fetchedAt,
  };
}

/**
 * Gather what each provider can tell us, then hand it to the engine.
 *
 * Every provider is awaited independently and every failure is contained: a
 * weather outage must not stop a recommendation, and a routing outage must not
 * hide the flight information. Nothing here decides a time — that is entirely
 * the engine's job.
 */
export async function planJourney(
  input: JourneyInput,
  now: number = Date.now(),
  signal?: AbortSignal,
  options: { forceRefresh?: boolean } = {},
): Promise<JourneyPlan> {
  const airport = findAirport(input.airportIata) ?? DEFAULT_AIRPORT;
  // Routing goes to the terminal approach; weather is measured at the airport.
  const destination = routingDestination(airport, input.terminalCode);
  const airportPoint = {
    latitude: airport.latitude,
    longitude: airport.longitude,
    label: airport.name,
  };

  const scenario = input.scenarioId ? findScenario(input.scenarioId) : null;

  const flightPromise: Promise<Observed<FlightStatus>> = scenario
    ? Promise.resolve(
        scenarioFlightStatus(
          scenario,
          input.flightNumber,
          input.kind === 'pickup' ? input.scheduledTime : input.scheduledTime,
          input.kind === 'dropoff' ? input.scheduledTime : null,
          now,
        ),
      )
    : snapshotFlightProvider.getFlightStatus(
        {
          airport,
          flightNumber: input.flightNumber,
          scheduledArrival: input.kind === 'pickup' ? input.scheduledTime : null,
          scheduledDeparture: input.kind === 'dropoff' ? input.scheduledTime : null,
          forceRefresh: options.forceRefresh === true,
        },
        signal,
      );

  const [flight, route, weather, airportConditions, roadDisruption] = await Promise.all([
    flightPromise,
    osrmRoutingProvider.calculateRoute({ origin: input.origin, destination }, signal),
    openMeteoProvider.getWeather(airportPoint, input.scheduledTime, signal),
    metarConditionsProvider.getConditions(airport, signal),
    roadDisruptionProvider.getDisruption(airport, signal),
  ]);

  const matchedRoadDisruption = roadDisruption.value
    ? {
        ...roadDisruption,
        value: matchDisruptionsToRoute(roadDisruption.value, route.value),
      }
    : roadDisruption;

  const distanceKm = haversineKm(input.origin, destination);
  const shared = {
    now,
    journeyKind: input.kind,
    airport,
    passengerRoute: input.passengerRoute,
    distanceKm,
    flight: toProviderInput(flight),
    route: toProviderInput(route),
    weather: toProviderInput(weather),
    airportConditions: toProviderInput(airportConditions),
    roadDisruption: toProviderInput(matchedRoadDisruption),
  };

  const recommendation =
    input.kind === 'pickup'
      ? calculatePickupRecommendation({
          ...shared,
          scheduledArrival: input.scheduledTime,
          mode: input.pickupMode ?? 'quick-pickup',
        })
      : calculateDropoffRecommendation({
          ...shared,
          scheduledDeparture: input.scheduledTime,
          mode: input.dropoffMode ?? 'drop-off',
        });

  return {
    recommendation,
    flight,
    route,
    weather,
    airportConditions,
    roadDisruption: matchedRoadDisruption,
    computedAt: now,
  };
}
