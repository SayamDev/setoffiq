import { afterEach, describe, expect, it } from 'vitest';
import { MANCHESTER } from '../../domain/airports';
import { writeCache } from '../cache';
import { clearAll } from '../storage';
import { listInboundAircraft } from './inbound';
import { isCargoOperator, operatorName } from './operators';
import type { FlightSnapshot, SnapshotAircraft } from './snapshotTypes';

describe('naming the operator from a callsign', () => {
  it('names the airlines people are actually collected from', () => {
    expect(operatorName('EZY81DL')).toBe('easyJet');
    expect(operatorName('RYR61UR')).toBe('Ryanair');
    expect(operatorName('CFE18M')).toBe('BA CityFlyer');
    expect(operatorName('UAE21')).toBe('Emirates');
  });

  it('uses the current holder of a reassigned designator', () => {
    // OpenFlights still lists EAI as a Togolese airline and TOM as Thomsonfly.
    expect(operatorName('EAI33CB')).toBe('Aer Lingus Regional');
    expect(operatorName('TOM1EA')).toBe('TUI Airways');
  });

  it('shows nothing rather than guessing at an unknown operator', () => {
    expect(operatorName('ZZZ123')).toBeNull();
  });

  it('knows which operators carry only freight', () => {
    for (const callsign of ['FDX5270', 'BCS1TQ', 'NPT9BF']) expect(isCargoOperator(callsign)).toBe(true);
    for (const callsign of ['EZY81DL', 'BAW62']) expect(isCargoOperator(callsign)).toBe(false);
  });
});

describe('the inbound picker', () => {
  afterEach(() => clearAll());

  function arriving(callsign: string, latitude: number): SnapshotAircraft {
    return {
      callsign,
      icao24: callsign.toLowerCase(),
      latitude,
      longitude: -2.4,
      baroAltitudeM: 3000,
      geoAltitudeM: 3050,
      groundSpeedMps: 150,
      verticalRateMps: -5,
      trueTrackDeg: 180,
      onGround: false,
      lastContact: Math.floor(Date.now() / 1000),
    };
  }

  it('leaves out freighters and names the airline of the rest', async () => {
    writeCache(
      'flight-snapshot:EGCC',
      {
        generatedAt: new Date().toISOString(),
        airportIcao: 'EGCC',
        source: 'test',
        attribution: 'test',
        radiusKm: 300,
        aircraft: [arriving('FDX5270', 53.7), arriving('EZY81DL', 53.6), arriving('BAW62', 53.8)],
      } as FlightSnapshot,
      Date.now(),
    );

    const inbound = await listInboundAircraft(MANCHESTER);
    expect(inbound.map((a) => [a.callsign, a.airline])).toEqual([
      ['EZY81DL', 'easyJet'],
      ['BAW62', 'British Airways'],
    ]);
  });
});
