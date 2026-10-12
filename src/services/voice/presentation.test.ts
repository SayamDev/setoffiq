import { describe, expect, it } from 'vitest';
import {
  journeyExplanation,
  journeyReply,
  speakable,
  speechChunks,
  spokenClock,
} from './presentation';
import {
  calculatePickupRecommendation,
  calculateDropoffRecommendation,
} from '../../domain/engine';
import { MANCHESTER } from '../../domain/airports';
import {
  conditions,
  flight,
  manTime,
  noRoadDisruption,
  noWeather,
  okRoute,
} from '../../test/factories';
import type { JourneyPlan } from '../plan';
import type { Observed, RecommendationResult } from '../../domain/types';
const observed = <T>(): Observed<T> => ({
  state: 'unavailable',
  value: null,
  observedAt: null,
  fetchedAt: null,
  message: null,
  provider: 'test',
  attribution: '',
});
function plan(result: RecommendationResult): JourneyPlan {
  return {
    recommendation: result,
    computedAt: manTime(16, 0),
    flight: {
      ...observed(),
      message: 'No matching aircraft found. Using the time you entered.',
    },
    route: observed(),
    weather: observed(),
    airportConditions: observed(),
    roadDisruption: observed(),
    terminal: null,
    flightRoute: null,
  };
}
const shared = {
  now: manTime(16, 0),
  airport: MANCHESTER,
  passengerRoute: 'international' as const,
  distanceKm: 30,
  route: okRoute(42),
  weather: noWeather,
  airportConditions: conditions('VFR', manTime(16, 0)),
  roadDisruption: noRoadDisruption,
};
const pickup = calculatePickupRecommendation({
  ...shared,
  journeyKind: 'pickup',
  scheduledArrival: manTime(18, 30),
  flight: flight({ scheduledArrival: manTime(18, 30) }),
  mode: 'quick-pickup',
});
const dropoff = calculateDropoffRecommendation({
  ...shared,
  journeyKind: 'dropoff',
  scheduledDeparture: manTime(22, 0),
  flight: flight({ scheduledDeparture: manTime(22, 0) }),
  mode: 'drop-off',
});
describe('contextual speech from deterministic results', () => {
  it.each([
    ['00:00', 'midnight'],
    ['12:00', 'noon'],
    ['18:30', '6 30 p.m.'],
    ['07:05', '7 oh 5 a.m.'],
    ['19:00', "7 o'clock p.m."],
  ])('pronounces %s clearly', (clock, expected) =>
    expect(spokenClock(clock)).toBe(expected),
  );
  it('leads with one departure, exact window, confidence and honest fallback', () => {
    const result = journeyReply(plan(pickup));
    expect(result).toContain('Set off at');
    expect(result.match(/Set off at/g)).toHaveLength(1);
    expect(result).toContain('passenger is estimated');
    expect(result).toContain('between');
    expect(result.toLowerCase()).toContain('confidence');
    expect(result).toContain('No matching aircraft');
    expect(result).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
  it('uses departure/terminal language for a drop-off, without passenger-readiness claims', () => {
    const result = journeyReply(plan(dropoff));
    expect(result).toContain('get you to the terminal');
    expect(result).not.toContain('passenger');
    expect(journeyExplanation(plan(dropoff))).toContain(
      "check your airline's deadline",
    );
  });
  it('does not reassure a late user to leave at a time already past', () => {
    if (pickup.kind !== 'pickup') throw new Error('Expected pickup');
    const late = plan({
      ...pickup,
      advisory: {
        kind: 'running-late',
        headline: 'Late',
        detail: 'Check with your passenger.',
      },
    });
    expect(journeyReply(late)).toMatch(/^The planned set-off time was/);
    expect(journeyReply(late)).toContain("You're running late");
  });
  it('keeps blocked and unavailable recommendations explicit', () => {
    if (pickup.kind !== 'pickup') throw new Error('Expected pickup');
    const blocked = plan({
      ...pickup,
      advisory: {
        kind: 'blocked',
        headline: 'Flight cancelled',
        detail: 'Check with the airline.',
      },
    });
    expect(journeyReply(blocked)).toMatch(/^Flight cancelled/);
    expect(journeyReply(blocked)).not.toContain('passenger is estimated');
    expect(
      journeyReply(
        plan({
          kind: 'unavailable',
          headline: 'Cannot plan',
          detail: 'Check the time.',
          computedAt: 0,
        }),
      ),
    ).toBe('Cannot plan. Check the time.');
  });
  it('marks both dates when readiness crosses midnight', () => {
    if (pickup.kind !== 'pickup') throw new Error('Expected pickup');
    const cross = plan({
      ...pickup,
      readiness: {
        ...pickup.readiness,
        window: { earliest: manTime(23, 50), latest: manTime(0, 25, 17) },
      },
    });
    expect(journeyReply(cross)).toContain(
      'between 23:50 today and 00:25 tomorrow',
    );
  });
  it('describes processing as assumptions and reads exact engine ranges', () => {
    const text = journeyExplanation(plan(pickup));
    expect(text).toContain('Those processing times are assumptions');
    if (pickup.kind !== 'pickup') throw new Error('Expected pickup');
    expect(text).toContain(
      `${pickup.journey.minMinutes} to ${pickup.journey.maxMinutes} minutes`,
    );
  });
  it('formats machine-oriented follow-ups without changing any number', () => {
    expect(
      speakable(
        'FR123 at 18:30, 2026-10-13. Ready 19:24–20:07. 40–45 minutes.',
      ),
    ).toBe(
      'F R 1 2 3 at 6 30 p.m., 13 October 2026. Ready between 7 24 p.m. and 8 oh 7 p.m. 40 to 45 minutes.',
    );
  });
  it('chunks long speech without dropping or reordering a word', () => {
    const text = speakable(journeyExplanation(plan(pickup)));
    const chunks = speechChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 185)).toBe(true);
    expect(chunks.join(' ')).toBe(text);
  });
});
