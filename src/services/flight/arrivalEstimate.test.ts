import { describe, expect, it } from 'vitest';
import { MANCHESTER } from '../../domain/airports';
import { ARRIVAL_ESTIMATE, estimateArrivalFromPosition } from './arrivalEstimate';
import type { SnapshotAircraft } from './snapshotTypes';

const OBSERVED_AT = Date.UTC(2026, 8, 16, 17, 42) / 1000;

function aircraft(overrides: Partial<SnapshotAircraft>): SnapshotAircraft {
  return {
    callsign: 'KLM1038',
    icao24: '484dab',
    latitude: 53.9,
    longitude: -2.4,
    baroAltitudeM: 4000,
    geoAltitudeM: 4100,
    groundSpeedMps: 180,
    verticalRateMps: -6,
    onGround: false,
    lastContact: OBSERVED_AT,
    ...overrides,
  };
}

describe('estimateArrivalFromPosition', () => {
  it('estimates an on-stand time from distance and ground speed', () => {
    const estimate = estimateArrivalFromPosition(aircraft({}), MANCHESTER);
    expect(estimate).not.toBeNull();
    // ~62 km at 648 km/h, vectored, plus final approach and taxi.
    expect(estimate!.minutesRemaining).toBeGreaterThan(10);
    expect(estimate!.minutesRemaining).toBeLessThan(30);
    expect(estimate!.onStand).toBe(OBSERVED_AT * 1000 + estimate!.minutesRemaining * 60_000);
  });

  it('scales the final approach with distance rather than using a constant', () => {
    // A flat constant gave an aircraft on short final and one fifteen miles out
    // the same arrival time, which is visibly wrong as soon as several are
    // listed together.
    const close = estimateArrivalFromPosition(
      aircraft({ latitude: 53.36, longitude: -2.29, baroAltitudeM: 300, groundSpeedMps: 70 }),
      MANCHESTER,
    );
    const further = estimateArrivalFromPosition(
      aircraft({ latitude: 53.52, longitude: -2.34, baroAltitudeM: 1500, groundSpeedMps: 100 }),
      MANCHESTER,
    );
    expect(close!.minutesRemaining).toBeLessThan(further!.minutesRemaining);
    expect(close!.minutesRemaining).toBeGreaterThanOrEqual(
      ARRIVAL_ESTIMATE.minimumApproachMinutes + ARRIVAL_ESTIMATE.taxiMinutes,
    );
  });

  it('falls back to the fixed allowance when approach speed is unusable', () => {
    const estimate = estimateArrivalFromPosition(
      aircraft({ latitude: 53.45, longitude: -2.3, baroAltitudeM: 900, groundSpeedMps: 5 }),
      MANCHESTER,
    );
    expect(estimate!.minutesRemaining).toBe(
      ARRIVAL_ESTIMATE.finalApproachMinutes + ARRIVAL_ESTIMATE.taxiMinutes,
    );
  });

  it('treats an aircraft on the ground at the airport as taxiing in', () => {
    const estimate = estimateArrivalFromPosition(
      aircraft({ latitude: 53.3537, longitude: -2.275, onGround: true, groundSpeedMps: 3 }),
      MANCHESTER,
    );
    expect(estimate!.minutesRemaining).toBe(ARRIVAL_ESTIMATE.taxiMinutes);
  });

  it('ignores an aircraft on the ground somewhere else', () => {
    const estimate = estimateArrivalFromPosition(
      aircraft({ latitude: 53.9, longitude: -2.4, onGround: true }),
      MANCHESTER,
    );
    expect(estimate).toBeNull();
  });

  it('does not treat a climbing aircraft near the airport as an arrival', () => {
    // Real case: a callsign seen a few miles out at 900 m climbing at 16 m/s is
    // operating the outbound leg, not the arrival someone is waiting for.
    const estimate = estimateArrivalFromPosition(
      aircraft({ latitude: 53.39, longitude: -2.28, baroAltitudeM: 922, verticalRateMps: 16.6 }),
      MANCHESTER,
    );
    expect(estimate).toBeNull();
  });

  it('still estimates for a cruising aircraft far out with a slight climb', () => {
    const estimate = estimateArrivalFromPosition(
      aircraft({ latitude: 55.2, longitude: -2.4, baroAltitudeM: 10_000, verticalRateMps: 0.3 }),
      MANCHESTER,
    );
    expect(estimate).not.toBeNull();
  });

  it('ignores an aircraft with no usable ground speed', () => {
    expect(estimateArrivalFromPosition(aircraft({ groundSpeedMps: 10 }), MANCHESTER)).toBeNull();
    expect(estimateArrivalFromPosition(aircraft({ groundSpeedMps: null }), MANCHESTER)).toBeNull();
  });

  it('ignores an aircraft well outside the covered area', () => {
    const estimate = estimateArrivalFromPosition(
      aircraft({ latitude: 40, longitude: 10 }),
      MANCHESTER,
    );
    expect(estimate).toBeNull();
  });
});
