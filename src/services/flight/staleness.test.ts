import { afterEach, describe, expect, it } from 'vitest';
import { calculatePickupRecommendation } from '../../domain/engine';
import { MANCHESTER } from '../../domain/airports';
import { writeCache } from '../cache';
import { clearAll } from '../storage';
import { listInboundAircraft, SnapshotTooOldError } from './inbound';
import { snapshotFlightProvider } from './snapshotProvider';
import type { FlightSnapshot, SnapshotAircraft } from './snapshotTypes';

const HOUR = 3_600_000;

function inbound(callsign: string, lastContactMs: number): SnapshotAircraft {
  return {
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
    lastContact: Math.floor(lastContactMs / 1000),
  };
}

function seed(generatedAt: number, aircraft: SnapshotAircraft[]): void {
  writeCache(
    'flight-snapshot:EGCC',
    { generatedAt: new Date(generatedAt).toISOString(), airportIcao: 'EGCC', source: 'test', attribution: 'test', radiusKm: 300, aircraft } as FlightSnapshot,
    Date.now(),
  );
}

describe('old flight data', () => {
  afterEach(() => clearAll());

  // A dev server holding a 22-hour-old snapshot produced "leave now" for a
  // flight from the day before. The same would happen in production if the
  // snapshot job stopped.
  it('is not used to place an aircraft once it is over an hour old', async () => {
    const takenAt = Date.now() - 22 * HOUR;
    seed(takenAt, [inbound('EZY81DL', takenAt)]);
    const scheduled = Date.now() + HOUR;

    const result = await snapshotFlightProvider.getFlightStatus({
      flightNumber: 'EZY81DL',
      airport: MANCHESTER,
      scheduledArrival: scheduled,
      scheduledDeparture: null,
    });

    expect(result.value?.estimatedArrivalSource).toBe('user-schedule');
    expect(result.value?.estimatedArrival).toBe(scheduled);
    expect(result.message).toMatch(/22 hours old/);
  });

  it('is not offered as "in the air now" by the picker', async () => {
    const takenAt = Date.now() - 22 * HOUR;
    seed(takenAt, [inbound('EZY81DL', takenAt)]);
    await expect(listInboundAircraft(MANCHESTER)).rejects.toBeInstanceOf(SnapshotTooOldError);
  });
});

describe('the same flight number on a different day', () => {
  afterEach(() => clearAll());

  it("does not treat tonight's aircraft as tomorrow's flight", async () => {
    seed(Date.now(), [inbound('UAE21', Date.now())]);
    const tomorrow = Date.now() + 24 * HOUR;

    const result = await snapshotFlightProvider.getFlightStatus({
      flightNumber: 'EK21',
      airport: MANCHESTER,
      scheduledArrival: tomorrow,
      scheduledDeparture: null,
    });

    expect(result.value?.estimatedArrivalSource).toBe('user-schedule');
    expect(result.value?.estimatedArrival).toBe(tomorrow);
    expect(result.message).toMatch(/different day's flight/);
  });

  it('still uses it for a flight due today', async () => {
    seed(Date.now(), [inbound('UAE21', Date.now())]);
    const result = await snapshotFlightProvider.getFlightStatus({
      flightNumber: 'EK21',
      airport: MANCHESTER,
      scheduledArrival: Date.now() + 30 * 60_000,
      scheduledDeparture: null,
    });
    expect(result.value?.estimatedArrivalSource).toBe('live-position');
  });
});

describe('explicit aircraft links and changing observations', () => {
  afterEach(() => clearAll());
  it('does not invent the RK1712 to RUK87AL association, but uses an explicit user link', async () => {
    const now = Date.now();
    seed(now, [inbound('RUK87AL', now)]);
    const input = { flightNumber: 'RK1712', airport: MANCHESTER, scheduledArrival: now + 30 * 60_000, scheduledDeparture: null };
    expect((await snapshotFlightProvider.getFlightStatus(input)).value?.position).toBeNull();
    const linked = await snapshotFlightProvider.getFlightStatus({ ...input, trackingCallsign: 'RUK87AL' });
    expect(linked.value?.flightNumber).toBe('RK1712');
    expect(linked.value?.callsign).toBe('RUK87AL');
    expect(linked.value?.estimatedArrivalSource).toBe('live-position');
  });
  it('recalculates deterministically when a newer matched position arrives', async () => {
    const now = Date.now();
    const input = { flightNumber: 'RK1712', trackingCallsign: 'RUK87AL', airport: MANCHESTER, scheduledArrival: now + 30 * 60_000, scheduledDeparture: null };
    seed(now, [{ ...inbound('RUK87AL', now), latitude: 54.5 }]);
    const first = await snapshotFlightProvider.getFlightStatus(input);
    seed(now, [inbound('RUK87AL', now)]);
    const next = await snapshotFlightProvider.getFlightStatus(input);
    expect(next.value?.estimatedArrival).toBeLessThan(first.value!.estimatedArrival!);
    expect(next.value?.scheduledArrival).toBe(input.scheduledArrival);
    const empty = { state: 'unavailable' as const, value: null, fetchedAt: null, observedAt: null };
    const engineInput = { now, journeyKind: 'pickup' as const, airport: MANCHESTER, passengerRoute: 'international' as const, scheduledArrival: input.scheduledArrival, mode: 'quick-pickup' as const, distanceKm: 20, route: empty, weather: empty, airportConditions: empty, roadDisruption: empty };
    const previousPlan = calculatePickupRecommendation({ ...engineInput, flight: first });
    const updatedPlan = calculatePickupRecommendation({ ...engineInput, flight: next });
    if (previousPlan.kind !== 'pickup' || updatedPlan.kind !== 'pickup') throw new Error('Expected pickup recommendations');
    expect(updatedPlan.recommendedDeparture).toBeLessThan(previousPlan.recommendedDeparture);

    expect((await snapshotFlightProvider.getFlightStatus(input)).value?.estimatedArrival).toBe(next.value?.estimatedArrival);
  });
  it.each([-120, 10])('rejects a %s minute position even when the file was published now', async offset => {
    const now = Date.now();
    seed(now, [inbound('RUK87AL', now + offset * 60_000)]);
    const result = await snapshotFlightProvider.getFlightStatus({ flightNumber: 'RK1712', trackingCallsign: 'RUK87AL', airport: MANCHESTER, scheduledArrival: now + 30 * 60_000, scheduledDeparture: null });
    expect(result.value?.estimatedArrivalSource).toBe('user-schedule');
    expect(result.value?.position).toBeNull();
    expect(result.message).toMatch(/invalid timestamp/);
  });
  it('still rejects a linked aircraft on a different day', async () => {
    seed(Date.now(), [inbound('RUK87AL', Date.now())]);
    const result = await snapshotFlightProvider.getFlightStatus({ flightNumber: 'RK1712', trackingCallsign: 'RUK87AL', airport: MANCHESTER, scheduledArrival: Date.now() + 24 * HOUR, scheduledDeparture: null });
    expect(result.value?.position).toBeNull();
    expect(result.message).toMatch(/different day/);
  });
});
