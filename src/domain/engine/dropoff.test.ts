import { describe, expect, it } from 'vitest';
import { MANCHESTER } from '../airports';
import { formatClock, minutesBetween } from '../time';
import { calculateDropoffRecommendation } from './dropoff';
import type { DropoffEngineInput } from './inputs';
import { flight, manTime, noRoute, okRoute, weather } from '../../test/factories';

const at = (instant: number): string => formatClock(instant, MANCHESTER.timeZone);

function dropoffInput(overrides: Partial<DropoffEngineInput> = {}): DropoffEngineInput {
  const scheduledDeparture = manTime(11, 30);
  return {
    journeyKind: 'dropoff',
    now: manTime(6, 0),
    airport: MANCHESTER,
    passengerRoute: 'international',
    distanceKm: 30,
    scheduledDeparture,
    mode: 'drop-off',
    flight: flight({ scheduledDeparture }),
    route: okRoute(45),
    weather: weather('clear', scheduledDeparture),
    ...overrides,
  };
}

describe('calculateDropoffRecommendation', () => {
  it('works back from the flight departure through the check-in and parking buffers', () => {
    const result = calculateDropoffRecommendation(dropoffInput());
    if (result.kind !== 'dropoff') throw new Error('expected a drop-off recommendation');

    // International buffer at Manchester is 120–180 min, so the target for
    // being at the terminal is 3 hours before an 11:30 departure.
    expect(result.departureBuffer).toEqual({ minMinutes: 120, maxMinutes: 180 });
    expect(at(result.terminalArrivalWindow.latest)).toBe('08:30');
  });

  it('puts the passenger at the terminal by the target, allowing for the slowest drive', () => {
    const result = calculateDropoffRecommendation(dropoffInput());
    if (result.kind !== 'dropoff') throw new Error('expected a drop-off recommendation');

    const terminalBuffer = 8; // drop-off zone at Manchester
    const expectedDeparture =
      result.flightDeparture -
      (180 + terminalBuffer + result.journey.maxMinutes) * 60_000;
    expect(result.recommendedDeparture).toBe(expectedDeparture);
    expect(minutesBetween(result.airportArrivalWindow.latest, result.terminalArrivalWindow.latest)).toBe(
      terminalBuffer,
    );
  });

  it('leaves earlier for a domestic flight than the international buffer would imply', () => {
    const domestic = calculateDropoffRecommendation(dropoffInput({ passengerRoute: 'domestic' }));
    const international = calculateDropoffRecommendation(dropoffInput());
    if (domestic.kind !== 'dropoff' || international.kind !== 'dropoff') {
      throw new Error('expected drop-off recommendations');
    }
    expect(domestic.recommendedDeparture).toBeGreaterThan(international.recommendedDeparture);
  });

  it('allows more time when the driver parks and sees the passenger off', () => {
    const quick = calculateDropoffRecommendation(dropoffInput({ mode: 'drop-off' }));
    const stay = calculateDropoffRecommendation(dropoffInput({ mode: 'meet-and-greet' }));
    if (quick.kind !== 'dropoff' || stay.kind !== 'dropoff') throw new Error('expected drop-offs');
    expect(stay.recommendedDeparture).toBeLessThan(quick.recommendedDeparture);
  });

  it('labels the check-in buffer as an assumption and points at the airline', () => {
    const result = calculateDropoffRecommendation(dropoffInput());
    if (result.kind !== 'dropoff') throw new Error('expected a drop-off recommendation');
    const checkIn = result.factors.find((factor) => factor.id === 'check-in');
    expect(checkIn?.basis).toBe('assumption');
    expect(checkIn?.detail).toMatch(/does not publish a recommended arrival time/i);
  });

  it('refuses to recommend anything for a cancelled flight', () => {
    const result = calculateDropoffRecommendation(
      dropoffInput({ flight: flight({ phase: 'cancelled' }) }),
    );
    expect(result.kind).toBe('unavailable');
  });

  it('still works without routing, with lower confidence', () => {
    const routed = calculateDropoffRecommendation(dropoffInput());
    const unrouted = calculateDropoffRecommendation(dropoffInput({ route: noRoute }));
    if (routed.kind !== 'dropoff' || unrouted.kind !== 'dropoff') throw new Error('expected drop-offs');
    expect(unrouted.confidence.score).toBeLessThan(routed.confidence.score);
    expect(unrouted.recommendedDeparture).toBeLessThan(routed.recommendedDeparture);
  });

  it('is deterministic', () => {
    const input = dropoffInput();
    expect(calculateDropoffRecommendation(input)).toEqual(calculateDropoffRecommendation(input));
  });
});
