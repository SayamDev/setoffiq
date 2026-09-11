import { MANCHESTER } from '../domain/airports';
import { zonedTimeToInstant } from '../domain/time';
import type { ProviderInput } from '../domain/engine';
import type {
  AirportConditions,
  FlightStatus,
  Instant,
  RoadDisruption,
  RoadDisruptionSnapshot,
  RouteResult,
  WeatherSnapshot,
} from '../domain/types';

const ZONE = MANCHESTER.timeZone;

/** A wall-clock time at Manchester on a fixed, non-peak weekday. */
export function manTime(hour: number, minute: number, day = 16, month = 9, year = 2026): Instant {
  return zonedTimeToInstant(year, month, day, hour, minute, ZONE);
}

export function okRoute(minutes: number, km = 30): ProviderInput<RouteResult> {
  return {
    value: {
      durationSeconds: minutes * 60,
      distanceMeters: km * 1000,
      trafficAware: false,
      estimatedWithoutRouting: false,
    },
    state: 'ok',
    observedAt: null,
  };
}

export const noRoute: ProviderInput<RouteResult> = {
  value: null,
  state: 'unavailable',
  observedAt: null,
};

export function weather(
  severity: WeatherSnapshot['severity'],
  validFor: Instant,
): ProviderInput<WeatherSnapshot> {
  return {
    value: {
      temperatureC: 11,
      precipitationMm: severity === 'clear' ? 0 : severity === 'moderate' ? 1.2 : 6,
      windSpeedKph: severity === 'poor' ? 55 : 14,
      windGustKph: severity === 'poor' ? 80 : null,
      visibilityM: severity === 'poor' ? 1200 : 20000,
      weatherCode: severity === 'clear' ? 1 : 61,
      description: severity === 'clear' ? 'Mainly clear' : severity === 'moderate' ? 'Light rain' : 'Heavy rain',
      severity,
      validFor,
    },
    state: 'ok',
    observedAt: validFor,
  };
}

export const noWeather: ProviderInput<WeatherSnapshot> = {
  value: null,
  state: 'unavailable',
  observedAt: null,
};

export function flight(
  overrides: Partial<FlightStatus>,
  state: ProviderInput<FlightStatus>['state'] = 'ok',
  observedAt: Instant | null = null,
): ProviderInput<FlightStatus> {
  return {
    value: {
      flightNumber: 'EK21',
      callsign: 'UAE21',
      phase: 'scheduled',
      scheduledArrival: null,
      scheduledDeparture: null,
      estimatedArrival: null,
      estimatedArrivalSource: null,
      position: null,
      observedAt,
      ...overrides,
    },
    state,
    observedAt,
  };
}

export const noFlight: ProviderInput<FlightStatus> = {
  value: null,
  state: 'unavailable',
  observedAt: null,
};

export function conditions(
  flightCategory: AirportConditions['flightCategory'],
  observedAt: Instant,
): ProviderInput<AirportConditions> {
  return {
    value: {
      icaoCode: 'EGCC',
      observedAt,
      temperatureC: 16,
      windDirectionDeg: 260,
      windSpeedKt: 6,
      visibility: flightCategory === 'LIFR' ? '0.5' : '6+',
      ceilingFt: flightCategory === 'LIFR' ? 200 : 4200,
      flightCategory,
      raw: 'METAR EGCC 110820Z 26006KT 9999 SCT009 SCT042 16/14 Q1018',
      summary: flightCategory === 'VFR' ? 'Clear and unrestricted' : 'Low cloud and reduced visibility',
    },
    state: 'ok',
    observedAt,
  };
}

export const noConditions: ProviderInput<AirportConditions> = {
  value: null,
  state: 'unavailable',
  observedAt: null,
};

/** No road source configured — the default, and the shipped behaviour. */
export const noRoadDisruption: ProviderInput<RoadDisruptionSnapshot> = {
  value: null,
  state: 'unavailable',
  observedAt: null,
};

export function roadDisruption(
  entries: Partial<RoadDisruption>[],
  observedAt: Instant,
): ProviderInput<RoadDisruptionSnapshot> {
  return {
    value: {
      generatedAt: observedAt,
      source: 'test',
      attribution: 'test',
      searchRadiusKm: 40,
      disruptions: entries.map((entry, index) => ({
        id: `d${index}`,
        road: 'M56',
        category: 'roadworks',
        description: 'Lane closure',
        distanceFromAirportKm: 6,
        startedAt: observedAt,
        expectedEndAt: null,
        active: true,
        ...entry,
      })),
    },
    state: 'ok',
    observedAt,
  };
}
