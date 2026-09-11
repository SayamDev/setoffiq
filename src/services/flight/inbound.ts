import { FLIGHT_SNAPSHOT_STALE_AFTER_MINUTES } from '../../domain/assumptions';
import type { AirportProfile, Instant } from '../../domain/types';
import { readCache } from '../cache';
import { fetchJson } from '../http';
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

/** Beyond this an aircraft is probably passing overhead rather than arriving. */
const INBOUND_RADIUS_KM = 200;

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
): Promise<InboundAircraft[]> {
  const now = Date.now();
  const cached = readCache<FlightSnapshot>(CACHE_KEY, 4, now);

  let snapshot = cached?.fresh ? cached.value : null;
  if (!snapshot) {
    const base = import.meta.env.BASE_URL || '/';
    snapshot = await fetchJson<FlightSnapshot>(
      `${base}${SNAPSHOT_PATH}`.replace(/([^:]\/)\/+/g, '$1'),
      { provider: 'flight-snapshot', endpoint: 'inbound', signal },
    );
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
      distanceKm: Math.round(estimate.distanceKm),
      estimatedArrival: estimate.onStand,
    });
  }

  return results.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 12);
}
