import { describe, expect, it } from 'vitest';
import { MANCHESTER } from '../../domain/airports';
import { calculatePickupRecommendation } from '../../domain/engine';
import type { PickupEngineInput } from '../../domain/engine';
import { disruptionUncertainty, relevantTo } from './disruption';
import type { RoadDisruption } from '../../domain/types';
import {
  conditions,
  flight,
  manTime,
  noRoadDisruption,
  okRoute,
  roadDisruption,
  weather,
} from '../../test/factories';

const ARRIVAL = manTime(18, 20);

function entry(overrides: Partial<RoadDisruption> = {}): RoadDisruption {
  return {
    id: 'd1',
    road: 'M56',
    category: 'roadworks',
    description: 'Lane closure',
    distanceFromAirportKm: 6,
    startedAt: ARRIVAL,
    expectedEndAt: null,
    active: true,
    ...overrides,
  };
}

function pickup(overrides: Partial<PickupEngineInput> = {}): PickupEngineInput {
  return {
    now: manTime(16, 0),
    journeyKind: 'pickup',
    airport: MANCHESTER,
    passengerRoute: 'international',
    distanceKm: 30,
    scheduledArrival: ARRIVAL,
    mode: 'quick-pickup',
    flight: flight({ scheduledArrival: ARRIVAL }),
    route: okRoute(42),
    weather: weather('clear', ARRIVAL),
    airportConditions: conditions('VFR', ARRIVAL),
    roadDisruption: noRoadDisruption,
    ...overrides,
  };
}

function assess(overrides: Partial<PickupEngineInput> = {}) {
  const result = calculatePickupRecommendation(pickup(overrides));
  if (result.kind !== 'pickup') throw new Error('expected a pickup recommendation');
  return result;
}

describe('road disruption filtering', () => {
  it('ignores disruptions that are not currently in force', () => {
    const kept = relevantTo([entry({ active: false }), entry({ id: 'd2' })], MANCHESTER);
    expect(kept.map((e) => e.id)).toEqual(['d2']);
  });

  it('ignores disruptions too far away to be on any sensible route', () => {
    const kept = relevantTo([entry({ distanceFromAirportKm: 120 })], MANCHESTER);
    expect(kept).toEqual([]);
  });

  it('puts the closest first', () => {
    const kept = relevantTo(
      [entry({ id: 'far', distanceFromAirportKm: 30 }), entry({ id: 'near', distanceFromAirportKm: 3 })],
      MANCHESTER,
    );
    expect(kept.map((e) => e.id)).toEqual(['near', 'far']);
  });

  it('treats a closure as worse than roadworks', () => {
    expect(disruptionUncertainty([entry({ category: 'closure' })])).toBeGreaterThan(
      disruptionUncertainty([entry({ category: 'roadworks' })]),
    );
    expect(disruptionUncertainty([])).toBe(0);
  });
});

describe('road disruption in a recommendation', () => {
  it('says plainly that it was not checked, rather than that the roads are clear', () => {
    // The distinction that matters: no data is not the same as no disruption.
    const signal = assess().signals.find((s) => s.id === 'road-disruption');
    expect(signal?.state.kind).toBe('not-configured');
    expect(signal?.summary).toMatch(/not evidence the roads are clear/i);
    // A limitation that is always present must not drag every score down:
    // having no source configured scores the same as a source reporting
    // nothing, so confidence stays meaningful.
    expect(signal?.impact).toBe('none');
    expect(assess().confidence.score).toBe(
      assess({ roadDisruption: roadDisruption([], manTime(17, 0)) }).confidence.score,
    );
  });

  it('changes nothing about the departure time when no source is configured', () => {
    const withoutSource = assess();
    const withNothingReported = assess({
      roadDisruption: roadDisruption([], manTime(17, 0)),
    });
    expect(withNothingReported.recommendedDeparture).toBe(withoutSource.recommendedDeparture);
  });

  it('widens the drive and leaves earlier when a closure is in force', () => {
    const clear = assess();
    const closed = assess({
      roadDisruption: roadDisruption(
        [{ category: 'closure', description: 'M56 closed', active: true }],
        manTime(17, 0),
      ),
    });
    expect(closed.journey.maxMinutes).toBeGreaterThan(clear.journey.maxMinutes);
    expect(closed.recommendedDeparture).toBeLessThan(clear.recommendedDeparture);
  });

  it('does not let routine roadworks inflate every estimate', () => {
    /*
     * There are typically dozens of live lane closures within 40 km of any
     * airport — it is the normal state of the motorway network. If routine
     * maintenance moved the number, every recommendation would carry a
     * permanent penalty that meant nothing.
     */
    const clear = assess();
    const busy = assess({
      roadDisruption: roadDisruption(
        Array.from({ length: 24 }, (_, index) => ({
          id: `rw${index}`,
          category: 'roadworks' as const,
          description: `M60 lane ${index} closure`,
          active: true,
        })),
        manTime(17, 0),
      ),
    });
    expect(busy.journey.maxMinutes).toBe(clear.journey.maxMinutes);
    expect(busy.recommendedDeparture).toBe(clear.recommendedDeparture);

    // Still reported, just not alarming.
    const signal = busy.signals.find((s) => s.id === 'road-disruption');
    expect(signal?.impact).toBe('none');
    expect(signal?.summary).toMatch(/none currently closing a road/i);
  });

  it('ignores a closure that is not yet in force', () => {
    const clear = assess();
    const planned = assess({
      roadDisruption: roadDisruption(
        [{ category: 'closure', description: 'M56 closing later', active: false }],
        manTime(17, 0),
      ),
    });
    expect(planned.journey.maxMinutes).toBe(clear.journey.maxMinutes);
  });

  it('reports a closure as a high-impact signal and names the road', () => {
    const result = assess({
      roadDisruption: roadDisruption(
        [{ category: 'closure', road: 'M56', description: 'Closed between J5 and J6', active: true }],
        manTime(17, 0),
      ),
    });
    const signal = result.signals.find((s) => s.id === 'road-disruption');
    expect(signal?.impact).toBe('high');
    expect(signal?.summary).toContain('M56');
  });

  it('does not move the recommendation for an incident that is nearby but unconfirmed on this route', () => {
    const clear = assess();
    const nearby = assess({
      roadDisruption: roadDisruption(
        [{ category: 'incident', description: 'Accident nearby', routeMatch: 'unconfirmed' }],
        manTime(17, 0),
      ),
    });
    expect(nearby.recommendedDeparture).toBe(clear.recommendedDeparture);
    expect(nearby.signals.find((s) => s.id === 'road-disruption')?.summary).toMatch(/none confirmed on your route/i);
  });

  it('does not use stale closure data to change a departure', () => {
    const clear = assess();
    const stale = roadDisruption([{ category: 'closure', description: 'Old closure' }], manTime(13, 0));
    stale.state = 'stale';
    const result = assess({ roadDisruption: stale });
    expect(result.recommendedDeparture).toBe(clear.recommendedDeparture);
    expect(result.signals.find((s) => s.id === 'road-disruption')?.state.kind).toBe('stale');
    expect(result.signals.find((s) => s.id === 'road-disruption')?.summary).toMatch(/too old to use/i);
  });

  it('confirms clear roads only when a source actually said so', () => {
    const result = assess({ roadDisruption: roadDisruption([], manTime(17, 0)) });
    const signal = result.signals.find((s) => s.id === 'road-disruption');
    expect(signal?.state.kind).toBe('live');
    expect(signal?.impact).toBe('none');
    expect(signal?.summary).toMatch(/no current closure or incident reported/i);
  });
});
