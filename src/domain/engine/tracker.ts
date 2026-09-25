import { formatClock, formatRelative } from '../time';
import type { FlightStatus, Instant, Observed } from '../types';

/**
 * The flight, as a tracker: where the aircraft is, and whether it has landed.
 *
 * This says only what the data says. A position is a position, with its age;
 * "landed" comes with where the time came from, because the free sources give
 * two different things — the airline schedule's actual touchdown, or merely
 * the first time the aircraft was seen on the ground here, which is "landed
 * by", not "landed at".
 */

/** Within this distance an arriving aircraft is on its approach. */
export const APPROACH_WITHIN_KM = 50;

export type TrackerStepId = 'scheduled' | 'airborne' | 'approaching' | 'landed';

export interface TrackerStep {
  id: TrackerStepId;
  label: string;
  state: 'done' | 'current' | 'todo';
}

export interface TrackerView {
  tone: 'neutral' | 'active' | 'good' | 'alert';
  headline: string;
  facts: string[];
  /** Where this came from and how old it is. Always shown. */
  basis: string;
  /** Empty for a cancelled or diverted flight: there is no progress to show. */
  steps: TrackerStep[];
}

const STEP_LABELS: Record<TrackerStepId, string> = {
  scheduled: 'Scheduled',
  airborne: 'In the air',
  approaching: 'Approaching',
  landed: 'Landed',
};
const ORDER: TrackerStepId[] = ['scheduled', 'airborne', 'approaching', 'landed'];

function steps(current: TrackerStepId): TrackerStep[] {
  const at = ORDER.indexOf(current);
  return ORDER.map((id, index) => ({
    id,
    label: STEP_LABELS[id],
    state: index < at ? 'done' : index === at ? 'current' : 'todo',
  }));
}

const feet = (metres: number): number => Math.round((metres * 3.28084) / 100) * 100;
const mph = (metresPerSecond: number): number => Math.round(metresPerSecond * 2.23694);

export function trackFlight(
  flight: Observed<FlightStatus>,
  options: Parameters<typeof describe>[1],
): TrackerView {
  const view = describe(flight, options);
  // A test scenario must never be passed off as a real source.
  return flight.value?.estimatedArrivalSource === 'scenario'
    ? { ...view, basis: 'Simulated by a test scenario. This is not live information.' }
    : view;
}

function describe(
  flight: Observed<FlightStatus>,
  options: {
    now: Instant;
    timeZone: string;
    /**
     * The first time a check saw this flight landed. A seen-on-ground time is
     * refreshed on every check, so without this "landed by" would drift later
     * each time the page looked.
     */
    firstSeenLandedAt?: Instant | null;
  },
): TrackerView {
  const { now, timeZone } = options;
  const status = flight.value;
  const clock = (at: Instant): string => formatClock(at, timeZone);
  const age = (at: Instant | null): string =>
    at === null ? '' : ` as of ${clock(at)} (${formatRelative(at, now)})`;
  const staleNote =
    flight.state === 'stale' ? ' That is older than SetoffIQ trusts for a live position.' : '';

  if (!status || flight.state === 'unavailable') {
    return {
      tone: 'neutral',
      headline: 'No flight information right now',
      facts: [],
      basis: flight.message ?? 'The flight data could not be loaded. Your scheduled time is used as-is.',
      steps: steps('scheduled'),
    };
  }

  const name = status.flightNumber ?? 'This flight';

  if (status.phase === 'cancelled') {
    return {
      tone: 'alert',
      headline: 'Cancelled',
      facts: [`The airline schedule lists ${name} as cancelled.`],
      basis: 'From the airline schedule (AirLabs). Check with the airline before you set off.',
      steps: [],
    };
  }

  if (status.phase === 'diverted') {
    return {
      tone: 'alert',
      headline: 'Diverted',
      facts: [`${name} does not appear to be coming to this airport.`],
      basis: 'Check with the airline for where it is landing instead.',
      steps: [],
    };
  }

  if (status.phase === 'landed') {
    const fromSchedule = status.landedAtSource === 'airline-schedule' && status.landedAt;
    const seenBy = options.firstSeenLandedAt ?? status.landedAt ?? null;
    return {
      tone: 'good',
      headline: fromSchedule
        ? `Landed at ${clock(status.landedAt as Instant)}`
        : seenBy !== null
          ? `Landed — on the ground by ${clock(seenBy)}`
          : 'Landed',
      facts: [
        'Landing is not the same as your passenger being ready: allow for taxiing, getting off, and bags or border control.',
      ],
      basis: fromSchedule
        ? 'Actual landing time from the airline schedule (AirLabs).'
        : seenBy !== null
          ? `First seen on the ground at this airport at ${clock(seenBy)}. The exact touchdown time is not published free, so this is when it was seen, not when it landed.`
          : 'Reported as landed.',
      steps: steps('landed'),
    };
  }

  const position = status.position;
  if (status.phase === 'airborne' && position) {
    const approaching = position.distanceToAirportKm <= APPROACH_WITHIN_KM;
    const facts: string[] = [];
    if (position.baroAltitudeM !== null) facts.push(`${feet(position.baroAltitudeM).toLocaleString('en-GB')} ft`);
    if (position.groundSpeedMps !== null) facts.push(`${mph(position.groundSpeedMps)} mph`);
    if (status.estimatedArrival !== null && status.estimatedArrivalSource === 'live-position') {
      facts.push(`on stand about ${clock(status.estimatedArrival)}, from its position`);
    }
    return {
      tone: 'active',
      headline: approaching
        ? `Approaching — ${position.distanceToAirportKm} km out`
        : `In the air — ${position.distanceToAirportKm} km out`,
      facts,
      basis: `Aircraft position from adsb.lol${age(status.observedAt)}.${staleNote}`,
      steps: steps(approaching ? 'approaching' : 'airborne'),
    };
  }

  // Not seen in the air. That is not the same as not flying: SetoffIQ only
  // sees aircraft within about 460 km of the airport.
  const facts: string[] = [];
  if (status.scheduledArrival !== null) facts.push(`Scheduled to land ${clock(status.scheduledArrival)}.`);
  if (status.estimatedArrivalSource === 'airline-schedule' && status.estimatedArrival !== null) {
    facts.push(`The airline expects it at ${clock(status.estimatedArrival)}.`);
  }
  return {
    tone: 'neutral',
    headline: status.flightNumber ? 'Not seen in the air yet' : 'No flight number to track',
    facts,
    basis: status.flightNumber
      ? 'SetoffIQ can see the aircraft once it is within about 460 km of this airport. Until then it works from the schedule.'
      : 'Add the flight number to the journey to see the aircraft once it is close.',
    steps: steps('scheduled'),
  };
}
