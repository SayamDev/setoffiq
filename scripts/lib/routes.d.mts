import type { SnapshotRoute } from '../../src/services/flight/snapshotTypes';

export function splitCsvLine(line: string): string[];

export function legFor(airportCodes: string, airportIcao: string): { from: string; to: string } | null;

export function createRouteLookup(standingDataDir: string | undefined): {
  available: boolean;
  lookup(callsign: string, airportIcao: string): SnapshotRoute | null;
};

export function createIataLookup(
  standingDataDir: string | undefined,
): (iata: string | null) => { icao: string; iata: string; city: string | null; name: string | null; country: string | null } | null;
