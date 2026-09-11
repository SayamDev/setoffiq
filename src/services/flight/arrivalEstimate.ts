import type { AirportProfile, Instant } from '../../domain/types';
import { bearingDeg, haversineKm } from '../geo';
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
  /** Approach speeds are lower than cruise, so the cruise floor is too strict. */
  minimumApproachSpeedMps: 25,
  /** Even on short final there is a runway roll before the taxi begins. */
  minimumApproachMinutes: 2,
  /**
   * Climb rate above which an aircraft near the airport is departing rather
   * than arriving. A single snapshot cannot show whether the distance is
   * growing or shrinking, but a jet climbing hard a few miles out has just
   * taken off.
   */
  climbingMps: 4,
  climbOutRangeKm: 90,
} as const;

/**
 * When an airborne aircraft cannot be arriving at this airport.
 *
 * Found by a real watch: a descending easyJet was offered as inbound to
 * Manchester when it was on its way to Birmingham, and a monitored journey then
 * timed a Manchester arrival from its position 105 km away. Both checks are
 * SetoffIQ judgements from physics and geometry, not air-traffic data.
 */
export const APPROACH_CHECK = {
  /** A standard approach descends at 3°: about 52 m of height per km out. */
  glidePathMetresPerKm: Math.tan((3 * Math.PI) / 180) * 1000,
  /**
   * Far below that profile, it is landing somewhere else. Forty per cent is
   * generous enough to absorb barometric error and a steep descent.
   */
  lowestFractionOfGlidePath: 0.4,
  /** Inside this, heights are too small and too noisy to judge by. */
  glidePathCheckFromKm: 10,
  /**
   * Heading is only judged beyond this. Closer in, downwind legs and holding
   * patterns legitimately point away from the airport for minutes at a time,
   * and judging them would make a monitored flight flicker between "arriving"
   * and "not arriving" on every check. Sixty kilometres leaves room for them.
   */
  headingCheckFromKm: 60,
  /** More than this off the direct bearing counts as heading away. */
  headingAwayDeg: 120,
} as const;

/** An aircraft on the ground further out than this is at another airfield. */
const ON_GROUND_HERE_KM = 8;

export type NotArrivingReason = 'bound-elsewhere' | 'too-low' | 'heading-away' | 'on-ground-elsewhere';

export function notArrivingReason(
  aircraft: SnapshotAircraft,
  airport: AirportProfile,
): NotArrivingReason | null {
  const here = { latitude: airport.latitude, longitude: airport.longitude };
  const there = { latitude: aircraft.latitude, longitude: aircraft.longitude };
  const distanceKm = haversineKm(there, here);

  if (aircraft.onGround) return distanceKm > ON_GROUND_HERE_KM ? 'on-ground-elsewhere' : null;

  // A reported route that ends somewhere else settles it before any geometry.
  // It is community data, so a route *to* here does not skip the checks below.
  if (aircraft.route && aircraft.route.to.icao !== airport.icaoCode) return 'bound-elsewhere';

  // The higher of the two readings, so an error in either can only make an
  // aircraft look more like an arrival, never less.
  const readings = [aircraft.geoAltitudeM, aircraft.baroAltitudeM].filter(
    (value): value is number => typeof value === 'number',
  );
  const heightM = readings.length > 0 ? Math.max(...readings) : null;
  if (
    heightM !== null &&
    distanceKm > APPROACH_CHECK.glidePathCheckFromKm &&
    heightM <
      distanceKm * APPROACH_CHECK.glidePathMetresPerKm * APPROACH_CHECK.lowestFractionOfGlidePath
  ) {
    return 'too-low';
  }

  const track = aircraft.trueTrackDeg;
  if (typeof track === 'number' && distanceKm > APPROACH_CHECK.headingCheckFromKm) {
    const offBy = Math.abs(((track - bearingDeg(there, here) + 540) % 360) - 180);
    if (offBy > APPROACH_CHECK.headingAwayDeg) return 'heading-away';
  }

  return null;
}

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
    if (distanceKm > ON_GROUND_HERE_KM) return null;
    return { onStand: observedAt + ARRIVAL_ESTIMATE.taxiMinutes * 60_000, distanceKm, minutesRemaining: ARRIVAL_ESTIMATE.taxiMinutes };
  }

  // Too low, or pointing away: whatever it is doing, it is not arriving here,
  // and timing a Manchester arrival from its position would be invention.
  if (notArrivingReason(aircraft, airport)) return null;

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
    /*
     * Established on the approach, so the track is direct — no vectoring
     * allowance. A flat constant here gave an aircraft two miles out and one
     * fifteen miles out the same arrival time, which is visibly wrong the
     * moment several are listed together.
     */
    const speedMps = aircraft.groundSpeedMps ?? 0;
    minutesRemaining =
      speedMps >= ARRIVAL_ESTIMATE.minimumApproachSpeedMps
        ? Math.max(
            ARRIVAL_ESTIMATE.minimumApproachMinutes,
            (distanceKm / ((speedMps * 3600) / 1000)) * 60,
          )
        : ARRIVAL_ESTIMATE.finalApproachMinutes;
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
