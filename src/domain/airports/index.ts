import type {
  AirportProfile,
  DepartureBuffer,
  GeoPoint,
  PassengerRoute,
  ProcessingProfile,
} from '../types';
import { MANCHESTER } from './man';

/**
 * Airports are data, not code. Adding Heathrow or Birmingham later means
 * adding a profile here; no calculation changes.
 */
export const AIRPORTS: AirportProfile[] = [MANCHESTER];

export const DEFAULT_AIRPORT = MANCHESTER;

export function findAirport(iataCode: string): AirportProfile | null {
  return AIRPORTS.find((airport) => airport.iataCode === iataCode) ?? null;
}

export function processingProfileFor(
  airport: AirportProfile,
  route: PassengerRoute,
): ProcessingProfile {
  const match = airport.processingProfiles.find((profile) => profile.route === route);
  if (!match) throw new Error(`No processing profile for ${route} at ${airport.iataCode}`);
  return match;
}

export function departureBufferFor(
  airport: AirportProfile,
  route: PassengerRoute,
): DepartureBuffer {
  const match = airport.departureBuffers.find((buffer) => buffer.route === route);
  if (!match) throw new Error(`No departure buffer for ${route} at ${airport.iataCode}`);
  return match;
}

export { MANCHESTER };

/**
 * Where to route a car for this journey.
 *
 * Terminal-specific when the traveller told us which one, and the airport's
 * general terminal approach otherwise. Never the aerodrome reference point.
 */
export function routingDestination(
  airport: AirportProfile,
  terminalCode: string | null,
): GeoPoint {
  const terminal = terminalCode
    ? airport.terminals.find((candidate) => candidate.code === terminalCode)
    : null;
  const point = terminal?.routingPoint ?? airport.routingPoint;
  return {
    latitude: point.latitude,
    longitude: point.longitude,
    label: terminal ? `${airport.name} ${terminal.name}` : airport.name,
  };
}
