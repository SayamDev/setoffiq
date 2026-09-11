import { processingProfileFor } from '../airports';
import { ASSUMPTION_LABEL } from '../assumptions';
import { addMinutes, addRanges, formatClock, formatMinuteRange, minutesBetween } from '../time';
import type {
  PassengerReadinessEstimate,
  PickupOption,
  PickupRecommendation,
  RecommendationFactor,
  RecommendationResult,
} from '../types';
import { buildPickupAdvisory } from './advisory';
import { assessConfidence } from './confidence';
import type { PickupEngineInput } from './inputs';
import { estimateJourney } from './journeyWindow';
import { buildSignalReports } from './signalReports';
import { assessReadinessStage } from './stages';

/**
 * The pickup calculation.
 *
 *   landing            = live estimate if we have one, otherwise the schedule
 *   readiness window   = landing + disembarkation + border + baggage + walking
 *   airport arrival    = readiness.earliest − parking/walking buffer
 *   departure          = airport arrival − the *slowest* plausible journey
 *
 * Using the slow end of the journey for the departure time is the whole point:
 * it means the driver's worst case lands on the passenger's best case, so the
 * driver is rarely early enough to wait around and rarely late enough that the
 * passenger does.
 *
 * Deterministic: no clocks, no randomness, no network. Same input, same output.
 */
export function calculatePickupRecommendation(input: PickupEngineInput): RecommendationResult {
  const { airport, now } = input;
  const flight = input.flight.value;

  if (flight?.phase === 'cancelled') {
    return {
      kind: 'unavailable',
      computedAt: now,
      headline: 'This flight is showing as cancelled',
      detail:
        'There is no arrival to plan around. Check with the airline before setting off, and monitoring for this journey has been paused.',
    };
  }

  if (flight?.phase === 'diverted') {
    return {
      kind: 'unavailable',
      computedAt: now,
      headline: 'This flight has been diverted',
      detail: `The aircraft is no longer expected at ${airport.name}, so a pickup recommendation for this airport would be misleading. Check with the airline for where and when your passenger will arrive.`,
    };
  }

  const landing = flight?.estimatedArrival ?? input.scheduledArrival;
  const option = findPickupOption(input);
  const profile = processingProfileFor(airport, input.passengerRoute);
  const processing = addRanges(
    profile.disembarkation,
    profile.borderControl,
    profile.baggage,
    profile.terminalWalk,
  );

  const readiness: PassengerReadinessEstimate = {
    window: {
      earliest: addMinutes(landing, processing.minMinutes),
      latest: addMinutes(landing, processing.maxMinutes),
    },
    processing,
    landing,
    route: input.passengerRoute,
  };

  const targetAirportArrival = addMinutes(readiness.window.earliest, -option.meetingBufferMinutes);
  const journey = estimateJourney(
    input.route,
    input.weather,
    input.distanceKm,
    targetAirportArrival,
    airport.timeZone,
  );

  const recommendedDeparture = addMinutes(targetAirportArrival, -journey.range.maxMinutes);
  const airportArrivalWindow = {
    earliest: addMinutes(recommendedDeparture, journey.range.minMinutes),
    latest: addMinutes(recommendedDeparture, journey.range.maxMinutes),
  };

  const signals = buildSignalReports(input, journey, processing);

  return {
    kind: 'pickup',
    computedAt: now,
    mode: input.mode,
    recommendedDeparture,
    airportArrivalWindow,
    journey: journey.range,
    readiness,
    progress: assessReadinessStage(flight ?? null, landing, processing, now),
    signals,
    confidence: assessConfidence(signals, now, landing),
    advisory: buildPickupAdvisory(now, recommendedDeparture, readiness.window, airport.timeZone),
    factors: buildFactors(input, journey.uncertaintyReasons, option),
  } satisfies PickupRecommendation;
}

function findPickupOption(input: PickupEngineInput): PickupOption {
  const option = input.airport.pickupOptions.find((candidate) => candidate.id === input.mode);
  if (!option) throw new Error(`Unknown pickup mode ${input.mode} at ${input.airport.iataCode}`);
  return option;
}

function buildFactors(
  input: PickupEngineInput,
  journeyReasons: string[],
  option: PickupOption,
): RecommendationFactor[] {
  const { airport } = input;
  const zone = airport.timeZone;
  const flight = input.flight.value;
  const profile = processingProfileFor(airport, input.passengerRoute);
  const processing = addRanges(
    profile.disembarkation,
    profile.borderControl,
    profile.baggage,
    profile.terminalWalk,
  );
  const factors: RecommendationFactor[] = [];

  const source = flight?.estimatedArrivalSource ?? null;

  if (flight?.estimatedArrival && (source === 'live-position' || source === 'scenario')) {
    const delta = minutesBetween(input.scheduledArrival, flight.estimatedArrival);
    const difference =
      delta === 0
        ? 'in line with your scheduled time'
        : `${Math.abs(delta)} min ${delta > 0 ? 'later' : 'earlier'} than the time you entered`;
    factors.push({
      id: 'flight',
      label: 'Flight',
      value: `Estimated landing ${formatClock(flight.estimatedArrival, zone)}`,
      detail:
        source === 'scenario'
          ? `Simulated by a test scenario — ${difference}. This is not live information.`
          : `Estimated from the aircraft position — ${difference}.`,
      // A test scenario is not live data and is never presented as though it is.
      basis: source === 'scenario' ? 'assumption' : 'live-data',
    });
  } else {
    factors.push({
      id: 'flight',
      label: 'Flight',
      value: `Scheduled landing ${formatClock(input.scheduledArrival, zone)}`,
      detail:
        'No live position was available for this flight, so the scheduled time you entered is being used as-is.',
      basis: 'user-supplied',
    });
  }

  factors.push({
    id: 'processing',
    label: 'Getting through the airport',
    value: formatMinuteRange(processing),
    detail: `${ASSUMPTION_LABEL} for ${input.passengerRoute === 'international' ? 'an international' : 'a domestic'} arrival: leaving the aircraft, ${input.passengerRoute === 'international' ? 'border control, ' : ''}bags and the walk out.`,
    basis: 'assumption',
  });

  const routed = input.route.state !== 'unavailable' && input.route.value !== null;
  factors.push({
    id: 'journey',
    label: 'Your drive',
    value: routed ? 'Routed over real roads' : 'Estimated from distance',
    detail: journeyReasons.join(' '),
    basis: routed ? 'live-data' : 'assumption',
  });

  const weather = input.weather.value;
  factors.push({
    id: 'weather',
    label: 'Weather',
    value: weather ? weather.description : 'Unavailable',
    detail: weather
      ? weather.severity === 'clear'
        ? 'Conditions are not adding extra uncertainty to the drive.'
        : 'Conditions widen the upper end of the journey estimate.'
      : 'Weather could not be checked, so it is not reflected in this recommendation.',
    basis: weather ? 'live-data' : 'unavailable',
  });

  factors.push({
    id: 'mode',
    label: option.label,
    value: `${option.meetingBufferMinutes} min at the airport`,
    detail: `${ASSUMPTION_LABEL} for getting from arriving at the airport to where you will meet your passenger.`,
    basis: 'assumption',
  });

  return factors;
}
