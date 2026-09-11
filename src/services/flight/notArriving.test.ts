import { afterEach, describe, expect, it } from 'vitest';
import { MANCHESTER } from '../../domain/airports';
import { writeCache } from '../cache';
import { clearAll } from '../storage';
import { estimateArrivalFromPosition, notArrivingReason } from './arrivalEstimate';
import { listInboundAircraft } from './inbound';
import { snapshotFlightProvider } from './snapshotProvider';
import type { FlightSnapshot, SnapshotAircraft } from './snapshotTypes';

const NOW_S = Math.floor(Date.now() / 1000);

function aircraft(overrides: Partial<SnapshotAircraft>): SnapshotAircraft {
  return {
    callsign: 'KLM1071',
    icao24: '484dab',
    latitude: 53.9,
    longitude: -2.4,
    baroAltitudeM: 4000,
    geoAltitudeM: 4100,
    groundSpeedMps: 180,
    verticalRateMps: -6,
    trueTrackDeg: 170,
    onGround: false,
    lastContact: NOW_S,
    ...overrides,
  };
}

/**
 * Recorded from the live snapshot at 15:41Z on 11 September 2026. The inbound
 * picker had offered this aircraft as arriving at Manchester; it was landing
 * at Birmingham, 105 km away.
 */
const EZY930_AT_BIRMINGHAM = aircraft({
  callsign: 'EZY930',
  icao24: '406753',
  latitude: 52.4436,
  longitude: -1.7367,
  baroAltitudeM: 69,
  geoAltitudeM: 198,
  groundSpeedMps: 73,
  verticalRateMps: -3.9,
  trueTrackDeg: null,
});

/** Short final for Liverpool's runway 27, about 28 km west of Manchester. */
const LIVERPOOL_FINAL = aircraft({
  callsign: 'EZY44LP',
  latitude: 53.34,
  longitude: -2.7,
  baroAltitudeM: 420,
  geoAltitudeM: 450,
  groundSpeedMps: 70,
  verticalRateMps: -3.5,
  trueTrackDeg: 270,
});

describe('aircraft that are not arriving at Manchester', () => {
  it('recognises the Birmingham arrival the picker once offered', () => {
    expect(notArrivingReason(EZY930_AT_BIRMINGHAM, MANCHESTER)).toBe('too-low');
    expect(estimateArrivalFromPosition(EZY930_AT_BIRMINGHAM, MANCHESTER)).toBeNull();
  });

  it('recognises an aircraft on final approach to Liverpool', () => {
    expect(notArrivingReason(LIVERPOOL_FINAL, MANCHESTER)).toBe('too-low');
  });

  it('recognises an aircraft far out and flying away', () => {
    // About 90 km north-east, pointing further north-east.
    const leaving = aircraft({ latitude: 54.0, longitude: -1.3, baroAltitudeM: 6000, geoAltitudeM: 6100, trueTrackDeg: 45 });
    expect(notArrivingReason(leaving, MANCHESTER)).toBe('heading-away');
  });

  it('does not judge heading close in, where holds and downwind legs point away', () => {
    // About 35 km north-east at a typical holding level, on the outbound leg.
    const holding = aircraft({ latitude: 53.6, longitude: -1.9, baroAltitudeM: 2100, geoAltitudeM: 2150, trueTrackDeg: 45 });
    expect(notArrivingReason(holding, MANCHESTER)).toBeNull();
    expect(estimateArrivalFromPosition(holding, MANCHESTER)).not.toBeNull();
  });

  it('still accepts an ordinary arrival descending towards the airport', () => {
    const arriving = aircraft({ latitude: 54.3, longitude: -2.6, baroAltitudeM: 5500, geoAltitudeM: 5600, trueTrackDeg: 170 });
    expect(notArrivingReason(arriving, MANCHESTER)).toBeNull();
  });

  it('still accepts snapshots published before heading was captured', () => {
    const { trueTrackDeg: _omitted, ...withoutTrack } = aircraft({});
    expect(notArrivingReason(withoutTrack, MANCHESTER)).toBeNull();
  });

  it('treats an aircraft on the ground at another airfield as elsewhere, not landed', () => {
    const atBelfast = aircraft({ latitude: 54.6575, longitude: -6.2158, onGround: true, baroAltitudeM: null, geoAltitudeM: null, groundSpeedMps: 0 });
    expect(notArrivingReason(atBelfast, MANCHESTER)).toBe('on-ground-elsewhere');
  });
});

describe('what the rest of the app does with them', () => {
  afterEach(() => clearAll());

  function seedSnapshot(list: SnapshotAircraft[]): void {
    const snapshot: FlightSnapshot = {
      generatedAt: new Date().toISOString(),
      airportIcao: 'EGCC',
      source: 'test',
      attribution: 'test',
      radiusKm: 300,
      aircraft: list,
    } as FlightSnapshot;
    writeCache('flight-snapshot:EGCC', snapshot, Date.now());
  }

  it('leaves them out of the inbound picker', async () => {
    const arriving = aircraft({ callsign: 'KLM1071', latitude: 54.3, longitude: -2.6, baroAltitudeM: 5500, geoAltitudeM: 5600 });
    seedSnapshot([EZY930_AT_BIRMINGHAM, LIVERPOOL_FINAL, arriving]);

    const inbound = await listInboundAircraft(MANCHESTER);
    expect(inbound.map((a) => a.callsign)).toEqual(['KLM1071']);
  });

  it('falls back to the scheduled time and says why, for a monitored flight', async () => {
    seedSnapshot([EZY930_AT_BIRMINGHAM]);
    const scheduled = Date.now() + 30 * 60_000;

    const result = await snapshotFlightProvider.getFlightStatus({
      flightNumber: 'U2930',
      airport: MANCHESTER,
      scheduledArrival: scheduled,
      scheduledDeparture: null,
    });

    expect(result.value?.estimatedArrivalSource).toBe('user-schedule');
    expect(result.value?.estimatedArrival).toBe(scheduled);
    expect(result.message).toMatch(/too low to be approaching here/);
    // Wherever it is, it is not at the airport.
    expect(result.value?.position?.distanceToAirportKm).toBeGreaterThan(100);
  });

  it('does not call a flight waiting at its origin landed', async () => {
    const atBelfast = aircraft({ callsign: 'EZY193', latitude: 54.6575, longitude: -6.2158, onGround: true, groundSpeedMps: 0 });
    seedSnapshot([atBelfast]);

    const result = await snapshotFlightProvider.getFlightStatus({
      flightNumber: 'U2193',
      airport: MANCHESTER,
      scheduledArrival: Date.now() + 90 * 60_000,
      scheduledDeparture: null,
    });

    expect(result.value?.phase).toBe('scheduled');
    expect(result.message).toMatch(/on the ground at another airfield/);
  });
});
