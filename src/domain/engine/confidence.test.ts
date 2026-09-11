import { describe, expect, it } from 'vitest';
import { MANCHESTER } from '../airports';
import { calculatePickupRecommendation } from './pickup';
import { calculateDropoffRecommendation } from './dropoff';
import type { DropoffEngineInput, PickupEngineInput } from './inputs';
import {
  conditions,
  flight,
  manTime,
  noConditions,
  noFlight,
  noRoute,
  noWeather,
  okRoute,
  weather,
} from '../../test/factories';

const ARRIVAL = manTime(18, 20);

function pickup(overrides: Partial<PickupEngineInput> = {}): PickupEngineInput {
  return {
    now: manTime(16, 0),
    journeyKind: 'pickup',
    airport: MANCHESTER,
    passengerRoute: 'international',
    distanceKm: 30,
    scheduledArrival: ARRIVAL,
    mode: 'quick-pickup',
    flight: flight({
      scheduledArrival: ARRIVAL,
      estimatedArrival: ARRIVAL,
      estimatedArrivalSource: 'live-position',
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
    weather: weather('clear', ARRIVAL),
    airportConditions: conditions('VFR', ARRIVAL),
    ...overrides,
  };
}

function assess(overrides: Partial<PickupEngineInput> = {}) {
  const result = calculatePickupRecommendation(pickup(overrides));
  if (result.kind !== 'pickup') throw new Error('expected a pickup recommendation');
  return result;
}

describe('confidence, derived from signals', () => {
  it('reports one signal per input, so the score can be explained', () => {
    const { signals } = assess();
    expect(signals.map((s) => s.id).sort()).toEqual([
      'airport-conditions',
      'flight',
      'journey-weather',
      'processing',
      'route',
    ]);
  });

  it('never disagrees with the table that explains it', () => {
    // Every confidence reason corresponds to a signal the UI also renders.
    const { signals, confidence } = assess();
    for (const signal of signals) {
      expect(confidence.reasons.some((reason) => reason.label === signal.label)).toBe(true);
    }
  });

  it('is deterministic', () => {
    const input = pickup();
    expect(calculatePickupRecommendation(input)).toEqual(calculatePickupRecommendation(input));
  });

  it('drops when the flight cannot be found', () => {
    expect(assess({ flight: noFlight }).confidence.score).toBeLessThan(assess().confidence.score);
  });

  it('drops further when routing is unavailable too', () => {
    const one = assess({ flight: noFlight }).confidence.score;
    const two = assess({ flight: noFlight, route: noRoute }).confidence.score;
    expect(two).toBeLessThan(one);
  });

  it('falls to low when nothing external is available', () => {
    const result = assess({
      flight: noFlight,
      route: noRoute,
      weather: noWeather,
      airportConditions: noConditions,
    });
    expect(result.confidence.level).toBe('low');
  });

  it('treats low-visibility aerodrome conditions as a moderate concern', () => {
    const clear = assess();
    const lifr = assess({ airportConditions: conditions('LIFR', ARRIVAL) });
    expect(lifr.confidence.score).toBeLessThan(clear.confidence.score);

    const signal = lifr.signals.find((s) => s.id === 'airport-conditions');
    expect(signal?.impact).toBe('moderate');
    // It must not claim to know there will be a delay.
    expect(signal?.summary).toMatch(/can slow/i);
  });

  it('always marks passenger processing as an assumption, never as measured', () => {
    const signal = assess().signals.find((s) => s.id === 'processing');
    expect(signal?.state.kind).toBe('assumed');
    expect(signal?.summary).toMatch(/no source publishes live/i);
  });

  it('does not punish a drop-off for having no aircraft in sight', () => {
    const departure = manTime(11, 30);
    const base: DropoffEngineInput = {
      now: manTime(6, 0),
      journeyKind: 'dropoff',
      airport: MANCHESTER,
      passengerRoute: 'international',
      distanceKm: 30,
      scheduledDeparture: departure,
      mode: 'drop-off',
      flight: noFlight,
      route: okRoute(45),
      weather: weather('clear', departure),
      airportConditions: conditions('VFR', departure),
    };
    const result = calculateDropoffRecommendation(base);
    if (result.kind !== 'dropoff') throw new Error('expected a drop-off recommendation');

    const signal = result.signals.find((s) => s.id === 'flight');
    expect(signal?.impact).toBe('none');
    expect(result.confidence.level).not.toBe('low');
  });

  it('lowers confidence for a journey more than a day away', () => {
    const near = assess();
    const far = assess({ now: manTime(16, 0) - 48 * 60 * 60_000 });
    expect(far.confidence.score).toBeLessThan(near.confidence.score);
  });
});
