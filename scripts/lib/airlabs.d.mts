import type { ScheduledFlight } from '../../src/services/flight/schedule';

export function utcToMs(value: unknown): number | null;

export function toScheduleEntries(
  rows: Record<string, unknown>[],
  direction: 'arrival' | 'departure',
  placeFor: (iata: string | null) => { icao: string; city: string | null; country: string | null } | null,
): ScheduledFlight[];

export function fieldsPresent(rows: Record<string, unknown>[]): string[];
