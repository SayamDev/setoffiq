import { FLIGHT_SNAPSHOT_STALE_AFTER_MINUTES } from '../../domain/assumptions';
import type { AirportProfile, Instant } from '../../domain/types';
import { readCache } from '../cache';
import { fetchJson } from '../http';
import { dataUrl } from './dataUrl';
import { estimateArrivalFromPosition, notArrivingReason } from './arrivalEstimate';
import { callsignToFlightNumber } from './callsigns';
import { isCargoOperator, operatorName } from './operators';
import type { FlightSnapshot } from './snapshotTypes';

export interface InboundAircraft {
  callsign: string;
  /** The equivalent flight number, where one can honestly be derived. */
  flightNumber: string | null;
  /** Operator name from the callsign's ICAO designator, where it is known. */
  airline: string | null;
  /** Where it is reported to be coming from, when a route is known. */
  from: string | null;
  /** ISO country code of that origin, when known. */
  fromCountry: string | null;
  distanceKm: number;
  /** Estimated on-stand time, from position and ground speed. */
  estimatedArrival: Instant | null;
}

const SNAPSHOT_PATH = 'data/flights/EGCC-arrivals.json';
const CACHE_KEY = 'flight-snapshot:EGCC';

/**
 * Thrown when the snapshot is too old to describe what is in the air now. The
 * picker says "in the air near Manchester now", so a stale list would be a
 * false statement, not a degraded one.
 */
export class SnapshotTooOldError extends Error {
  constructor(readonly ageMinutes: number) {
    super(`Flight snapshot is ${ageMinutes} minutes old`);
    this.name = 'SnapshotTooOldError';
  }
}

/**
 * The snapshot's full circle. Far-out aircraft only reach the snapshot when
 * their reported route is to or from here, so the height, heading and route
 * checks — not the radius — decide what is arriving.
 */
const INBOUND_RADIUS_KM = 470;

/** Enough to cover a busy arrival bank without becoming a wall of rows. */
const MAX_LISTED = 20;

/**
 * Aircraft that look like they are arriving, from the snapshot the app already
 * publishes.
 *
 * This is an assist, not a schedule. It can only show aircraft already in the
 * air, so it is useless for a flight landing tomorrow — and some airlines
 * broadcast callsigns that do not correspond to any ticket. Both limits are
 * stated in the interface rather than papered over.
 */
export async function listInboundAircraft(
  airport: AirportProfile,
  signal?: AbortSignal,
  options: { forceRefresh?: boolean } = {},
): Promise<InboundAircraft[]> {
  const now = Date.now();
  const cached = readCache<FlightSnapshot>(CACHE_KEY, 4, now);

  let snapshot = cached?.fresh && !options.forceRefresh ? cached.value : null;
  if (!snapshot) {
    try {
      snapshot = await fetchJson<FlightSnapshot>(dataUrl(SNAPSHOT_PATH, options.forceRefresh), {
        provider: 'flight-snapshot',
        endpoint: 'inbound',
        signal,
        // Someone is waiting on this list. One retry, then fall back to what
        // is already in hand rather than spending seconds on a dead network.
        retries: 1,
      });
    } catch (error) {
      // A refresh that fails leaves the last snapshot in place; its age is
      // checked below like any other, so nothing stale is passed off as live.
      if (!cached) throw error;
      snapshot = cached.value;
    }
  }

  const generatedAt = Date.parse(snapshot.generatedAt);
  const ageMinutes = Number.isFinite(generatedAt) ? Math.round((now - generatedAt) / 60_000) : null;
  if (ageMinutes === null || ageMinutes > FLIGHT_SNAPSHOT_STALE_AFTER_MINUTES) {
    throw new SnapshotTooOldError(ageMinutes ?? Number.POSITIVE_INFINITY);
  }

  const results: InboundAircraft[] = [];

  for (const aircraft of snapshot.aircraft) {
    if (aircraft.onGround) continue;
    // Climbing away is a departure; level at cruise a long way out is likely
    // an overflight. Only descending traffic is plausibly arriving here.
    if (aircraft.verticalRateMps !== null && aircraft.verticalRateMps > 0) continue;

    // Descending is not the same as descending *here*. Aircraft bound for
    // Liverpool, Leeds or Birmingham pass inside this radius too.
    if (notArrivingReason(aircraft, airport)) continue;

    const estimate = estimateArrivalFromPosition(aircraft, airport);
    if (!estimate || estimate.distanceKm > INBOUND_RADIUS_KM) continue;

    const callsign = aircraft.callsign.trim().toUpperCase();
    // Airline callsigns are a three-letter designator and a number; anything
    // else is most likely general aviation and not what anyone is collecting.
    if (!/^[A-Z]{3}\d/.test(callsign)) continue;
    // Freighters: nobody is collected from them.
    if (isCargoOperator(callsign)) continue;

    results.push({
      callsign,
      flightNumber: callsignToFlightNumber(callsign),
      airline: operatorName(callsign),
      from: aircraft.route ? (aircraft.route.from.city ?? aircraft.route.from.name ?? aircraft.route.from.icao) : null,
      fromCountry: aircraft.route?.from.country ?? null,
      distanceKm: Math.round(estimate.distanceKm),
      estimatedArrival: estimate.onStand,
    });
  }

  return results.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, MAX_LISTED);
}
