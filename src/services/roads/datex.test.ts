import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
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

describe('licence compliance', () => {
  it('emits the attribution string exactly as clause 20(a) requires', async () => {
    // Verbatim means verbatim, including the typographic apostrophe. This is a
    // licence condition for publishing the data at all, so it is pinned here
    // rather than left to survive the next tidy-up of the script.
    const source = await readFile(
      resolve(process.cwd(), 'scripts/fetch-road-disruption.mjs'),
      'utf8',
    );
    expect(source).toContain('Powered by National Highways\u2019 Transport Data Feeds');
  });
});

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

  it('collapses one set of works published as several records', () => {
    // National Highways splits a single closure across situationRecords — one
    // per lane or time period — each with its own id. Four identical M67 rows
    // is a publishing artefact, not four closures.
    const split = JSON.parse(JSON.stringify(plannedMultiLocation));
    const record = split.D2Payload.situation[0].situationRecord[0];
    split.D2Payload.situation[0].situationRecord = [0, 1, 2, 3].map((n) => {
      const copy = JSON.parse(JSON.stringify(record));
      copy.sitRoadOrCarriagewayOrLaneManagement.idG = `split-${n}`;
      return copy;
    });
    expect(parseClosures(split, OPTIONS)).toHaveLength(1);
  });

  it('deduplicates a record that appears in both feeds', () => {
    const doubled = parseClosures(plannedMultiLocation, OPTIONS).concat(
      parseClosures(plannedMultiLocation, OPTIONS),
    );
    const ids = new Set(doubled.map((entry: { id: string }) => entry.id));
    expect(ids.size).toBe(1);
  });
});

describe('staleness is judged per source', () => {
  it('does not call an hourly aerodrome observation stale after forty minutes', async () => {
    const { buildSignalReports } = await import('../../domain/engine/signalReports');
    const { MANCHESTER } = await import('../../domain/airports');
    const factories = await import('../../test/factories');

    const now = factories.manTime(18, 0);
    const fortyMinutesAgo = now - 40 * 60_000;

    const reports = buildSignalReports(
      {
        now,
        journeyKind: 'pickup',
        airport: MANCHESTER,
        passengerRoute: 'international',
        distanceKm: 30,
        flight: factories.flight({}),
        route: factories.okRoute(42),
        weather: factories.weather('clear', now),
        airportConditions: factories.conditions('VFR', fortyMinutesAgo),
        roadDisruption: factories.noRoadDisruption,
      },
      { range: { minMinutes: 42, maxMinutes: 51 }, baseMinutes: 42, routed: true, uncertaintyReasons: [] },
      { minMinutes: 24, maxMinutes: 67 },
    );

    // METARs are issued hourly. Judging one by the aircraft-position threshold
    // marked perfectly current data as stale and pushed confidence to low.
    const conditions = reports.find((report) => report.id === 'airport-conditions');
    expect(conditions?.state.kind).toBe('live');
  });

  it('names the processing signal for the journey it belongs to', async () => {
    const { buildSignalReports } = await import('../../domain/engine/signalReports');
    const { MANCHESTER } = await import('../../domain/airports');
    const factories = await import('../../test/factories');
    const now = factories.manTime(18, 0);

    const base = {
      now,
      airport: MANCHESTER,
      passengerRoute: 'international' as const,
      distanceKm: 30,
      flight: factories.flight({}),
      route: factories.okRoute(42),
      weather: factories.weather('clear', now),
      airportConditions: factories.conditions('VFR', now),
      roadDisruption: factories.noRoadDisruption,
    };
    const journey = {
      range: { minMinutes: 42, maxMinutes: 51 },
      baseMinutes: 42,
      routed: true,
      uncertaintyReasons: [],
    };
    const processing = { minMinutes: 24, maxMinutes: 67 };

    const pickup = buildSignalReports({ ...base, journeyKind: 'pickup' }, journey, processing);
    const dropoff = buildSignalReports({ ...base, journeyKind: 'dropoff' }, journey, processing);

    // The same signal means different things either side of the journey.
    expect(pickup.find((r) => r.id === 'processing')?.label).toBe('Getting out of the airport');
    expect(dropoff.find((r) => r.id === 'processing')?.label).toBe('Time at the terminal');
    expect(dropoff.find((r) => r.id === 'processing')?.summary).toMatch(/bag drop and security/i);
  });
});
