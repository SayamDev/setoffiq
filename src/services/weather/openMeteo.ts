import { WEATHER_CACHE_TTL_MINUTES } from '../../domain/assumptions';
import type { GeoPoint, Instant, Observed, WeatherProvider, WeatherSnapshot } from '../../domain/types';
import { readCache, writeCache } from '../cache';
import { fetchJson } from '../http';
import { combineSeverity, describeWeatherCode } from './weatherCodes';

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

export const OPEN_METEO_ATTRIBUTION = 'Weather data by Open-Meteo.com (CC BY 4.0)';

interface OpenMeteoResponse {
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    precipitation?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    wind_gusts_10m?: (number | null)[];
    visibility?: (number | null)[];
    weather_code?: (number | null)[];
  };
}

/** The hour a moment falls into, in UTC, as Open-Meteo's `time` format. */
function hourKey(at: Instant): string {
  return new Date(Math.floor(at / 3_600_000) * 3_600_000).toISOString().slice(0, 13);
}

function buildUrl(point: GeoPoint, at: Instant): string {
  const day = new Date(at).toISOString().slice(0, 10);
  const parameters = new URLSearchParams({
    latitude: point.latitude.toFixed(3),
    longitude: point.longitude.toFixed(3),
    hourly: 'temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m,visibility,weather_code',
    timezone: 'UTC',
    start_date: day,
    end_date: day,
  });
  return `${ENDPOINT}?${parameters.toString()}`;
}

function toSnapshot(payload: OpenMeteoResponse, at: Instant): WeatherSnapshot | null {
  const hourly = payload.hourly;
  const times = hourly?.time;
  if (!hourly || !times?.length) return null;

  const wanted = hourKey(at);
  let index = times.findIndex((value) => value.startsWith(wanted));
  if (index === -1) index = 0;

  const read = (series: (number | null)[] | undefined): number | null => {
    const value = series?.[index];
    return typeof value === 'number' ? value : null;
  };

  const code = read(hourly.weather_code) ?? 0;
  const windSpeedKph = read(hourly.wind_speed_10m) ?? 0;
  const visibilityM = read(hourly.visibility);
  const { description, severity } = describeWeatherCode(code);

  return {
    temperatureC: read(hourly.temperature_2m) ?? 0,
    precipitationMm: read(hourly.precipitation) ?? 0,
    windSpeedKph,
    windGustKph: read(hourly.wind_gusts_10m),
    visibilityM,
    weatherCode: code,
    description,
    severity: combineSeverity(severity, windSpeedKph, visibilityM),
    validFor: at,
  };
}

/**
 * Open-Meteo's free API: no key, no billing, documented limits of 600 calls a
 * minute and 10,000 a day, for non-commercial use, under CC BY 4.0.
 * Verified 10 September 2026 — see DATA-SOURCES.md.
 *
 * SetoffIQ requests one day of hourly data for one point and caches it, so a
 * monitored journey costs a handful of requests over its whole lifetime.
 */
export const openMeteoProvider: WeatherProvider = {
  id: 'open-meteo',
  label: 'Open-Meteo',
  attribution: OPEN_METEO_ATTRIBUTION,

  async getWeather(point, at, signal): Promise<Observed<WeatherSnapshot>> {
    const now = Date.now();
    const key = `weather:${point.latitude.toFixed(2)},${point.longitude.toFixed(2)}:${hourKey(at)}`;
    const cached = readCache<WeatherSnapshot>(key, WEATHER_CACHE_TTL_MINUTES, now);
    if (cached?.fresh) {
      return {
        state: 'ok',
        value: cached.value,
        fetchedAt: cached.storedAt,
        observedAt: cached.value.validFor,
        provider: 'open-meteo',
        attribution: OPEN_METEO_ATTRIBUTION,
        message: null,
      };
    }

    try {
      const payload = await fetchJson<OpenMeteoResponse>(buildUrl(point, at), {
        provider: 'open-meteo',
        endpoint: 'forecast',
        signal,
      });
      const snapshot = toSnapshot(payload, at);
      if (!snapshot) throw new Error('no hourly data');
      writeCache(key, snapshot, now);
      return {
        state: 'ok',
        value: snapshot,
        fetchedAt: now,
        observedAt: snapshot.validFor,
        provider: 'open-meteo',
        attribution: OPEN_METEO_ATTRIBUTION,
        message: null,
      };
    } catch {
      if (cached) {
        return {
          state: 'stale',
          value: cached.value,
          fetchedAt: cached.storedAt,
          observedAt: cached.value.validFor,
          provider: 'open-meteo',
          attribution: OPEN_METEO_ATTRIBUTION,
          message: `Showing weather saved ${cached.ageMinutes} minutes ago.`,
        };
      }
      return {
        state: 'unavailable',
        value: null,
        fetchedAt: null,
        observedAt: null,
        provider: 'open-meteo',
        attribution: OPEN_METEO_ATTRIBUTION,
        message: "We couldn't check the weather for this journey.",
      };
    }
  },
};
