import { FLIGHT_SNAPSHOT_STALE_AFTER_MINUTES } from '../assumptions';
import type { SignalImpact, SignalReport, SignalState } from '../signals';
import { formatMinuteRange, minutesBetween } from '../time';
import type { MinuteRange } from '../types';
import type { JourneyEngineInput } from './inputs';
import type { JourneyEstimate } from './journeyWindow';

/**
 * What counts as stale depends entirely on how often the source publishes.
 * An aircraft position is minutes old or it is useless; an aerodrome
 * observation is issued roughly hourly, so a forty-minute-old METAR is simply
 * the current one. Applying the aircraft threshold to everything marked normal
 * data as stale and dragged confidence down for no reason.
 */
const STALE_AFTER_MINUTES = {
  /** Positions are sampled continuously; the snapshot job sets the cadence. */
  flight: FLIGHT_SNAPSHOT_STALE_AFTER_MINUTES,
  /** METARs are issued hourly, half-hourly when conditions change. */
  airportConditions: 120,
  /** Hourly forecast buckets. */
  weather: 120,
  /** The snapshot job runs every fifteen minutes. */
  road: 60,
  /** The airline schedule is refreshed every four and a half hours. */
  schedule: 300,
} as const;

function ageState(
  observedAt: number | null,
  now: number,
  staleAfterMinutes: number,
): SignalState {
  if (observedAt === null) return { kind: 'assumed' };
  const ageMinutes = -minutesBetween(now, observedAt);
  return ageMinutes > staleAfterMinutes
    ? { kind: 'stale', observedAt, ageMinutes }
    : { kind: 'live', observedAt };
}

/**
 * Describe each input to the recommendation in its own terms.
 *
 * This is what the user sees under "What's affecting your timing?", and it is
 * also what confidence is derived from — so the score can never disagree with
 * the table explaining it.
 */
export function buildSignalReports(
  input: JourneyEngineInput,
  journey: JourneyEstimate,
  processing: MinuteRange,
): SignalReport[] {
  const reports: SignalReport[] = [];

  // --- The flight -----------------------------------------------------------
  const flight = input.flight.value;
  if (input.flight.state === 'unavailable' || !flight) {
    reports.push({
      id: 'flight',
      label: 'Flight',
      // A drop-off is planned around the departure time on the ticket, which we
      // have. Nothing is missing, so nothing is reported as missing.
      state:
        input.journeyKind === 'pickup'
          ? { kind: 'unavailable', reason: 'No live flight information could be retrieved.' }
          : { kind: 'user-supplied' },
      summary:
        input.journeyKind === 'pickup'
          ? 'Working from the scheduled time you entered.'
          : 'Working from the departure time on your booking.',
      impact: input.journeyKind === 'pickup' ? 'high' : 'none',
    });
  } else if (flight.position && flight.estimatedArrivalSource === 'live-position') {
    reports.push({
      id: 'flight',
      label: 'Flight',
      state: ageState(input.flight.observedAt, input.now, STALE_AFTER_MINUTES.flight),
      summary: `Aircraft seen ${flight.position.distanceToAirportKm} km out; arrival estimated from its position.`,
      impact: 'none',
    });
  } else if (flight.estimatedArrivalSource === 'airline-schedule') {
    reports.push({
      id: 'flight',
      label: 'Flight',
      state: ageState(input.flight.observedAt, input.now, STALE_AFTER_MINUTES.schedule),
      summary: "The airline schedule's estimate, until the aircraft is close enough to time from its position.",
      impact: 'none',
    });
  } else if (flight.estimatedArrivalSource === 'scenario') {
    reports.push({
      id: 'flight',
      label: 'Flight',
      state: { kind: 'assumed' },
      summary: 'Simulated by a test scenario. This is not live information.',
      impact: 'moderate',
    });
  } else {
    reports.push({
      id: 'flight',
      label: 'Flight',
      state: { kind: 'user-supplied' },
      summary:
        input.journeyKind !== 'pickup'
          ? 'The departure time on your booking.'
          : flight.position
            ? // Found, but too low, pointing away or on the ground elsewhere —
              // "no aircraft found" would be untrue.
              'The aircraft was found, but it does not look like it is arriving here, so your scheduled time is used as-is.'
            : 'No aircraft found for this flight number, so your scheduled time is used as-is.',
      impact: input.journeyKind === 'pickup' ? 'moderate' : 'none',
    });
  }

  // --- Conditions at the airport -------------------------------------------
  const conditions = input.airportConditions?.value ?? null;
  if (!conditions) {
    reports.push({
      id: 'airport-conditions',
      label: 'Airport conditions',
      state: { kind: 'unavailable', reason: 'No airport observation available.' },
      summary: 'Conditions at the airport could not be checked.',
      impact: 'low',
    });
  } else {
    const poor = conditions.flightCategory === 'IFR' || conditions.flightCategory === 'LIFR';
    reports.push({
      id: 'airport-conditions',
      label: 'Airport conditions',
      state: ageState(
        input.airportConditions?.observedAt ?? null,
        input.now,
        STALE_AFTER_MINUTES.airportConditions,
      ),
      summary: poor
        ? `${conditions.summary}. Low-visibility conditions can slow the rate arrivals are landed.`
        : conditions.summary,
      impact: poor ? 'moderate' : 'none',
    });
  }

  // --- Weather on the journey ----------------------------------------------
  const weather = input.weather.value;
  if (!weather) {
    reports.push({
      id: 'journey-weather',
      label: 'Weather',
      state: { kind: 'unavailable', reason: 'Forecast unavailable.' },
      summary: 'Not reflected in the journey estimate.',
      impact: 'low',
    });
  } else {
    reports.push({
      id: 'journey-weather',
      label: 'Weather',
      // A forecast is fresh by when it was retrieved, not by the hour it
      // describes — that hour is in the future, and showing it as an
      // observation time reads as a timestamp from the future.
      state: ageState(input.weather.fetchedAt, input.now, STALE_AFTER_MINUTES.weather),
      summary:
        weather.severity === 'clear'
          ? `${weather.description}. Not adding to the journey estimate.`
          : `${weather.description}. Widening the slower end of the drive.`,
      impact: weather.severity === 'poor' ? 'moderate' : weather.severity === 'moderate' ? 'low' : 'none',
    });
  }

  // --- The drive ------------------------------------------------------------
  const spread = journey.baseMinutes > 0
    ? (journey.range.maxMinutes - journey.range.minMinutes) / journey.baseMinutes
    : 0;
  const routeImpact: SignalImpact = !journey.routed ? 'high' : spread > 0.3 ? 'moderate' : 'low';
  reports.push({
    id: 'route',
    label: 'Route',
    state: journey.routed ? { kind: 'live', observedAt: input.now } : { kind: 'assumed' },
    summary: journey.routed
      ? `${formatMinuteRange(journey.range)}, routed over real roads. No live traffic data exists in this source, so the slower end carries that allowance.`
      : `${formatMinuteRange(journey.range)}, estimated from straight-line distance because no routing service answered.`,
    impact: routeImpact,
  });

  // --- The road ------------------------------------------------------------
  const roads = input.roadDisruption.value;
  if (!roads) {
    reports.push({
      id: 'road-disruption',
      label: 'Road disruption',
      state: { kind: 'not-configured', reason: 'No source configured.' },
      // Not knowing must never be reported as "the roads are clear".
      summary:
        'Not checked — every free UK source for this requires a registered key. Absence of information here is not evidence the roads are clear.',
      impact: 'none',
    });
  } else if (input.roadDisruption.state === 'stale') {
    reports.push({
      id: 'road-disruption',
      label: 'Road disruption',
      state: ageState(roads.generatedAt, input.now, STALE_AFTER_MINUTES.road),
      summary: 'Road information is too old to use in this departure estimate. Check live traffic before leaving.',
      impact: 'moderate',
    });
  } else if (roads.disruptions.length === 0) {
    reports.push({
      id: 'road-disruption',
      label: 'Road disruption',
      state: { kind: 'live', observedAt: roads.generatedAt },
      summary: 'No current closure or incident reported on National Highways roads near the airport. Local roads are not covered.',
      impact: 'none',
    });
  } else {
    const onRoute = roads.disruptions.filter((entry) => entry.routeMatch === 'on-route');
    const disruptive = onRoute.filter(
      (entry) => entry.active && (entry.category === 'closure' || entry.category === 'incident'),
    );
    const headline = disruptive[0] ?? onRoute[0] ?? roads.disruptions[0]!;
    const closures = disruptive.filter((entry) => entry.category === 'closure').length;

    reports.push({
      id: 'road-disruption',
      label: 'Road disruption',
      state: { kind: 'live', observedAt: roads.generatedAt },
      summary: disruptive.length
        ? `${headline.road}: ${headline.description}. On or very close to your route; widening the drive estimate.${disruptive.length > 1 ? ` ${disruptive.length - 1} more route disruptions reported.` : ''}`
        : onRoute.length > 0
          ? `${onRoute.length} roadworks reported on or very close to your route, none currently closing a road. No extra time added.`
          : `${roads.disruptions.length} disruption${roads.disruptions.length === 1 ? '' : 's'} reported near the airport, but none confirmed on your route. No extra time added.`,
      impact: closures > 0 ? 'high' : disruptive.length > 0 ? 'moderate' : 'none',
    });
  }

  // --- Getting through the airport -----------------------------------------
  /*
   * The same signal means different things either side of the journey: on
   * arrival it is border control, bags and the walk out; on departure it is bag
   * drop and security. Reusing the arrival wording on a drop-off named the
   * wrong thing.
   */
  const isPickup = input.journeyKind === 'pickup';
  reports.push({
    id: 'processing',
    label: isPickup ? 'Getting out of the airport' : 'Time at the terminal',
    state: { kind: 'assumed' },
    summary: isPickup
      ? `${formatMinuteRange(processing)} — a SetoffIQ assumption. No source publishes live border or baggage queues.`
      : `${formatMinuteRange(processing)} — a SetoffIQ assumption for bag drop and security. Your airline sets the actual deadlines.`,
    impact: 'moderate',
  });

  return reports;
}
