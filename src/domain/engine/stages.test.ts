import { describe, expect, it } from 'vitest';
import { assessReadinessStage, stageLabel } from './stages';
import { manTime } from '../../test/factories';
import type { FlightStatus, MinuteRange } from '../types';

const PROCESSING: MinuteRange = { minMinutes: 24, maxMinutes: 67 };
const LANDING = manTime(18, 20);

function status(overrides: Partial<FlightStatus>): FlightStatus {
  return {
    flightNumber: 'KL1038',
    callsign: 'KLM1038',
    phase: 'airborne',
    scheduledArrival: LANDING,
    scheduledDeparture: null,
    estimatedArrival: LANDING,
    estimatedArrivalSource: 'live-position',
    position: null,
    observedAt: LANDING,
    ...overrides,
  };
}

function position(distanceToAirportKm: number, onGround = false): FlightStatus['position'] {
  return {
    latitude: 53.9,
    longitude: -2.4,
    baroAltitudeM: 4000,
    geoAltitudeM: 4100,
    groundSpeedMps: 180,
    verticalRateMps: -6,
    onGround,
    distanceToAirportKm,
  };
}

describe('readiness stages', () => {
  it('is scheduled before the aircraft has been seen', () => {
    const progress = assessReadinessStage(
      status({ phase: 'scheduled', position: null }),
      LANDING,
      PROCESSING,
      manTime(16, 0),
    );
    expect(progress.stage).toBe('scheduled');
    expect(progress.observed).toBe(false);
  });

  it('is airborne when seen in the air a long way out', () => {
    const progress = assessReadinessStage(
      status({ position: position(300) }),
      LANDING,
      PROCESSING,
      manTime(17, 0),
    );
    expect(progress.stage).toBe('airborne');
    expect(progress.observed).toBe(true);
  });

  it('becomes approaching once it is close', () => {
    const progress = assessReadinessStage(
      status({ position: position(60) }),
      LANDING,
      PROCESSING,
      manTime(18, 0),
    );
    expect(progress.stage).toBe('approaching');
    expect(progress.observed).toBe(true);
    expect(progress.detail).toContain('60 km');
  });

  it('is disembarking just after landing, and marks it observed', () => {
    const progress = assessReadinessStage(
      status({ phase: 'landed', position: position(1, true) }),
      LANDING,
      PROCESSING,
      manTime(18, 30),
    );
    expect(progress.stage).toBe('disembarking');
    expect(progress.observed).toBe(true);
  });

  it('becomes ready only once the processing window opens, and says it is inferred', () => {
    // A landed flight is not a ready passenger — the gap is the product.
    const justLanded = assessReadinessStage(
      status({ phase: 'landed' }),
      LANDING,
      PROCESSING,
      manTime(18, 35),
    );
    expect(justLanded.stage).toBe('disembarking');

    const ready = assessReadinessStage(
      status({ phase: 'landed' }),
      LANDING,
      PROCESSING,
      manTime(18, 50),
    );
    expect(ready.stage).toBe('ready');
    // Nothing observes a passenger leaving the terminal, so this must not
    // claim to be observed.
    expect(ready.observed).toBe(false);
  });

  it('does not track a cancelled or diverted flight', () => {
    for (const phase of ['cancelled', 'diverted'] as const) {
      const progress = assessReadinessStage(status({ phase }), LANDING, PROCESSING, manTime(18, 0));
      expect(progress.stage).toBe('unknown');
      expect(progress.observed).toBe(true);
    }
  });

  it('reports unknown when there is no flight information at all', () => {
    const progress = assessReadinessStage(null, LANDING, PROCESSING, manTime(16, 0));
    expect(progress.stage).toBe('unknown');
    expect(progress.observed).toBe(false);
  });

  it('labels every stage', () => {
    expect(stageLabel('disembarking')).toBe('Getting through the airport');
    expect(stageLabel('ready')).toBe('Could be ready');
  });
});
