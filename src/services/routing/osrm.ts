import { ROUTE_CACHE_TTL_MINUTES } from '../../domain/assumptions';
import type { GeoPoint, Observed, RouteResult, RoutingProvider } from '../../domain/types';
import { readCache, writeCache } from '../cache';
import { fetchJson } from '../http';
import { geocodePostcode, POSTCODES_ATTRIBUTION } from './postcodes';

/**
 * Public OSRM instances, tried in order. Both are open, keyless and have no
 * billing mechanism. The first is the FOSSGIS-operated instance that
 * openstreetmap.org itself uses. Verified 10 September 2026.
 */
const HOSTS = [
  'https://routing.openstreetmap.de/routed-car',
  'https://router.project-osrm.org',
];

export const OSRM_ATTRIBUTION =
  'Routing by OSRM, using map data from OpenStreetMap contributors (ODbL)';

interface OsrmResponse {
  code: string;
  routes?: { duration: number; distance: number; geometry?: { type: string; coordinates: number[][] } }[];
}

function cacheKey(origin: GeoPoint, destination: GeoPoint): string {
  const round = (value: number): string => value.toFixed(4);
  return `route:${round(origin.latitude)},${round(origin.longitude)}->${round(destination.latitude)},${round(destination.longitude)}:car`;
}

async function routeVia(
  host: string,
  origin: GeoPoint,
  destination: GeoPoint,
  signal?: AbortSignal,
): Promise<RouteResult> {
  const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const payload = await fetchJson<OsrmResponse>(
    `${host}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&alternatives=false&steps=false`,
    // No per-host retry: the second public instance is the retry. Retrying
    // each host as well would make a total outage take long enough that the
    // user is left staring at a spinner.
    { provider: 'osrm', endpoint: 'route', retries: 0, signal },
  );
  const route = payload.routes?.[0];
  if (payload.code !== 'Ok' || !route) throw new Error(`osrm code ${payload.code}`);
  return {
    durationSeconds: route.duration,
    distanceMeters: route.distance,
    geometry: route.geometry?.type === 'LineString'
      ? route.geometry.coordinates
          .filter((point) => point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]))
          .map((point) => ({ latitude: point[1]!, longitude: point[0]! }))
      : undefined,
    trafficAware: false,
    estimatedWithoutRouting: false,
  };
}

/**
 * OSRM models free-flow driving times over the OpenStreetMap road network.
 * It has no live traffic, and nothing in SetoffIQ claims otherwise — the
 * prediction engine widens the upper bound of every journey to account for it.
 */
export const osrmRoutingProvider: RoutingProvider = {
  id: 'osrm',
  label: 'OSRM / OpenStreetMap',
  attribution: OSRM_ATTRIBUTION,

  async geocode(input, signal) {
    return geocodePostcode(input, signal);
  },

  async calculateRoute({ origin, destination }, signal): Promise<Observed<RouteResult>> {
    const now = Date.now();
    const key = cacheKey(origin, destination);
    const cached = readCache<RouteResult>(key, ROUTE_CACHE_TTL_MINUTES, now);
    if (cached?.fresh) {
      return {
        state: 'ok',
        value: cached.value,
        fetchedAt: cached.storedAt,
        observedAt: null,
        provider: 'osrm',
        attribution: OSRM_ATTRIBUTION,
        message: null,
      };
    }

    for (const host of HOSTS) {
      try {
        const route = await routeVia(host, origin, destination, signal);
        writeCache(key, route, now);
        return {
          state: 'ok',
          value: route,
          fetchedAt: now,
          observedAt: null,
          provider: 'osrm',
          attribution: OSRM_ATTRIBUTION,
          message: null,
        };
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        // Try the next public instance before giving up.
      }
    }

    if (cached) {
      return {
        state: 'stale',
        value: cached.value,
        fetchedAt: cached.storedAt,
        observedAt: null,
        provider: 'osrm',
        attribution: OSRM_ATTRIBUTION,
        message: `Using a journey estimate saved ${cached.ageMinutes} minutes ago.`,
      };
    }

    return {
      state: 'unavailable',
      value: null,
      fetchedAt: null,
      observedAt: null,
      provider: 'osrm',
      attribution: OSRM_ATTRIBUTION,
      message: "We couldn't route your drive, so the journey time is estimated from distance.",
    };
  },
};

export { POSTCODES_ATTRIBUTION };
