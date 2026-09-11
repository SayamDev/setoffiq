import { describe, expect, it } from 'vitest';
import { compareRecommendations, toVersion } from './changes';
import { nextPollDelayMinutes } from './polling';
import { calculatePickupRecommendation } from './pickup';
import { manTime, flight, okRoute, weather, conditions, noRoadDisruption } from '../../test/factories';
import { MANCHESTER } from '../airports';
import type { RecommendationVersion } from '../types';
import type { PickupEngineInput } from './inputs';

function recommendation(scheduledArrival: number) {
  const input: PickupEngineInput = {
    now: manTime(16, 0),
    journeyKind: 'pickup',
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
  };
  const result = calculatePickupRecommendation(input);
  if (result.kind !== 'pickup') throw new Error('expected a pickup recommendation');
  return result;
}

function versionOf(departure: number, phase: RecommendationVersion['flightPhase'] = 'scheduled'): RecommendationVersion {
  return {
    id: 'v1',
    createdAt: manTime(16, 0),
    departure,
    confidence: 'high',
    reason: null,
    flightPhase: phase,
    dataObservedAt: null,
  };
}

describe('meaningful change detection', () => {
  it('ignores a departure time that barely moves', () => {
    const next = recommendation(manTime(18, 20));
    const previous = versionOf(next.recommendedDeparture - 3 * 60_000);
    const change = compareRecommendations(previous, next, 'scheduled');
    expect(change.meaningful).toBe(false);
    expect(change.departureDeltaMinutes).toBe(3);
  });

  it('flags a departure time that moves past the threshold', () => {
    const next = recommendation(manTime(18, 20));
    const previous = versionOf(next.recommendedDeparture - 33 * 60_000);
    const change = compareRecommendations(previous, next, 'scheduled');
    expect(change.meaningful).toBe(true);
    expect(change.reason).toContain('33 minutes later');
  });

  it('describes an earlier departure as earlier', () => {
    const next = recommendation(manTime(18, 20));
    const previous = versionOf(next.recommendedDeparture + 15 * 60_000);
    expect(compareRecommendations(previous, next, 'scheduled').reason).toContain('15 minutes earlier');
  });

  it('honours a configured threshold', () => {
    const next = recommendation(manTime(18, 20));
    const previous = versionOf(next.recommendedDeparture - 7 * 60_000);
    expect(compareRecommendations(previous, next, 'scheduled', 10).meaningful).toBe(false);
    expect(compareRecommendations(previous, next, 'scheduled', 5).meaningful).toBe(true);
  });

  it('flags a state change even when the time is identical', () => {
    const next = recommendation(manTime(18, 20));
    const previous = versionOf(next.recommendedDeparture, 'scheduled');
    const change = compareRecommendations(previous, next, 'airborne');
    expect(change.meaningful).toBe(true);
    expect(change.phaseChanged).toBe(true);
    expect(change.reason).toContain('scheduled to airborne');
  });

  it('records a version that can be compared later', () => {
    const next = recommendation(manTime(18, 20));
    const version = toVersion(next, 'airborne', manTime(17, 42), 'first', 'abc');
    expect(version).toMatchObject({
      id: 'abc',
      departure: next.recommendedDeparture,
      confidence: next.confidence.level,
      flightPhase: 'airborne',
      reason: 'first',
    });
  });
});

describe('adaptive polling', () => {
  const now = manTime(12, 0);

  it('checks rarely when the flight is more than a day away', () => {
    expect(nextPollDelayMinutes(now, now + 30 * 60 * 60_000, 'scheduled')).toBe(180);
  });

  it('tightens as the flight approaches', () => {
    const far = nextPollDelayMinutes(now, now + 10 * 60 * 60_000, 'scheduled')!;
    const near = nextPollDelayMinutes(now, now + 3 * 60 * 60_000, 'scheduled')!;
    const soon = nextPollDelayMinutes(now, now + 30 * 60_000, 'scheduled')!;
    expect(far).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(soon);
  });

  it('checks most often while the aircraft is airborne', () => {
    expect(nextPollDelayMinutes(now, now + 2 * 60 * 60_000, 'airborne')).toBe(5);
  });

  it('stops once there is nothing left to learn', () => {
    expect(nextPollDelayMinutes(now, now - 90 * 60_000, 'scheduled')).toBeNull();
    expect(nextPollDelayMinutes(now, now - 5 * 60_000, 'landed')).toBeNull();
  });

  it('stops immediately for a cancelled or diverted flight', () => {
    expect(nextPollDelayMinutes(now, now + 5 * 60 * 60_000, 'cancelled')).toBeNull();
    expect(nextPollDelayMinutes(now, now + 5 * 60 * 60_000, 'diverted')).toBeNull();
  });
});
