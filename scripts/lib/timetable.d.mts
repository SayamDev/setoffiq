import type { TimetableEntry } from '../../src/services/flight/timetable';

export function minuteOfDay(value: unknown): number | null;

export function toTimetableEntries(
  rows: Record<string, unknown>[],
  direction: 'arrival' | 'departure',
  placeFor: (iata: string | null) => { icao: string; iata: string; city: string | null; country: string | null } | null,
): TimetableEntry[];

export function withTimeZones(
  entries: TimetableEntry[],
  placeFor: (iata: string | null) => { timeZone?: string | null } | null,
): TimetableEntry[];
