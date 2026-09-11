import { MANCHESTER } from '../domain/airports';
import { zonedTimeToInstant } from '../domain/time';
import type { ProviderInput } from '../domain/engine';
import type { FlightStatus, Instant, RouteResult, WeatherSnapshot } from '../domain/types';

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
