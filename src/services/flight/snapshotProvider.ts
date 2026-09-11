import { FLIGHT_SNAPSHOT_STALE_AFTER_MINUTES } from '../../domain/assumptions';
import type {
  FlightPhase,
  FlightProvider,
  FlightSearchInput,
  FlightStatus,
  Observed,
} from '../../domain/types';
import { readCache, writeCache } from '../cache';
import { fetchJson } from '../http';
import { estimateArrivalFromPosition } from './arrivalEstimate';
import { candidateCallsigns, normaliseFlightNumber } from './callsigns';
import type { FlightSnapshot, SnapshotAircraft } from './snapshotTypes';

export const OPENSKY_ATTRIBUTION =
  'Aircraft position data from The OpenSky Network (opensky-network.org)';

const SNAPSHOT_PATH = 'data/flights/EGCC-arrivals.json';
const CACHE_KEY = 'flight-snapshot:EGCC';
const CACHE_TTL_MINUTES = 4;

function snapshotUrl(): string {
  // Vite rewrites BASE_URL for the GitHub Pages sub-path at build time.
  const base = import.meta.env.BASE_URL ?? '/';
  return `${base}${SNAPSHOT_PATH}`.replace(/([^:]\/)\/+/g, '$1');
}

function findAircraft(snapshot: FlightSnapshot, flightNumber: string): SnapshotAircraft | null {
  const wanted = new Set(candidateCallsigns(flightNumber));
  if (wanted.size === 0) return null;
  return (
    snapshot.aircraft.find((aircraft) => wanted.has(aircraft.callsign.trim().toUpperCase())) ?? null
  );
}

function phaseFor(aircraft: SnapshotAircraft | null, scheduled: number | null, now: number): FlightPhase {
  if (aircraft) return aircraft.onGround ? 'landed' : 'airborne';
  if (scheduled === null) return 'unknown';
  return scheduled > now ? 'scheduled' : 'unknown';
}

/**
 * Live aircraft positions, via a static snapshot.
 *
 * The OpenSky Network's REST API sends
 * `access-control-allow-origin: https://opensky-network.org`, so a browser on
 * another origin cannot call it — verified 10 September 2026. Rather than
 * proxying through a server (which would mean infrastructure, and a bill), a
 * scheduled GitHub Actions job calls OpenSky anonymously, well inside its
 * documented 400-credit daily allowance, and commits the result as a static
 * JSON file served from the same origin as the app.
 *
 * What this genuinely provides: whether an aircraft broadcasting the flight's
 * callsign is currently in the air near Manchester, where it is, and an
 * arrival estimate derived from that. What it does not provide: airline
 * schedules, gate information, or any status for a flight that has not taken
 * off. The UI says so rather than filling the gap with guesses.
 */
export const snapshotFlightProvider: FlightProvider = {
  id: 'flight-snapshot',
  label: 'OpenSky position snapshot',
  attribution: OPENSKY_ATTRIBUTION,

  async getFlightStatus(input: FlightSearchInput, signal): Promise<Observed<FlightStatus>> {
    const now = Date.now();
    const flightNumber = input.flightNumber ? normaliseFlightNumber(input.flightNumber) : null;

    const cached = readCache<FlightSnapshot>(CACHE_KEY, CACHE_TTL_MINUTES, now);
    const useCache = cached?.fresh === true && input.forceRefresh !== true;
    let snapshot = useCache ? cached.value : null;
    let fetchedAt = useCache ? cached.storedAt : null;

    if (!snapshot) {
      try {
        snapshot = await fetchJson<FlightSnapshot>(snapshotUrl(), {
          provider: 'flight-snapshot',
          endpoint: 'arrivals',
          signal,
        });
        fetchedAt = now;
        writeCache(CACHE_KEY, snapshot, now);
      } catch {
        if (cached) {
          snapshot = cached.value;
          fetchedAt = cached.storedAt;
        }
      }
    }

    if (!snapshot) {
      return {
        state: 'unavailable',
        value: null,
        fetchedAt: null,
        observedAt: null,
        provider: 'flight-snapshot',
        attribution: OPENSKY_ATTRIBUTION,
        message: "We couldn't check for live flight positions.",
      };
    }

    const generatedAt = Date.parse(snapshot.generatedAt);
    const observedAt = Number.isFinite(generatedAt) ? generatedAt : null;
    const ageMinutes = observedAt === null ? null : Math.round((now - observedAt) / 60_000);
    const stale = ageMinutes !== null && ageMinutes > FLIGHT_SNAPSHOT_STALE_AFTER_MINUTES;

    const aircraft = flightNumber ? findAircraft(snapshot, flightNumber) : null;
    const estimate = aircraft ? estimateArrivalFromPosition(aircraft, input.airport) : null;

    const status: FlightStatus = {
      flightNumber,
      callsign: aircraft?.callsign.trim() ?? null,
      phase: phaseFor(aircraft, input.scheduledArrival, now),
      scheduledArrival: input.scheduledArrival,
      scheduledDeparture: input.scheduledDeparture,
      estimatedArrival: estimate ? estimate.onStand : input.scheduledArrival,
      estimatedArrivalSource: estimate ? 'live-position' : 'user-schedule',
      position: aircraft
        ? {
            latitude: aircraft.latitude,
            longitude: aircraft.longitude,
            baroAltitudeM: aircraft.baroAltitudeM,
            geoAltitudeM: aircraft.geoAltitudeM,
            groundSpeedMps: aircraft.groundSpeedMps,
            verticalRateMps: aircraft.verticalRateMps,
            onGround: aircraft.onGround,
            distanceToAirportKm: Math.round(estimate?.distanceKm ?? 0),
          }
        : null,
      observedAt: aircraft ? aircraft.lastContact * 1000 : observedAt,
    };

    return {
      state: stale ? 'stale' : 'ok',
      value: status,
      fetchedAt,
      observedAt,
      provider: 'flight-snapshot',
      attribution: OPENSKY_ATTRIBUTION,
      message: aircraft
        ? null
        : flightNumber
          ? `No aircraft broadcasting ${flightNumber} was in the covered area when this snapshot was taken. Your scheduled time is being used instead.`
          : 'No flight number was given, so your scheduled time is being used.',
    };
  },
};
