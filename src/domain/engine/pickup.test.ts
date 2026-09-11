import { describe, expect, it } from 'vitest';
import { MANCHESTER } from '../airports';
import { formatClock, minutesBetween } from '../time';
import { calculatePickupRecommendation } from './pickup';
import type { PickupEngineInput } from './inputs';
import { flight, manTime, noFlight, noRoute, noWeather, okRoute, weather, conditions, noRoadDisruption } from '../../test/factories';

const ZONE = MANCHESTER.timeZone;
const at = (instant: number): string => formatClock(instant, ZONE);

function pickupInput(overrides: Partial<PickupEngineInput> = {}): PickupEngineInput {
  const scheduledArrival = manTime(18, 20);
  return {
    journeyKind: 'pickup',
    now: manTime(16, 0),
    airport: MANCHESTER,
    passengerRoute: 'international',
    distanceKm: 30,
    scheduledArrival,
    mode: 'quick-pickup',
    flight: flight({ scheduledArrival }),
    route: okRoute(42),
    weather: weather('clear', scheduledArrival),
    airportConditions: conditions('VFR', scheduledArrival),
    roadDisruption: noRoadDisruption,
    ...overrides,
  };
}

describe('calculatePickupRecommendation', () => {
  it('builds the readiness window from the landing time plus the processing assumptions', () => {
    const result = calculatePickupRecommendation(pickupInput());
    if (result.kind !== 'pickup') throw new Error('expected a pickup recommendation');

    // International at Manchester: 5+8+5+6 = 24 min, 12+25+18+12 = 67 min.
    expect(result.readiness.processing).toEqual({ minMinutes: 24, maxMinutes: 67 });
    expect(at(result.readiness.window.earliest)).toBe('18:44');
    expect(at(result.readiness.window.latest)).toBe('19:27');
  });

  it('sets departure so the slowest plausible drive lands on the earliest readiness', () => {
    const result = calculatePickupRecommendation(pickupInput());
    if (result.kind !== 'pickup') throw new Error('expected a pickup recommendation');

    const meetingBuffer = 4; // quick pickup at Manchester
    const expectedDeparture =
      result.readiness.window.earliest -
      (meetingBuffer + result.journey.maxMinutes) * 60_000;

    expect(result.recommendedDeparture).toBe(expectedDeparture);
    // Arrival window is the departure plus the journey range, so its upper end
    // is exactly the meeting buffer before the passenger is first ready.
    expect(minutesBetween(result.airportArrivalWindow.latest, result.readiness.window.earliest)).toBe(
      meetingBuffer,
    );
  });

  it('is deterministic', () => {
    const input = pickupInput();
    expect(calculatePickupRecommendation(input)).toEqual(calculatePickupRecommendation(input));
  });

  it('uses a live position estimate in preference to the scheduled time', () => {
    const scheduledArrival = manTime(18, 20);
    const estimatedArrival = manTime(18, 34);
    const onTime = calculatePickupRecommendation(pickupInput());
    const delayed = calculatePickupRecommendation(
      pickupInput({
        flight: flight({
          scheduledArrival,
          estimatedArrival,
          estimatedArrivalSource: 'live-position',
          phase: 'airborne',
          position: {
            latitude: 53.9,
            longitude: -2.4,
            baroAltitudeM: 3000,
            geoAltitudeM: 3100,
            groundSpeedMps: 180,
            verticalRateMps: -6,
            onGround: false,
            distanceToAirportKm: 62,
          },
        }),
      }),
    );
    if (onTime.kind !== 'pickup' || delayed.kind !== 'pickup') throw new Error('expected pickups');

    expect(minutesBetween(onTime.recommendedDeparture, delayed.recommendedDeparture)).toBe(14);
    expect(delayed.factors.find((factor) => factor.id === 'flight')?.basis).toBe('live-data');
  });

  it('moves the departure earlier when the flight is now expected early', () => {
    const scheduledArrival = manTime(18, 34);
    const early = calculatePickupRecommendation(
      pickupInput({
        scheduledArrival,
        flight: flight({
          scheduledArrival,
          estimatedArrival: manTime(18, 19),
          estimatedArrivalSource: 'live-position',
          phase: 'airborne',
        }),
      }),
    );
    const baseline = calculatePickupRecommendation(pickupInput({ scheduledArrival }));
    if (early.kind !== 'pickup' || baseline.kind !== 'pickup') throw new Error('expected pickups');

    expect(minutesBetween(baseline.recommendedDeparture, early.recommendedDeparture)).toBe(-15);
  });

  it('refuses to recommend anything for a cancelled flight', () => {
    const result = calculatePickupRecommendation(
      pickupInput({ flight: flight({ phase: 'cancelled' }) }),
    );
    expect(result.kind).toBe('unavailable');
    if (result.kind !== 'unavailable') return;
    expect(result.headline).toMatch(/cancelled/i);
  });

  it('refuses to recommend anything for a diverted flight', () => {
    const result = calculatePickupRecommendation(
      pickupInput({ flight: flight({ phase: 'diverted' }) }),
    );
    expect(result.kind).toBe('unavailable');
    if (result.kind !== 'unavailable') return;
    expect(result.detail).toMatch(/no longer expected/i);
  });

  it('still recommends a departure when there is no flight data at all', () => {
    const result = calculatePickupRecommendation(pickupInput({ flight: noFlight }));
    if (result.kind !== 'pickup') throw new Error('expected a pickup recommendation');
    expect(result.confidence.level).not.toBe('high');
    expect(result.factors.find((factor) => factor.id === 'flight')?.basis).toBe('user-supplied');
  });

  it('still recommends a departure when weather is unavailable', () => {
    const result = calculatePickupRecommendation(pickupInput({ weather: noWeather }));
    if (result.kind !== 'pickup') throw new Error('expected a pickup recommendation');
    expect(result.factors.find((factor) => factor.id === 'weather')?.basis).toBe('unavailable');
  });

  it('widens the journey and lowers confidence when routing is unavailable', () => {
    const routed = calculatePickupRecommendation(pickupInput());
    const unrouted = calculatePickupRecommendation(pickupInput({ route: noRoute }));
    if (routed.kind !== 'pickup' || unrouted.kind !== 'pickup') throw new Error('expected pickups');

    const routedSpread = routed.journey.maxMinutes - routed.journey.minMinutes;
    const unroutedSpread = unrouted.journey.maxMinutes - unrouted.journey.minMinutes;
    expect(unroutedSpread).toBeGreaterThan(routedSpread);
    expect(unrouted.confidence.score).toBeLessThan(routed.confidence.score);
  });

  it('widens the journey in poor weather', () => {
    const clear = calculatePickupRecommendation(pickupInput());
    const poor = calculatePickupRecommendation(
      pickupInput({ weather: weather('poor', manTime(18, 20)) }),
    );
    if (clear.kind !== 'pickup' || poor.kind !== 'pickup') throw new Error('expected pickups');
    expect(poor.journey.maxMinutes).toBeGreaterThan(clear.journey.maxMinutes);
    expect(poor.recommendedDeparture).toBeLessThan(clear.recommendedDeparture);
  });

  it('gives a domestic arrival a shorter processing window than an international one', () => {
    const domestic = calculatePickupRecommendation(pickupInput({ passengerRoute: 'domestic' }));
    const international = calculatePickupRecommendation(pickupInput());
    if (domestic.kind !== 'pickup' || international.kind !== 'pickup') throw new Error('expected pickups');
    expect(domestic.readiness.processing.maxMinutes).toBeLessThan(
      international.readiness.processing.maxMinutes,
    );
  });

  it('allows more time at the airport for meeting inside the terminal', () => {
    const quick = calculatePickupRecommendation(pickupInput({ mode: 'quick-pickup' }));
    const meet = calculatePickupRecommendation(pickupInput({ mode: 'meet-and-greet' }));
    if (quick.kind !== 'pickup' || meet.kind !== 'pickup') throw new Error('expected pickups');
    expect(meet.recommendedDeparture).toBeLessThan(quick.recommendedDeparture);
  });

  it('tells the user to wait rather than leave when the departure is hours away', () => {
    const result = calculatePickupRecommendation(pickupInput({ now: manTime(9, 0) }));
    if (result.kind !== 'pickup') throw new Error('expected a pickup recommendation');
    expect(result.advisory.kind).toBe('plan');
  });

  it('says leave now once the departure time arrives', () => {
    const planned = calculatePickupRecommendation(pickupInput());
    if (planned.kind !== 'pickup') throw new Error('expected a pickup recommendation');
    const atDeparture = calculatePickupRecommendation(
      pickupInput({ now: planned.recommendedDeparture }),
    );
    if (atDeparture.kind !== 'pickup') throw new Error('expected a pickup recommendation');
    expect(atDeparture.advisory.kind).toBe('leave-now');
    expect(atDeparture.advisory.headline).toBe('Leave now');
  });

  it("says don't leave yet in the hour before departure", () => {
    const planned = calculatePickupRecommendation(pickupInput());
    if (planned.kind !== 'pickup') throw new Error('expected a pickup recommendation');
    const early = calculatePickupRecommendation(
      pickupInput({ now: planned.recommendedDeparture - 45 * 60_000 }),
    );
    if (early.kind !== 'pickup') throw new Error('expected a pickup recommendation');
    expect(early.advisory.kind).toBe('wait');
    expect(early.advisory.headline).toBe("Don't leave yet");
  });
});
