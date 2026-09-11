import type { FlightPhase, FlightStatus, Instant, Observed } from '../../domain/types';

/**
 * Clearly-labelled development scenarios.
 *
 * These exist so the failure paths and the monitoring flow can be shown and
 * tested without waiting for a real flight to misbehave. Anything produced
 * here is marked as test data everywhere it appears in the UI, and the
 * scenario picker is only reachable from the diagnostics page.
 */
export interface FlightScenario {
  id: string;
  label: string;
  description: string;
  /** Minutes the estimate differs from the scheduled time. */
  deltaMinutes: number;
  phase: FlightPhase;
  dataState: Observed<FlightStatus>['state'];
  /** How old the underlying observation should appear to be. */
  observationAgeMinutes: number;
  hasPosition: boolean;
}

export const FLIGHT_SCENARIOS: FlightScenario[] = [
  {
    id: 'on-time',
    label: 'On time',
    description: 'Airborne and tracking to the scheduled arrival.',
    deltaMinutes: 0,
    phase: 'airborne',
    dataState: 'ok',
    observationAgeMinutes: 2,
    hasPosition: true,
  },
  {
    id: 'delayed',
    label: 'Delayed by 35 minutes',
    description: 'Airborne, but the position implies a later arrival.',
    deltaMinutes: 35,
    phase: 'airborne',
    dataState: 'ok',
    observationAgeMinutes: 2,
    hasPosition: true,
  },
  {
    id: 'early',
    label: 'Early by 15 minutes',
    description: 'Making up time; the recommendation should move earlier.',
    deltaMinutes: -15,
    phase: 'airborne',
    dataState: 'ok',
    observationAgeMinutes: 3,
    hasPosition: true,
  },
  {
    id: 'landed',
    label: 'Landed',
    description: 'On the ground at Manchester and taxiing.',
    deltaMinutes: -4,
    phase: 'landed',
    dataState: 'ok',
    observationAgeMinutes: 1,
    hasPosition: true,
  },
  {
    id: 'cancelled',
    label: 'Cancelled',
    description: 'No arrival to plan around; monitoring should pause.',
    deltaMinutes: 0,
    phase: 'cancelled',
    dataState: 'ok',
    observationAgeMinutes: 5,
    hasPosition: false,
  },
  {
    id: 'diverted',
    label: 'Diverted',
    description: 'No longer arriving at this airport.',
    deltaMinutes: 0,
    phase: 'diverted',
    dataState: 'ok',
    observationAgeMinutes: 5,
    hasPosition: false,
  },
  {
    id: 'no-flight-data',
    label: 'Flight data unavailable',
    description: 'The position snapshot could not be loaded at all.',
    deltaMinutes: 0,
    phase: 'unknown',
    dataState: 'unavailable',
    observationAgeMinutes: 0,
    hasPosition: false,
  },
  {
    id: 'stale',
    label: 'Stale flight data',
    description: 'The last observation is over an hour old.',
    deltaMinutes: 12,
    phase: 'airborne',
    dataState: 'stale',
    observationAgeMinutes: 74,
    hasPosition: true,
  },
];

export function findScenario(id: string): FlightScenario | null {
  return FLIGHT_SCENARIOS.find((scenario) => scenario.id === id) ?? null;
}

/**
 * Build a flight observation for a scenario. Deterministic given `now` and the
 * scheduled time, so tests and the demo behave identically.
 */
export function scenarioFlightStatus(
  scenario: FlightScenario,
  flightNumber: string | null,
  scheduledArrival: Instant,
  scheduledDeparture: Instant | null,
  now: Instant,
): Observed<FlightStatus> {
  if (scenario.dataState === 'unavailable') {
    return {
      state: 'unavailable',
      value: null,
      fetchedAt: null,
      observedAt: null,
      provider: 'scenario',
      attribution: null,
      message: 'Test scenario: the flight data source is unavailable.',
    };
  }

  const observedAt = now - scenario.observationAgeMinutes * 60_000;
  const estimatedArrival = scheduledArrival + scenario.deltaMinutes * 60_000;

  return {
    state: scenario.dataState,
    value: {
      flightNumber,
      callsign: flightNumber ? `${flightNumber} (test)` : null,
      phase: scenario.phase,
      scheduledArrival,
      scheduledDeparture,
      estimatedArrival,
      estimatedArrivalSource: 'scenario',
      position: scenario.hasPosition
        ? {
            latitude: 53.9,
            longitude: -2.4,
            baroAltitudeM: 4200,
            geoAltitudeM: 4300,
            groundSpeedMps: 190,
            verticalRateMps: -5,
            onGround: scenario.phase === 'landed',
            distanceToAirportKm: scenario.phase === 'landed' ? 1 : 68,
          }
        : null,
      observedAt,
    },
    fetchedAt: now,
    observedAt,
    provider: 'scenario',
    attribution: null,
    message: `Test scenario — ${scenario.label.toLowerCase()}. This is not live information.`,
  };
}
