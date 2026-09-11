import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { MANCHESTER } from '../../domain/airports';
import { toSnapshotAircraft } from '../../../scripts/lib/adsblol.mjs';
import { createRouteLookup, legFor, splitCsvLine } from '../../../scripts/lib/routes.mjs';
import { writeCache } from '../cache';
import { clearAll } from '../storage';
import { notArrivingReason } from './arrivalEstimate';
import { listInboundAircraft } from './inbound';
import { snapshotFlightProvider } from './snapshotProvider';
import type { FlightSnapshot, SnapshotAircraft } from './snapshotTypes';

const EGCC = { latitude: 53.3537, longitude: -2.275 };
const NOW_MS = Date.UTC(2026, 8, 11, 17, 31);

describe('converting adsb.lol aircraft', () => {
  // Recorded from api.adsb.lol/v2/point on 11 September 2026.
  const recorded = {
    hex: '4cad9f',
    flight: 'EAI43S  ',
    alt_baro: 16000,
    alt_geom: 16800,
    gs: 243.6,
    track: 216.82,
    baro_rate: -1344,
    lat: 53.7,
    lon: -2.6,
    seen_pos: 0.1,
  };

  it('keeps the metric units the rest of the app expects', () => {
    const aircraft = toSnapshotAircraft(recorded, NOW_MS, EGCC, 300);
    expect(aircraft).toMatchObject({
      callsign: 'EAI43S',
      icao24: '4cad9f',
      baroAltitudeM: 4877, // 16,000 ft
      geoAltitudeM: 5121,
      groundSpeedMps: 125, // 243.6 kt
      verticalRateMps: -6.8, // -1,344 ft/min
      trueTrackDeg: 217,
      onGround: false,
      lastContact: Math.floor(NOW_MS / 1000 - 0.1),
    });
  });

  it('reads the altitude "ground" as on the ground, not as a number', () => {
    const aircraft = toSnapshotAircraft({ ...recorded, alt_baro: 'ground', lat: 53.36, lon: -2.28 }, NOW_MS, EGCC, 300);
    expect(aircraft?.onGround).toBe(true);
    expect(aircraft?.baroAltitudeM).toBeNull();
  });

  it('drops what cannot be named, placed or trusted', () => {
    expect(toSnapshotAircraft({ ...recorded, flight: '  ' }, NOW_MS, EGCC, 300)).toBeNull();
    expect(toSnapshotAircraft({ ...recorded, lat: undefined }, NOW_MS, EGCC, 300)).toBeNull();
    expect(toSnapshotAircraft({ ...recorded, seen_pos: 300 }, NOW_MS, EGCC, 300)).toBeNull();
    expect(toSnapshotAircraft({ ...recorded, lat: 58.5 }, NOW_MS, EGCC, 300)).toBeNull();
  });
});

describe('reported routes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'standing-data-'));
  const write = (path: string, body: string): void => {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), `﻿${body}`);
  };
  write('routes/schema-01/R/RYR-6.csv', 'Callsign,Code,Number,AirlineCode,AirportCodes\nRYR61UR,RYR,61UR,RYR,LEIB-EGCC\n');
  write('routes/schema-01/E/EZY-8.csv', 'Callsign,Code,Number,AirlineCode,AirportCodes\nEZY81DL,EZY,81DL,EZY,EGPH-EGBB\n');
  write('airports/schema-01/L/LE.csv', 'Code,Name,ICAO,IATA,Location,CountryISO2,Latitude,Longitude,AltitudeFeet\nLEIB,Ibiza Airport,LEIB,IBZ,Ibiza,ES,38.87,1.37,24\n');
  write('airports/schema-01/E/EG.csv', 'Code,Name,ICAO,IATA,Location,CountryISO2,Latitude,Longitude,AltitudeFeet\nEGCC,"Manchester Airport",EGCC,MAN,Manchester,GB,53.35,-2.27,257\nEGBB,Birmingham Airport,EGBB,BHX,Birmingham,GB,52.45,-1.74,327\n');
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('finds a callsign in a sharded airline file and names both ends', () => {
    const route = createRouteLookup(dir).lookup('RYR61UR', 'EGCC');
    expect(route?.from).toMatchObject({ icao: 'LEIB', iata: 'IBZ', city: 'Ibiza' });
    expect(route?.to).toMatchObject({ icao: 'EGCC', city: 'Manchester' });
  });

  it('reports a route that ends elsewhere, and nothing for an unknown callsign', () => {
    const lookup = createRouteLookup(dir);
    expect(lookup.lookup('EZY81DL', 'EGCC')?.to.icao).toBe('EGBB');
    expect(lookup.lookup('RYR99ZZ', 'EGCC')).toBeNull();
  });

  it('knows nothing, rather than failing, without the data', () => {
    expect(createRouteLookup(undefined).lookup('RYR61UR', 'EGCC')).toBeNull();
  });

  it('takes the leg that arrives here from a multi-stop route', () => {
    expect(legFor('OMDB-EGCC', 'EGCC')).toEqual({ from: 'OMDB', to: 'EGCC' });
    expect(legFor('KJFK-EGCC-EIDW', 'EGCC')).toEqual({ from: 'KJFK', to: 'EGCC' });
    expect(legFor('EGPH-EGBB', 'EGCC')).toEqual({ from: 'EGPH', to: 'EGBB' });
  });

  it('splits quoted CSV fields', () => {
    expect(splitCsvLine('A,"B, with comma",C')).toEqual(['A', 'B, with comma', 'C']);
  });
});

describe('an aircraft reported as bound elsewhere', () => {
  afterEach(() => clearAll());

  const airport = (icao: string, city: string) => ({ icao, iata: null, city, name: null, country: 'GB' });
  const aircraft = (callsign: string, toIcao: string, toCity: string): SnapshotAircraft => ({
    callsign,
    icao24: 'abc123',
    latitude: 53.6,
    longitude: -2.4,
    baroAltitudeM: 3000,
    geoAltitudeM: 3050,
    groundSpeedMps: 150,
    verticalRateMps: -5,
    trueTrackDeg: 180,
    onGround: false,
    lastContact: Math.floor(Date.now() / 1000),
    route: { from: airport('EGPH', 'Edinburgh'), to: airport(toIcao, toCity) },
  });

  function seed(list: SnapshotAircraft[]): void {
    writeCache(
      'flight-snapshot:EGCC',
      { generatedAt: new Date().toISOString(), airportIcao: 'EGCC', source: 'test', attribution: 'test', radiusKm: 300, aircraft: list } as FlightSnapshot,
      Date.now(),
    );
  }

  it('is not arriving, however well its height and heading fit', () => {
    // EZY81DL passed within 16 km of Manchester on its way to Birmingham.
    expect(notArrivingReason(aircraft('EZY81DL', 'EGBB', 'Birmingham'), MANCHESTER)).toBe('bound-elsewhere');
  });

  it('is left out of the picker, and the rest say where they come from', async () => {
    seed([aircraft('EZY81DL', 'EGBB', 'Birmingham'), aircraft('RYR61UR', 'EGCC', 'Manchester')]);
    const inbound = await listInboundAircraft(MANCHESTER);
    expect(inbound.map((a) => [a.callsign, a.from])).toEqual([['RYR61UR', 'Edinburgh']]);
  });

  it('tells a monitored journey where it is actually going', async () => {
    seed([aircraft('EZY81DL', 'EGBB', 'Birmingham')]);
    const result = await snapshotFlightProvider.getFlightStatus({
      flightNumber: 'EZY81DL',
      airport: MANCHESTER,
      scheduledArrival: Date.now() + 30 * 60_000,
      scheduledDeparture: null,
    });
    expect(result.value?.estimatedArrivalSource).toBe('user-schedule');
    expect(result.message).toMatch(/reported route is to Birmingham/);
  });
});
