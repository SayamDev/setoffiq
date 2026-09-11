import type { SnapshotRoute } from '../../src/services/flight/snapshotTypes';

export function splitCsvLine(line: string): string[];

export function legFor(airportCodes: string, airportIcao: string): { from: string; to: string } | null;

export function createRouteLookup(standingDataDir: string | undefined): {
  available: boolean;
  lookup(callsign: string, airportIcao: string): SnapshotRoute | null;
};
