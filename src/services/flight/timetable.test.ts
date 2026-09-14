import { describe, expect, it } from 'vitest';
import { toTimetableEntries } from '../../../scripts/lib/timetable.mjs';
import type { FlightTimetable, TimetableEntry } from './timetable';
import { timetableWindow, withoutScheduled } from './timetable';

const routeRow = (overrides: Record<string, unknown> = {}) => ({
  airline_iata: 'EK',
  airline_icao: 'UAE',
  flight_number: '21',
  flight_iata: 'EK21',
  flight_icao: 'UAE21',
  dep_iata: 'DXB',
  dep_icao: 'OMDB',
  dep_time: '09:40',
  dep_time_utc: '05:40',
  dep_terminals: ['3'],
  arr_iata: 'MAN',
  arr_icao: 'EGCC',
  arr_time: '13:55',
  arr_time_utc: '12:55',
  arr_terminals: ['2'],
  duration: 435,
  days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  ...overrides,
});

const places = (iata: string | null) =>
  iata === 'DXB' ? { icao: 'OMDB', iata: 'DXB', city: 'Dubai', country: 'AE' } : null;

describe('reading the AirLabs weekly timetable', () => {
  it('keeps the days, the departure and how long the flight takes', () => {
    const [entry] = toTimetableEntries([routeRow()], 'arrival', places);
    expect(entry).toMatchObject({
      flight: 'EK21',
      callsign: 'UAE21',
      departureMinute: 5 * 60 + 40,
      durationMinutes: 435,
      terminal: '2',
      otherEnd: { city: 'Dubai', country: 'AE' },
    });
  });

  it('works out the time in the air when none is published, including overnight', () => {
    const [entry] = toTimetableEntries(
      [routeRow({ duration: null, dep_time_utc: '22:30', arr_time_utc: '01:15' })],
      'arrival',
      places,
    );
    expect(entry?.durationMinutes).toBe(165);
  });

  it('folds a marketing number into the flight that operates it', () => {
    const rows = [
      routeRow(),
      routeRow({ flight_iata: 'QF8021', flight_icao: 'QFA8021', cs_flight_iata: 'EK21', cs_airline_iata: 'EK' }),
    ];
    const [entry] = toTimetableEntries(rows, 'arrival', places);
    expect(entry?.flight).toBe('EK21');
    expect(entry?.aliases).toEqual(['QF8021']);
  });

  it('ignores a row with no days or no departure time', () => {
    expect(toTimetableEntries([routeRow({ days: [] })], 'arrival', places)).toEqual([]);
    expect(toTimetableEntries([routeRow({ dep_time_utc: null })], 'arrival', places)).toEqual([]);
  });
});

const entry = (overrides: Partial<TimetableEntry> = {}): TimetableEntry => ({
  flight: 'EK21',
  callsign: 'UAE21',
  airline: 'EK',
  otherEnd: { icao: 'OMDB', iata: 'DXB', city: 'Dubai', country: 'AE' },
  days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  departureMinute: 5 * 60 + 40,
  durationMinutes: 435,
  terminal: '2',
  aliases: [],
  ...overrides,
});

const timetable = (entries: TimetableEntry[]): FlightTimetable => ({
  generatedAt: new Date().toISOString(),
  attribution: 'test',
  arrivals: entries,
  departures: entries,
});

describe('placing the timetable on real days', () => {
  // Friday 11 September 2026, 02:00 UTC — the dead of night, when the schedule
  // has nothing and this list is the only one with anything in it.
  const night = Date.UTC(2026, 8, 11, 2, 0);

  it('lands a flight at its departure plus its time in the air', () => {
    const [flight] = timetableWindow(timetable([entry()]), 'arrival', night, 24);
    expect(flight?.at).toBe(Date.UTC(2026, 8, 11, 12, 55));
    expect(flight?.flight).toBe('EK21');
    expect(flight?.place).toBe('Dubai');
  });

  it('offers the next day too, so a list at two in the morning is never empty', () => {
    const flights = timetableWindow(timetable([entry()]), 'arrival', night, 48);
    expect(flights.map((flight) => flight.at)).toEqual([
      Date.UTC(2026, 8, 11, 12, 55),
      Date.UTC(2026, 8, 12, 12, 55),
    ]);
  });

  it('leaves out the days a flight does not operate', () => {
    // Fridays only: the Saturday repeat must not appear.
    const flights = timetableWindow(timetable([entry({ days: ['fri'] })]), 'arrival', night, 48);
    expect(flights).toHaveLength(1);
  });

  it('times a departure from the airport itself, with no time in the air added', () => {
    const [flight] = timetableWindow(timetable([entry()]), 'departure', night, 24);
    expect(flight?.at).toBe(Date.UTC(2026, 8, 11, 5, 40));
  });

  it('leaves out freight: nobody is collected from a cargo flight', () => {
    expect(timetableWindow(timetable([entry({ callsign: 'FDX5270' })]), 'arrival', night, 48)).toEqual([]);
  });

  it('drops what the live schedule already covers, including under a codeshare number', () => {
    const flights = timetableWindow(timetable([entry()]), 'arrival', night, 48);
    const kept = withoutScheduled(flights, [
      { flight: 'QF8021', aliases: ['EK21'], scheduled: Date.UTC(2026, 8, 11, 13, 10) },
    ]);
    expect(kept.map((flight) => flight.at)).toEqual([Date.UTC(2026, 8, 12, 12, 55)]);
  });
});
