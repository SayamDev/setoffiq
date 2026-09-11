import type { WeatherSeverity } from '../../domain/types';

interface CodeDescription {
  description: string;
  severity: WeatherSeverity;
}

/**
 * WMO weather interpretation codes, as documented by Open-Meteo.
 * Severity is SetoffIQ's own judgement of how much a condition is likely to
 * slow a drive, not a meteorological classification.
 */
const CODES: Record<number, CodeDescription> = {
  0: { description: 'Clear sky', severity: 'clear' },
  1: { description: 'Mainly clear', severity: 'clear' },
  2: { description: 'Partly cloudy', severity: 'clear' },
  3: { description: 'Overcast', severity: 'clear' },
  45: { description: 'Fog', severity: 'poor' },
  48: { description: 'Freezing fog', severity: 'poor' },
  51: { description: 'Light drizzle', severity: 'moderate' },
  53: { description: 'Drizzle', severity: 'moderate' },
  55: { description: 'Heavy drizzle', severity: 'moderate' },
  56: { description: 'Freezing drizzle', severity: 'poor' },
  57: { description: 'Heavy freezing drizzle', severity: 'poor' },
  61: { description: 'Light rain', severity: 'moderate' },
  63: { description: 'Rain', severity: 'moderate' },
  65: { description: 'Heavy rain', severity: 'poor' },
  66: { description: 'Freezing rain', severity: 'poor' },
  67: { description: 'Heavy freezing rain', severity: 'poor' },
  71: { description: 'Light snow', severity: 'poor' },
  73: { description: 'Snow', severity: 'poor' },
  75: { description: 'Heavy snow', severity: 'poor' },
  77: { description: 'Snow grains', severity: 'moderate' },
  80: { description: 'Light showers', severity: 'moderate' },
  81: { description: 'Showers', severity: 'moderate' },
  82: { description: 'Violent showers', severity: 'poor' },
  85: { description: 'Snow showers', severity: 'poor' },
  86: { description: 'Heavy snow showers', severity: 'poor' },
  95: { description: 'Thunderstorm', severity: 'poor' },
  96: { description: 'Thunderstorm with hail', severity: 'poor' },
  99: { description: 'Thunderstorm with heavy hail', severity: 'poor' },
};

export function describeWeatherCode(code: number): CodeDescription {
  return CODES[code] ?? { description: 'Unknown conditions', severity: 'moderate' };
}

/**
 * Wind and visibility can make a drive harder even under a benign code, so a
 * clear-but-gale-force hour is not reported as clear.
 */
export function combineSeverity(
  codeSeverity: WeatherSeverity,
  windSpeedKph: number,
  visibilityM: number | null,
): WeatherSeverity {
  const order: WeatherSeverity[] = ['clear', 'moderate', 'poor'];
  let index = order.indexOf(codeSeverity);
  if (windSpeedKph >= 50) index = Math.max(index, 2);
  else if (windSpeedKph >= 32) index = Math.max(index, 1);
  if (visibilityM !== null) {
    if (visibilityM < 1000) index = Math.max(index, 2);
    else if (visibilityM < 4000) index = Math.max(index, 1);
  }
  return order[index] ?? 'moderate';
}
