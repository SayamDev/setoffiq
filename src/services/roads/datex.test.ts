import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain JS shared with the CI snapshot script.
import { firstCoordinate, parseClosures } from '../../../scripts/lib/datex.mjs';
import {
  completedButStillActive,
  farAway,
  plannedMultiLocation,
  suspended,
  unplannedSingleLocation,
  // @ts-expect-error — plain JS fixtures taken from the provider's own docs.
} from '../../../scripts/lib/__fixtures__/closures-sample.mjs';

/**
 * Verifies the DATEX II mapping against National Highways' own published
 * sample payloads, so the field mapping is proven before any key exists.
 */
const AIRPORT = { latitude: 53.3537, longitude: -2.275 };
const NOW = Date.parse('2026-09-11T10:00:00Z');
const OPTIONS = { now: NOW, airport: AIRPORT, radiusKm: 40, closureType: 'planned' as const };

describe('DATEX II position lists', () => {
  it('reads latitude before longitude, as the feed declares', () => {
    // srsName is EPSG::4326 and the provider's samples are lat-then-lon.
    expect(firstCoordinate('53.352000 -2.310000 53.353000 -2.305000')).toEqual({
      latitude: 53.352,
      longitude: -2.31,
    });
  });

  it('rejects anything that is not a usable pair', () => {
    expect(firstCoordinate('53.352')).toBeNull();
    expect(firstCoordinate('')).toBeNull();
    expect(firstCoordinate(undefined)).toBeNull();
    expect(firstCoordinate('999 999')).toBeNull();
  });
});

describe('parsing the closures feed', () => {
  it('maps a multi-location planned closure to a single disruption', () => {
    const results = parseClosures(plannedMultiLocation, OPTIONS);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      road: 'M56',
      category: 'roadworks',
      description: 'M56 eastbound',
      active: false,
    });
    expect(results[0].distanceFromAirportKm).toBeLessThan(5);
  });

  it('maps a single-location unplanned closure and marks it active', () => {
    const results = parseClosures(unplannedSingleLocation, {
      ...OPTIONS,
      closureType: 'unplanned',
    });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      road: 'M60',
      category: 'incident',
      active: true,
    });
  });

  it('drops completed works that the feed still publishes as active', () => {
    // The docs state completed closures stay 'active' for seven days after the
    // works end. Trusting the status alone would show week-old roadworks as
    // current, which is exactly the kind of wrong a driver would act on.
    expect(parseClosures(completedButStillActive, OPTIONS)).toEqual([]);
  });

  it('drops cancelled works', () => {
    expect(parseClosures(suspended, OPTIONS)).toEqual([]);
  });

  it('drops anything outside the search radius', () => {
    expect(parseClosures(farAway, OPTIONS)).toEqual([]);
  });

  it('drops works starting well beyond this journey', () => {
    const nextWeek = { ...OPTIONS, now: Date.parse('2026-09-01T10:00:00Z') };
    expect(parseClosures(plannedMultiLocation, nextWeek)).toEqual([]);
  });

  it('survives an empty or unexpected payload without throwing', () => {
    expect(parseClosures({}, OPTIONS)).toEqual([]);
    expect(parseClosures({ D2Payload: {} }, OPTIONS)).toEqual([]);
    expect(parseClosures(null, OPTIONS)).toEqual([]);
    expect(parseClosures({ D2Payload: { situation: [{}] } }, OPTIONS)).toEqual([]);
  });

  it('does not emit a disruption it cannot name or place', () => {
    const nameless = {
      D2Payload: {
        situation: [
          {
            idG: '1',
            situationRecord: [
              {
                sitRoadOrCarriagewayOrLaneManagement: {
                  idG: 'x',
                  validity: { validityStatus: 'active' },
                  locationReference: {
                    locLinearLocation: {
                      gmlLineString: { locGmlLineString: { posList: '53.352 -2.310' } },
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    };
    expect(parseClosures(nameless, OPTIONS)).toEqual([]);
  });

  it('deduplicates a record that appears in both feeds', () => {
    const doubled = parseClosures(plannedMultiLocation, OPTIONS).concat(
      parseClosures(plannedMultiLocation, OPTIONS),
    );
    const ids = new Set(doubled.map((entry: { id: string }) => entry.id));
    expect(ids.size).toBe(1);
  });
});
