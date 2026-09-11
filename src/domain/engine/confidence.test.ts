import { describe, expect, it } from 'vitest';
import { MANCHESTER } from '../airports';
import { assessConfidence } from './confidence';
import type { JourneyEngineInput } from './inputs';
import type { JourneyEstimate } from './journeyWindow';
import { flight, manTime, noFlight, noRoute, noWeather, okRoute, weather } from '../../test/factories';

const LANDING = manTime(18, 20);

const routedJourney: JourneyEstimate = {
  range: { minMinutes: 42, maxMinutes: 51 },
  baseMinutes: 42,
  routed: true,
  uncertaintyReasons: [],
};

function input(overrides: Partial<JourneyEngineInput> = {}): JourneyEngineInput {
  return {
    now: manTime(16, 0),
    journeyKind: 'pickup',
    airport: MANCHESTER,
    passengerRoute: 'international',
    distanceKm: 30,
    flight: flight({
      phase: 'airborne',
      position: {
        latitude: 53.9,
        longitude: -2.4,
        baroAltitudeM: 4000,
        geoAltitudeM: 4100,
        groundSpeedMps: 180,
        verticalRateMps: -6,
        onGround: false,
        distanceToAirportKm: 62,
      },
    }),
    route: okRoute(42),
    weather: weather('clear', LANDING),
    ...overrides,
  };
}

describe('assessConfidence', () => {
  it('is high when flight, routing and weather are all available', () => {
    const result = assessConfidence(input(), routedJourney, LANDING);
    expect(result.level).toBe('high');
    expect(result.score).toBe(100);
  });

  it('is deterministic and never reads the clock', () => {
    const fixed = input();
    expect(assessConfidence(fixed, routedJourney, LANDING)).toEqual(
      assessConfidence(fixed, routedJourney, LANDING),
    );
  });

  it('drops when there is no live flight data for a pickup', () => {
    const result = assessConfidence(input({ flight: noFlight }), routedJourney, LANDING);
    expect(result.score).toBeLessThan(100);
    expect(result.reasons.some((reason) => reason.label === 'No live flight data')).toBe(true);
  });

  it('does not punish a drop-off for having no aircraft in sight', () => {
    // Nobody needs to see the aeroplane to drive someone to the airport: the
    // departure time is on the ticket.
    const pickup = assessConfidence(input({ flight: noFlight }), routedJourney, LANDING);
    const dropoff = assessConfidence(
      input({ journeyKind: 'dropoff', flight: noFlight }),
      routedJourney,
      LANDING,
    );
    expect(dropoff.score).toBeGreaterThan(pickup.score);
    expect(dropoff.level).toBe('high');
  });

  it('does not punish a drop-off for a stale position snapshot', () => {
    const stale = flight({ phase: 'unknown' }, 'stale', manTime(16, 0) - 36 * 60 * 60_000);
    const dropoff = assessConfidence(
      input({ journeyKind: 'dropoff', flight: stale }),
      routedJourney,
      LANDING,
    );
    expect(dropoff.reasons.some((reason) => reason.label === 'Flight data is stale')).toBe(false);
  });

  it('reports a stale pickup snapshot in readable units', () => {
    const stale = flight({ phase: 'airborne' }, 'stale', manTime(16, 0) - 38 * 60 * 60_000);
    const result = assessConfidence(input({ flight: stale }), routedJourney, LANDING);
    const reason = result.reasons.find((entry) => entry.label === 'Flight data is stale');
    expect(reason?.detail).toContain('2 days');
    expect(reason?.detail).not.toMatch(/\d{4,} minutes/);
  });

  it('falls to low when nothing external is available', () => {
    const result = assessConfidence(
      input({ flight: noFlight, route: noRoute, weather: noWeather }),
      { range: { minMinutes: 40, maxMinutes: 70 }, baseMinutes: 40, routed: false, uncertaintyReasons: [] },
      LANDING,
    );
    expect(result.level).toBe('low');
  });

  it('lowers confidence for a journey more than a day away', () => {
    const near = assessConfidence(input(), routedJourney, LANDING);
    const far = assessConfidence(input(), routedJourney, LANDING + 48 * 60 * 60_000);
    expect(far.score).toBeLessThan(near.score);
  });
});
