import type { AirportProfile, Instant } from '../../domain/types';
import { haversineKm } from '../geo';
import type { SnapshotAircraft } from './snapshotTypes';

/**
 * Assumptions used to turn an aircraft position into an arrival time.
 * These are SetoffIQ estimates, not airline or air-traffic-control figures.
 */
export const ARRIVAL_ESTIMATE = {
  /** Aircraft are vectored onto an approach rather than flying point-to-point. */
  vectoringFactor: 1.15,
  /** Touchdown to the stand, with doors open. */
  taxiMinutes: 6,
  /** Below this distance the aircraft is treated as on final approach. */
  finalApproachKm: 25,
  finalApproachMinutes: 8,
  /** Beyond this the aircraft is outside the snapshot's coverage anyway. */
  maximumUsefulKm: 600,
  /** Ground speed below this is treated as unusable. */
  minimumGroundSpeedMps: 40,
  /**
   * Climb rate above which an aircraft near the airport is departing rather
   * than arriving. A single snapshot cannot show whether the distance is
   * growing or shrinking, but a jet climbing hard a few miles out has just
   * taken off.
   */
  climbingMps: 4,
  climbOutRangeKm: 90,
} as const;

export interface ArrivalEstimate {
  /** Expected on-stand time: touchdown plus taxi. */
  onStand: Instant;
  distanceKm: number;
  minutesRemaining: number;
}

/**
 * Estimate when an airborne aircraft will be on stand.
 *
 * Deliberately simple: remaining ground distance at current ground speed, made
 * a little longer for the fact that arrivals are vectored, plus a taxi
 * allowance. It knows nothing about holding stacks, runway configuration or
 * air-traffic sequencing, which is exactly why the result feeds a *window*
 * rather than a single promised time.
 */
export function estimateArrivalFromPosition(
  aircraft: SnapshotAircraft,
  airport: AirportProfile,
): ArrivalEstimate | null {
  const distanceKm = haversineKm(
    { latitude: aircraft.latitude, longitude: aircraft.longitude },
    { latitude: airport.latitude, longitude: airport.longitude },
  );
  if (distanceKm > ARRIVAL_ESTIMATE.maximumUsefulKm) return null;

  const observedAt = aircraft.lastContact * 1000;

  if (aircraft.onGround) {
    // Already down. The remaining wait is taxi only, and only if it is at this
    // airport rather than somewhere else inside the snapshot area.
    if (distanceKm > 8) return null;
    return { onStand: observedAt + ARRIVAL_ESTIMATE.taxiMinutes * 60_000, distanceKm, minutesRemaining: ARRIVAL_ESTIMATE.taxiMinutes };
  }

  // Same callsign, opposite direction: an aircraft climbing away from the
  // airport is operating the outbound leg, not the arrival being waited for.
  const verticalRate = aircraft.verticalRateMps;
  if (
    verticalRate !== null &&
    verticalRate > ARRIVAL_ESTIMATE.climbingMps &&
    distanceKm < ARRIVAL_ESTIMATE.climbOutRangeKm
  ) {
    return null;
  }

  let minutesRemaining: number;
  if (distanceKm <= ARRIVAL_ESTIMATE.finalApproachKm) {
    minutesRemaining = ARRIVAL_ESTIMATE.finalApproachMinutes;
  } else {
    const speedMps = aircraft.groundSpeedMps ?? 0;
    if (speedMps < ARRIVAL_ESTIMATE.minimumGroundSpeedMps) return null;
    const speedKph = (speedMps * 3600) / 1000;
    minutesRemaining =
      ((distanceKm * ARRIVAL_ESTIMATE.vectoringFactor) / speedKph) * 60 +
      ARRIVAL_ESTIMATE.finalApproachMinutes;
  }

  const total = minutesRemaining + ARRIVAL_ESTIMATE.taxiMinutes;
  return {
    onStand: observedAt + Math.round(total) * 60_000,
    distanceKm,
    minutesRemaining: Math.round(total),
  };
}
