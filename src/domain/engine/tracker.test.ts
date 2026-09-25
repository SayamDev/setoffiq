import { describe, expect, it } from 'vitest';
import type { FlightStatus, Observed } from '../types';
import { trackFlight } from './tracker';

const zone = 'Europe/London';
// 14:30 in Manchester.
const now = Date.UTC(2026, 8, 25, 13, 30);
const minutes = (n: number) => n * 60_000;

function observed(overrides: Partial<FlightStatus>, state: Observed<FlightStatus>['state'] = 'ok'): Observed<FlightStatus> {
  return {
    state,
    value: {
      flightNumber: 'EK21',
      callsign: 'UAE21',
      phase: 'scheduled',
      scheduledArrival: now + minutes(40),
      scheduledDeparture: null,
      estimatedArrival: now + minutes(40),
      estimatedArrivalSource: 'user-schedule',
      position: null,
      observedAt: null,
      ...overrides,
    },
    fetchedAt: now,
    observedAt: now,
    provider: 'test',
    attribution: null,
    message: null,
  };
}

const position = (distanceToAirportKm: number) => ({
  latitude: 53.5,
  longitude: -2.3,
  baroAltitudeM: 3048,
  geoAltitudeM: null,
  groundSpeedMps: 120,
  verticalRateMps: -5,
  onGround: false,
  distanceToAirportKm,
});

describe('the flight tracker', () => {
  it('shows an aircraft in the air with its distance, height, speed and the age of the position', () => {
    const view = trackFlight(
      observed({
        phase: 'airborne',
        position: position(320),
        estimatedArrival: now + minutes(35),
        estimatedArrivalSource: 'live-position',
        observedAt: now - minutes(6),
      }),
      { now, timeZone: zone },
    );
    expect(view.headline).toBe('In the air — 320 km out');
    expect(view.facts).toEqual(['10,000 ft', '268 mph', 'on stand about 15:05, from its position']);
    expect(view.basis).toBe('Aircraft position from adsb.lol as of 14:24 (6 minutes ago).');
    expect(view.steps.find((step) => step.state === 'current')?.id).toBe('airborne');
  });

  it('calls it approaching once it is close', () => {
    const view = trackFlight(observed({ phase: 'airborne', position: position(30) }), { now, timeZone: zone });
    expect(view.headline).toBe('Approaching — 30 km out');
    expect(view.steps.map((step) => step.state)).toEqual(['done', 'done', 'current', 'todo']);
  });

  it('says so when the position is older than it trusts', () => {
    const view = trackFlight(
      observed({ phase: 'airborne', position: position(200), observedAt: now - minutes(50) }, 'stale'),
      { now, timeZone: zone },
    );
    expect(view.basis).toMatch(/older than SetoffIQ trusts/);
  });

  it('gives the actual landing time when the airline schedule has one', () => {
    const view = trackFlight(
      observed({ phase: 'landed', landedAt: now - minutes(8), landedAtSource: 'airline-schedule' }),
      { now, timeZone: zone },
    );
    expect(view.headline).toBe('Landed at 14:22');
    expect(view.tone).toBe('good');
    expect(view.basis).toMatch(/airline schedule/);
  });

  it('says "landed by" the first sighting on the ground — not a touchdown, and not drifting later', () => {
    const view = trackFlight(
      observed({ phase: 'landed', landedAt: now - minutes(1), landedAtSource: 'seen-on-ground' }),
      { now, timeZone: zone, firstSeenLandedAt: now - minutes(12) },
    );
    expect(view.headline).toBe('Landed — on the ground by 14:18');
    expect(view.basis).toMatch(/when it was seen, not when it landed/);
  });

  it('does not claim a flight is missing when it is simply out of range', () => {
    const view = trackFlight(
      observed({ estimatedArrival: now + minutes(55), estimatedArrivalSource: 'airline-schedule' }),
      { now, timeZone: zone },
    );
    expect(view.headline).toBe('Not seen in the air yet');
    expect(view.facts).toEqual(['Scheduled to land 15:10.', 'The airline expects it at 15:25.']);
    expect(view.basis).toMatch(/within about 460 km/);
  });

  it('never names a real source for a simulated flight', () => {
    const view = trackFlight(
      observed({ phase: 'airborne', position: position(68), estimatedArrivalSource: 'scenario' }),
      { now, timeZone: zone },
    );
    expect(view.basis).toBe('Simulated by a test scenario. This is not live information.');
  });

  it('shows no progress for a cancelled flight', () => {
    const view = trackFlight(observed({ phase: 'cancelled' }), { now, timeZone: zone });
    expect(view.headline).toBe('Cancelled');
    expect(view.tone).toBe('alert');
    expect(view.steps).toEqual([]);
  });
});
