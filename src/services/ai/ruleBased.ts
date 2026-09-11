import type { AIProvider, Explanation, ExplanationRequest } from './types';

function sentences(request: ExplanationRequest): string[] {
  const lines: string[] = [];

  if (request.arrivalDeltaMinutes !== null && request.arrivalDeltaMinutes !== 0 && request.estimatedArrival) {
    const magnitude = Math.abs(request.arrivalDeltaMinutes);
    const direction = request.arrivalDeltaMinutes > 0 ? 'later' : 'earlier';
    lines.push(
      `The flight is currently expected to arrive around ${magnitude} ${magnitude === 1 ? 'minute' : 'minutes'} ${direction} than the time you entered, at about ${request.estimatedArrival}.`,
    );
  } else if (request.liveFlightData && request.estimatedArrival) {
    lines.push(`The flight is tracking to arrive at about ${request.estimatedArrival}.`);
  } else {
    lines.push(
      `There is no live position for this flight, so this is built around the ${request.scheduledTime} time you entered.`,
    );
  }

  if (request.kind === 'pickup' && request.readinessWindow) {
    lines.push(
      `Allowing for leaving the aircraft, ${request.airportName === 'Manchester Airport' ? 'border control where it applies' : 'airport processing'}, bags and the walk out, your passenger is likely to be ready between ${request.readinessWindow[0]} and ${request.readinessWindow[1]}.`,
    );
  }

  if (request.kind === 'dropoff' && request.terminalWindow) {
    lines.push(
      `That puts your passenger at the terminal between ${request.terminalWindow[0]} and ${request.terminalWindow[1]}, before their airline's check-in deadline.`,
    );
  }

  const [fastest, slowest] = request.journeyMinutes;
  lines.push(
    request.routed
      ? `The drive is estimated at ${fastest}–${slowest} minutes, routed over real roads with the slower end allowing for traffic${request.weather === 'Unavailable' ? '' : ` and ${request.weather.toLowerCase()}`}.`
      : `No routing service answered, so the drive is estimated at ${fastest}–${slowest} minutes from distance alone.`,
  );

  lines.push(
    `Leaving at ${request.recommendedDeparture} should get you to ${request.airportName} between ${request.airportArrivalWindow[0]} and ${request.airportArrivalWindow[1]}, which is about as close to the right moment as the available information supports.`,
  );

  if (request.confidence !== 'high') {
    lines.push(
      request.confidence === 'low'
        ? 'Confidence is low because key information is missing or out of date, so allow extra time.'
        : 'Confidence is medium because some of this is estimated rather than measured.',
    );
  }

  return lines;
}

/**
 * The explanation everyone gets when no local model is running — which is the
 * normal case on the public site. It is assembled from the same structured
 * numbers the engine produced, so it can never contradict the recommendation,
 * and the UI labels it "Standard recommendation explanation" rather than
 * implying anything wrote it for the occasion.
 */
export const ruleBasedProvider: AIProvider = {
  id: 'rule-based',
  label: 'Standard recommendation explanation',

  async isAvailable(): Promise<boolean> {
    return true;
  },

  async explain(request): Promise<Explanation> {
    return { text: sentences(request).join(' '), source: 'rule-based', model: null };
  },
};
