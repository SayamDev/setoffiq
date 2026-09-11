import type { ConfidenceLevel, JourneyKind } from '../../domain/types';

/**
 * What an explanation provider is allowed to see.
 *
 * Deliberately narrow. There is no address, no postcode, no coordinates and no
 * passenger name here — a drive is described only by how long it takes. An
 * explanation does not need to know where someone lives, so it is never told.
 */
export interface ExplanationRequest {
  kind: JourneyKind;
  airportName: string;
  flightStatus: string;
  scheduledTime: string;
  estimatedArrival: string | null;
  arrivalDeltaMinutes: number | null;
  readinessWindow: [string, string] | null;
  terminalWindow: [string, string] | null;
  journeyMinutes: [number, number];
  airportArrivalWindow: [string, string];
  recommendedDeparture: string;
  weather: string;
  confidence: ConfidenceLevel;
  liveFlightData: boolean;
  routed: boolean;
}

export interface Explanation {
  text: string;
  /**
   * Where the words came from. The UI labels rule-based output honestly rather
   * than implying a model wrote it.
   */
  source: 'local-ai' | 'rule-based';
  model: string | null;
}

export interface AIProvider {
  readonly id: string;
  readonly label: string;
  isAvailable(signal?: AbortSignal): Promise<boolean>;
  explain(request: ExplanationRequest, signal?: AbortSignal): Promise<Explanation>;
}
