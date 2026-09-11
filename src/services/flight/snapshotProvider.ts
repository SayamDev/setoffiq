import {
  FLIGHT_MATCH_WINDOW_HOURS,
  FLIGHT_POSITIONS_UNUSABLE_AFTER_MINUTES,
  FLIGHT_SNAPSHOT_STALE_AFTER_MINUTES,
} from '../../domain/assumptions';
import type {
  FlightPhase,
  FlightProvider,
  FlightSearchInput,
  FlightStatus,
  Observed,
} from '../../domain/types';
import { readCache, writeCache } from '../cache';
import { formatAge } from '../../domain/time';
import { fetchJson } from '../http';
import { haversineKm } from '../geo';
import { estimateArrivalFromPosition, notArrivingReason, type NotArrivingReason } from './arrivalEstimate';
import { candidateCallsigns, normaliseFlightNumber } from './callsigns';
import type { FlightSnapshot, SnapshotAircraft } from './snapshotTypes';

export const FLIGHT_DATA_ATTRIBUTION = 'Aircraft data from adsb.lol (ODbL 1.0)';

const SNAPSHOT_PATH = 'data/flights/EGCC-arrivals.json';
const CACHE_KEY = 'flight-snapshot:EGCC';
const CACHE_TTL_MINUTES = 4;

function snapshotUrl(): string {
  // Vite rewrites BASE_URL for the GitHub Pages sub-path at build time.
  // `||` not `??`: an empty base would silently produce a relative URL.
  const base = import.meta.env.BASE_URL || '/';
  return `${base}${SNAPSHOT_PATH}`.replace(/([^:]\/)\/+/g, '$1');
}

function findAircraft(snapshot: FlightSnapshot, flightNumber: string): SnapshotAircraft | null {
  const wanted = new Set(candidateCallsigns(flightNumber));
  if (wanted.size === 0) return null;
  return (
    snapshot.aircraft.find((aircraft) => wanted.has(aircraft.callsign.trim().toUpperCase())) ?? null
  );
}

function elsewhereReason(reason: NotArrivingReason, aircraft: SnapshotAircraft): string {
  if (reason === 'bound-elsewhere' && aircraft.route) {
    const to = aircraft.route.to;
    return `its reported route is to ${to.city ?? to.name ?? to.icao}`;
  }
  return ELSEWHERE[reason];
}

const ELSEWHERE: Record<NotArrivingReason, string> = {
  'bound-elsewhere': 'its reported route is to another airport',
  'too-low': 'it is far too low to be approaching here, so it is most likely landing at another airfield',
  'heading-away': 'it is heading away from the airport',
  'on-ground-elsewhere': 'it is on the ground at another airfield',
};

function phaseFor(
  aircraft: SnapshotAircraft | null,
  elsewhere: NotArrivingReason | null,
  scheduled: number | null,
  now: number,
): FlightPhase {
  // On the ground somewhere else is not "landed": before a short-haul flight
  // departs, it sits at its origin inside the snapshot area, and calling that
  // landed would end monitoring before the flight had even left.
  if (aircraft && elsewhere !== 'on-ground-elsewhere') {
    return aircraft.onGround ? 'landed' : 'airborne';
  }
  if (scheduled === null) return 'unknown';
  return scheduled > now ? 'scheduled' : 'unknown';
}

/**
 * Live aircraft positions, via a static snapshot.
 *
 * A scheduled GitHub Actions job fetches aircraft near the airport from
 * adsb.lol (ODbL 1.0) about four times an hour, adds each callsign's reported
 * route from the Virtual Radar Server standing data (CC0), and publishes the
 * result as a static JSON file on the app's own origin. No visitor's browser
 * calls a flight-data service, and the request count does not grow with use.
 *
 * What this genuinely provides: whether an aircraft broadcasting the flight's
 * callsign is currently in the air near Manchester, where it is, and an
 * arrival estimate derived from that. What it does not provide: airline
 * schedules, gate information, or any status for a flight that has not taken
 * off. The UI says so rather than filling the gap with guesses.
 */
export const snapshotFlightProvider: FlightProvider = {
  id: 'flight-snapshot',
  label: 'adsb.lol position snapshot',
  attribution: FLIGHT_DATA_ATTRIBUTION,

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
        attribution: FLIGHT_DATA_ATTRIBUTION,
        message: "We couldn't check for live flight positions.",
      };
    }

    const generatedAt = Date.parse(snapshot.generatedAt);
    const observedAt = Number.isFinite(generatedAt) ? generatedAt : null;
    const ageMinutes = observedAt === null ? null : Math.round((now - observedAt) / 60_000);
    const stale = ageMinutes !== null && ageMinutes > FLIGHT_SNAPSHOT_STALE_AFTER_MINUTES;

    const tooOld =
      ageMinutes !== null && ageMinutes > FLIGHT_POSITIONS_UNUSABLE_AFTER_MINUTES;

    const found = flightNumber && !tooOld ? findAircraft(snapshot, flightNumber) : null;
    const foundEstimate = found ? estimateArrivalFromPosition(found, input.airport) : null;

    // Same number, different day: an evening flight in the air tonight is not
    // tomorrow evening's flight, however well the callsign matches.
    const scheduled = input.scheduledArrival;
    const otherDay =
      foundEstimate !== null &&
      scheduled !== null &&
      Math.abs(foundEstimate.onStand - scheduled) > FLIGHT_MATCH_WINDOW_HOURS * 3_600_000;

    const aircraft = otherDay ? null : found;
    const estimate = otherDay ? null : foundEstimate;
    const elsewhere = aircraft ? notArrivingReason(aircraft, input.airport) : null;

    const status: FlightStatus = {
      flightNumber,
      callsign: aircraft?.callsign.trim() ?? null,
      phase: phaseFor(aircraft, elsewhere, input.scheduledArrival, now),
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
            // From the position itself: an aircraft with no usable estimate is
            // still somewhere, and "0 km" would claim it is at the airport.
            distanceToAirportKm: Math.round(haversineKm(aircraft, input.airport)),
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
      attribution: FLIGHT_DATA_ATTRIBUTION,
      message: tooOld
        ? `The latest flight data is ${formatAge(ageMinutes ?? 0)} old — too old to say where the aircraft is now. Your scheduled time is being used instead.`
        : otherDay && found
          ? `An aircraft broadcasting ${found.callsign.trim()} is in the air, but it is due many hours from the scheduled time you entered, so it is most likely a different day's flight. Your scheduled time is being used instead.`
          : aircraft
            ? elsewhere
              ? `An aircraft broadcasting ${aircraft.callsign.trim()} was found, but ${elsewhereReason(elsewhere, aircraft)}, so it does not look like it is arriving at ${input.airport.name}. Your scheduled time is being used instead.`
              : null
            : flightNumber
              ? `No aircraft broadcasting ${flightNumber} was in the covered area when this snapshot was taken. Your scheduled time is being used instead.`
              : 'No flight number was given, so your scheduled time is being used.',
    };
  },
};
