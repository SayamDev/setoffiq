import { describe, expect, it } from 'vitest';
import { KEEP_DAYS, mergeApproachSamples, mergeLandings } from '../../../scripts/lib/landings.mjs';

const at = (h: number, m = 0, day = 25) => Date.UTC(2026, 8, day, h, m);
const arrival = (overrides: Record<string, unknown>) => ({
  flight: 'EK21',
  callsign: 'UAE21',
  otherEnd: { iata: 'DXB' },
  terminal: '2',
  scheduled: at(12, 55),
  estimated: null,
  actual: null,
  status: 'scheduled',
  ...overrides,
});

describe('the landing record', () => {
  it('keeps the first estimate seen and adds the actual time once it lands', () => {
    const first = mergeLandings(
      null,
      { generatedAt: new Date(at(9)).toISOString(), arrivals: [arrival({ estimated: at(12, 40), status: 'active' })] },
      at(9),
    );
    const later = mergeLandings(
      first,
      {
        generatedAt: new Date(at(13, 30)).toISOString(),
        arrivals: [arrival({ estimated: at(12, 45), actual: at(12, 38), status: 'landed' })],
      },
      at(13, 30),
    );
    const entry = later.landings[`EK21@${at(12, 55)}`];
    expect(entry?.firstEstimate).toEqual({ value: at(12, 40), seenAt: at(9) });
    expect(entry?.actual).toBe(at(12, 38));
    expect(Object.keys(later.landings)).toHaveLength(1);
  });

  it('forgets arrivals older than the keep window', () => {
    const old = mergeLandings(null, { arrivals: [arrival({ scheduled: at(12, 0, 1) })] }, at(12, 0, 1));
    const now = at(12, 0, 1) + (KEEP_DAYS + 1) * 86_400_000;
    expect(mergeLandings(old, { arrivals: [] }, now).landings).toEqual({});
  });
});

describe('approach samples', () => {
  const airport = { icao: 'EGCC' };
  const inbound = (km: number) => ({
    callsign: 'UAE21 ',
    onGround: false,
    latitude: 53,
    longitude: -2,
    groundSpeedMps: 200,
    baroAltitudeM: 9000,
    verticalRateMps: -8,
    trueTrackDeg: 320,
    km,
    route: { from: { icao: 'OMDB' }, to: { icao: 'EGCC' } },
  });
  const distance = (one: { km: number }) => one.km;

  it('takes one sample per band as an arriving aircraft closes in', () => {
    let record = mergeApproachSamples(null, [inbound(280)], at(12), airport, distance as never);
    record = mergeApproachSamples(record, [inbound(250)], at(12, 3), airport, distance as never);
    record = mergeApproachSamples(record, [inbound(140)], at(12, 15), airport, distance as never);
    record = mergeApproachSamples(record, [inbound(40)], at(12, 30), airport, distance as never);

    expect(record.arrivals).toHaveLength(1);
    const samples = record.arrivals[0]?.samples ?? {};
    expect(samples['300']?.km).toBe(280);
    expect(samples['300']?.t).toBe(at(12));
    expect(samples['150']?.km).toBe(140);
    expect(samples['50']?.km).toBe(40);
  });

  it('ignores aircraft bound elsewhere, and those already on the ground', () => {
    const elsewhere = { ...inbound(40), route: { from: { icao: 'OMDB' }, to: { icao: 'EGBB' } } };
    const landed = { ...inbound(2), onGround: true };
    const record = mergeApproachSamples(null, [elsewhere, landed], at(12), airport, distance as never);
    expect(record.arrivals).toEqual([]);
  });

  it('treats the same callsign the next day as a new arrival', () => {
    let record = mergeApproachSamples(null, [inbound(40)], at(12), airport, distance as never);
    record = mergeApproachSamples(record, [inbound(40)], at(12, 0, 26), airport, distance as never);
    expect(record.arrivals).toHaveLength(2);
  });
});
