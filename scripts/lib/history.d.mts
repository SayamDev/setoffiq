import type { SnapshotAircraft, SnapshotRoute } from '../../src/services/flight/snapshotTypes';
import type { ArrivalHistory } from '../../src/services/flight/history';

export const KEEP_DAYS: number;

export interface DetectedArrival {
  callsign: string;
  at: number;
  route: SnapshotRoute | null;
  km: number;
}

export function localDayAndMinute(instantMs: number, timeZone: string): { date: string; minute: number };

export function detectArrivals(
  aircraft: SnapshotAircraft[],
  airport: { icao: string; latitude: number; longitude: number },
): DetectedArrival[];

export function detectDepartures(
  aircraft: SnapshotAircraft[],
  airport: { icao: string; latitude: number; longitude: number },
): DetectedArrival[];

export function mergeHistory(
  previous: ArrivalHistory | null,
  arrivals: DetectedArrival[],
  nowMs: number,
  timeZone: string,
  airportIcao: string,
  departures?: DetectedArrival[],
): ArrivalHistory & { flights: Record<string, { landings: { date: string; minute: number; km?: number }[] }> };
