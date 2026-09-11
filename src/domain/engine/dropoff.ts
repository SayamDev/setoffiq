import { departureBufferFor } from '../airports';
import { ASSUMPTION_LABEL } from '../assumptions';
import { addMinutes, formatClock, formatMinuteRange } from '../time';
import type {
  DropoffOption,
  DropoffRecommendation,
  RecommendationFactor,
  RecommendationResult,
} from '../types';
import { buildDropoffAdvisory } from './advisory';
import { assessConfidence } from './confidence';
import type { DropoffEngineInput } from './inputs';
import { estimateJourney } from './journeyWindow';
import { buildSignalReports } from './signalReports';

/**
 * The drop-off calculation.
 *
 *   terminal arrival target = flight departure − check-in buffer (upper bound)
 *   airport arrival target  = terminal arrival target − parking/walking buffer
 *   departure               = airport arrival target − slowest plausible journey
 *
 * The check-in buffer is a SetoffIQ assumption. Manchester Airport does not
 * publish a recommended arrival time; the airline sets bag-drop deadlines, and
 * the UI says so rather than implying this figure is official.
 */
export function calculateDropoffRecommendation(input: DropoffEngineInput): RecommendationResult {
  const { airport, now } = input;
  const flight = input.flight.value;

  if (flight?.phase === 'cancelled') {
    return {
      kind: 'unavailable',
      computedAt: now,
      headline: 'This flight is showing as cancelled',
      detail:
        'There is no departure to plan around. Check with the airline before setting off, and monitoring for this journey has been paused.',
    };
  }

  const flightDeparture = flight?.scheduledDeparture ?? input.scheduledDeparture;
  const option = findDropoffOption(input);
  const buffer = departureBufferFor(airport, input.passengerRoute).recommended;

  const targetTerminalArrival = addMinutes(flightDeparture, -buffer.maxMinutes);
  const targetAirportArrival = addMinutes(targetTerminalArrival, -option.terminalBufferMinutes);

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
  const terminalArrivalWindow = {
    earliest: addMinutes(airportArrivalWindow.earliest, option.terminalBufferMinutes),
    latest: addMinutes(airportArrivalWindow.latest, option.terminalBufferMinutes),
  };

  const signals = buildSignalReports(input, journey, buffer);

  return {
    kind: 'dropoff',
    computedAt: now,
    mode: input.mode,
    flightDeparture,
    recommendedDeparture,
    airportArrivalWindow,
    terminalArrivalWindow,
    departureBuffer: buffer,
    journey: journey.range,
    signals,
    confidence: assessConfidence(signals, now, flightDeparture),
    advisory: buildDropoffAdvisory(
      now,
      recommendedDeparture,
      terminalArrivalWindow,
      airport.timeZone,
    ),
    factors: buildFactors(input, journey.uncertaintyReasons, option),
  } satisfies DropoffRecommendation;
}

function findDropoffOption(input: DropoffEngineInput): DropoffOption {
  const option = input.airport.dropoffOptions.find((candidate) => candidate.id === input.mode);
  if (!option) throw new Error(`Unknown drop-off mode ${input.mode} at ${input.airport.iataCode}`);
  return option;
}

function buildFactors(
  input: DropoffEngineInput,
  journeyReasons: string[],
  option: DropoffOption,
): RecommendationFactor[] {
  const zone = input.airport.timeZone;
  const buffer = departureBufferFor(input.airport, input.passengerRoute).recommended;
  const routed = input.route.state !== 'unavailable' && input.route.value !== null;
  const weather = input.weather.value;

  return [
    {
      id: 'flight',
      label: 'Flight',
      value: `Departs ${formatClock(input.scheduledDeparture, zone)}`,
      detail: 'The departure time you entered from your booking.',
      basis: 'user-supplied',
    },
    {
      id: 'check-in',
      label: 'Time at the terminal',
      value: formatMinuteRange(buffer),
      detail: `${ASSUMPTION_LABEL} for bag drop and security on ${input.passengerRoute === 'international' ? 'an international' : 'a domestic'} departure. Manchester Airport does not publish a recommended arrival time — your airline sets the deadlines, so check your ticket.`,
      basis: 'assumption',
    },
    {
      id: 'journey',
      label: 'Your drive',
      value: routed ? 'Routed over real roads' : 'Estimated from distance',
      detail: journeyReasons.join(' '),
      basis: routed ? 'live-data' : 'assumption',
    },
    {
      id: 'weather',
      label: 'Weather',
      value: weather ? weather.description : 'Unavailable',
      detail: weather
        ? weather.severity === 'clear'
          ? 'Conditions are not adding extra uncertainty to the drive.'
          : 'Conditions widen the upper end of the journey estimate.'
        : 'Weather could not be checked, so it is not reflected in this recommendation.',
      basis: weather ? 'live-data' : 'unavailable',
    },
    {
      id: 'mode',
      label: option.label,
      value: `${option.terminalBufferMinutes} min at the airport`,
      detail: `${ASSUMPTION_LABEL} for getting from arriving at the airport to the terminal door.`,
      basis: 'assumption',
    },
  ];
}
