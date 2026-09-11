import { describe, expect, it } from 'vitest';
import { MANCHESTER } from '../../domain/airports';
import { detectArrivals, localDayAndMinute, mergeHistory } from '../../../scripts/lib/history.mjs';
import {
  circularMeanMinute,
  minutesAgainstUsual,
  usualArrivals,
  usualTimeFor,
  type ArrivalHistory,
} from './history';
import type { SnapshotAircraft } from './snapshotTypes';

const EGCC = { icao: 'EGCC', latitude: 53.3537, longitude: -2.275 };
const ZONE = 'Europe/London';
/** 19:00 BST, Friday 11 September 2026. */
const AT_1900 = Date.UTC(2026, 8, 11, 18, 0);

const place = (icao: string, city: string, country: string) => ({ icao, iata: null, city, name: null, country });
const toManchester = { from: place('LEIB', 'Ibiza', 'ES'), to: place('EGCC', 'Manchester', 'GB') };
const fromManchester = { from: place('EGCC', 'Manchester', 'GB'), to: place('EHAM', 'Amsterdam', 'NL') };

function aircraft(overrides: Partial<SnapshotAircraft>): SnapshotAircraft {
  return {
    callsign: 'RYR61UR',
    icao24: 'abc',
    latitude: 53.35,
    longitude: -2.28,
    baroAltitudeM: null,
    geoAltitudeM: null,
    groundSpeedMps: 0,
    verticalRateMps: null,
    trueTrackDeg: null,
    onGround: true,
    lastContact: AT_1900 / 1000,
    route: toManchester,
    ...overrides,
  };
}

describe('noticing landings in a snapshot', () => {
  it('counts an aircraft on the ground here that was routed here', () => {
    expect(detectArrivals([aircraft({})], EGCC)).toHaveLength(1);
  });

  it('does not count a departure taxiing out', () => {
    expect(detectArrivals([aircraft({ callsign: 'EZY95FW', route: fromManchester })], EGCC)).toHaveLength(0);
  });

  it('counts an aircraft on final even with no route, and times the touchdown', () => {
    // 12 km out, 594 m, descending — recorded from NSZ4469 on 11 September.
    const onFinal = aircraft({ callsign: 'NSZ4469', latitude: 53.46, longitude: -2.28, onGround: false, baroAltitudeM: 594, verticalRateMps: -4.9, groundSpeedMps: 75, route: null });
    const [landing] = detectArrivals([onFinal], EGCC);
    expect(landing?.at).toBeGreaterThan(AT_1900);
    expect(landing!.at - AT_1900).toBeLessThan(5 * 60_000);
  });

  it('counts an aircraft on its way in when it is routed here', () => {
    const inbound = aircraft({ latitude: 53.8, longitude: -2.4, onGround: false, baroAltitudeM: 3500, verticalRateMps: -6, groundSpeedMps: 140 });
    expect(detectArrivals([inbound], EGCC)).toHaveLength(1);
    expect(detectArrivals([{ ...inbound, route: null }], EGCC)).toHaveLength(0);
  });
});

describe('the record of landings', () => {
  it('keeps one landing a day, timed from the sighting nearest the airport', () => {
    const far = { callsign: 'RYR61UR', at: AT_1900 + 20 * 60_000, route: toManchester, km: 50 };
    const near = { callsign: 'RYR61UR', at: AT_1900 + 12 * 60_000, route: toManchester, km: 8 };
    const history = mergeHistory(mergeHistory(null, [far], AT_1900, ZONE, 'EGCC'), [near], AT_1900, ZONE, 'EGCC');
    expect(history.flights.RYR61UR?.landings).toEqual([{ date: '2026-09-11', minute: 19 * 60 + 12, km: 8 }]);
    expect(history.flights.RYR61UR?.from).toEqual({ icao: 'LEIB', city: 'Ibiza', country: 'ES' });
  });

  it('forgets landings older than two weeks, and remembers when recording began', () => {
    const old = mergeHistory(null, [{ callsign: 'OLD1', at: AT_1900, route: null, km: 3 }], AT_1900, ZONE, 'EGCC');
    const later = mergeHistory(old, [], AT_1900 + 15 * 86_400_000, ZONE, 'EGCC');
    expect(later.flights.OLD1).toBeUndefined();
    expect(later.recordingSince).toBe('2026-09-11');
  });

  it('reads the local date and minute across the clocks', () => {
    expect(localDayAndMinute(AT_1900, ZONE)).toEqual({ date: '2026-09-11', minute: 1140 });
  });
});

function historyWith(landings: Record<string, { date: string; minute: number }[]>): ArrivalHistory {
  return {
    generatedAt: new Date(AT_1900).toISOString(),
    recordingSince: '2026-09-01',
    keepDays: 14,
    flights: Object.fromEntries(
      Object.entries(landings).map(([callsign, list]) => [callsign, { from: { icao: 'LEIB', city: 'Ibiza', country: 'ES' }, landings: list }]),
    ),
  };
}

const days = (minute: number, ...dates: string[]) => dates.map((date) => ({ date, minute }));

describe('what usually lands', () => {
  it('averages times of day on a clock face', () => {
    expect(circularMeanMinute([23 * 60 + 55, 5])).toBe(0);
    expect(circularMeanMinute([600, 620])).toBe(610);
  });

  it('needs three recent days before calling anything usual', () => {
    const history = historyWith({ RYR61UR: days(1300, '2026-09-09', '2026-09-10') });
    expect(usualTimeFor(history, 'RYR61UR', '2026-09-11')).toBeNull();
  });

  it('lists a flight due later today, and one due after midnight as tomorrow', () => {
    const history = historyWith({
      RYR61UR: days(21 * 60 + 40, '2026-09-08', '2026-09-09', '2026-09-10'),
      UAE21: days(65, '2026-09-08', '2026-09-09', '2026-09-10'),
    });
    const list = usualArrivals(history, MANCHESTER, AT_1900, new Set());
    expect(list.map((f) => [f.callsign, f.status, localDayAndMinute(f.usualAt, ZONE)])).toEqual([
      ['RYR61UR', 'expected', { date: '2026-09-11', minute: 1300 }],
      ['UAE21', 'expected', { date: '2026-09-12', minute: 65 }],
    ]);
  });

  it('says a flight has not been seen once its usual time has passed', () => {
    const history = historyWith({ RYR61UR: days(18 * 60, '2026-09-08', '2026-09-09', '2026-09-10') });
    expect(usualArrivals(history, MANCHESTER, AT_1900, new Set())[0]?.status).toBe('not-seen-yet');
  });

  it('leaves out flights already in the air, or already landed today', () => {
    const history = historyWith({
      RYR61UR: days(1300, '2026-09-08', '2026-09-09', '2026-09-10'),
      EZY1: [...days(1300, '2026-09-08', '2026-09-09', '2026-09-10'), { date: '2026-09-11', minute: 1100 }],
    });
    expect(usualArrivals(history, MANCHESTER, AT_1900, new Set(['RYR61UR']))).toEqual([]);
  });

  it('says how much later than usual an aircraft in the air is running', () => {
    const history = historyWith({ RYR61UR: days(19 * 60, '2026-09-08', '2026-09-09', '2026-09-10') });
    // On stand 19:31 means touchdown 19:25: 25 minutes later than usual.
    expect(minutesAgainstUsual(history, 'RYR61UR', AT_1900 + 31 * 60_000, MANCHESTER, 6)).toBe(25);
    expect(minutesAgainstUsual(history, 'RYR61UR', AT_1900 + 10 * 60_000, MANCHESTER, 6)).toBeNull();
  });
});
