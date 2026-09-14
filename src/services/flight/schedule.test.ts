import { afterEach, describe, expect, it } from 'vitest';
import { MANCHESTER } from '../../domain/airports';
import { toScheduleEntries, utcToMs } from '../../../scripts/lib/airlabs.mjs';
import { writeCache } from '../cache';
import { clearAll } from '../storage';
import { findScheduled, lateBy, upcomingArrivals, upcomingDepartures, type FlightSchedule, type ScheduledFlight } from './schedule';
import { snapshotFlightProvider } from './snapshotProvider';

/** Rows shaped like the free key's real /schedules response on 11 September. */
const ROWS = [
  { flight_iata: 'EK19', flight_icao: 'UAE19', airline_iata: 'EK', dep_iata: 'DXB', arr_iata: 'MAN', arr_time_utc: '2026-09-11 18:05', arr_estimated_utc: '2026-09-11 18:30', arr_terminal: '2', status: 'active', arr_delayed: 25 },
  { flight_iata: 'QF8019', flight_icao: 'QFA8019', airline_iata: 'QF', dep_iata: 'DXB', arr_iata: 'MAN', arr_time_utc: '2026-09-11 18:05', cs_flight_iata: 'EK19', status: 'active' },
  { flight_iata: 'FR3006', flight_icao: 'RYR3006', airline_iata: 'FR', dep_iata: 'IBZ', arr_iata: 'MAN', arr_time_utc: '2026-09-11 21:40', status: 'cancelled' },
  { flight_iata: 'FX5270', flight_icao: 'FDX5270', airline_iata: 'FX', dep_iata: 'CDG', arr_iata: 'MAN', arr_time_utc: '2026-09-11 19:00', status: 'scheduled' },
];

const place = (iata: string | null) =>
  iata === 'DXB' ? { icao: 'OMDB', city: 'Dubai', country: 'AE' } : iata === 'IBZ' ? { icao: 'LEIB', city: 'Ibiza', country: 'ES' } : null;

describe('turning AirLabs rows into schedule entries', () => {
  const entries = toScheduleEntries(ROWS, 'arrival', place);

  it('lists each aircraft once, with its codeshare numbers folded in', () => {
    expect(entries.map((e) => e.flight)).toEqual(['EK19', 'FX5270', 'FR3006']);
    expect(entries.find((e) => e.flight === 'EK19')?.aliases).toEqual(['QF8019']);
  });

  it('keeps status, delay and times, and names the origin', () => {
    const ek19 = entries.find((e) => e.flight === 'EK19')!;
    expect(ek19).toMatchObject({ status: 'active', delayMinutes: 25, terminal: '2', otherEnd: { city: 'Dubai' } });
    expect(ek19.scheduled).toBe(Date.UTC(2026, 8, 11, 18, 5));
    expect(ek19.estimated).toBe(Date.UTC(2026, 8, 11, 18, 30));
  });

  it('reads AirLabs UTC times, and nothing from an empty field', () => {
    expect(utcToMs('2026-09-11 21:40')).toBe(Date.UTC(2026, 8, 11, 21, 40));
    expect(utcToMs('')).toBeNull();
  });
});

const at = (h: number, m = 0) => Date.UTC(2026, 8, 11, h, m);
const flight = (overrides: Partial<ScheduledFlight>): ScheduledFlight => ({
  flight: 'FR3006', callsign: 'RYR3006', airline: 'FR', otherEnd: { icao: 'LEIB', iata: 'IBZ', city: 'Ibiza', country: 'ES' },
  scheduled: at(20), estimated: null, actual: null, status: 'scheduled', delayMinutes: null, terminal: null, aliases: [], ...overrides,
});

describe('which scheduled flights are offered', () => {
  const now = at(18);
  const schedule: FlightSchedule = {
    generatedAt: new Date(now).toISOString(),
    attribution: 'test',
    arrivals: [
      flight({ flight: 'A1', scheduled: at(17, 40), status: 'landed', actual: at(17, 30) }),
      flight({ flight: 'A2', scheduled: at(16), status: 'landed', actual: at(16) }),
      flight({ flight: 'A3', scheduled: at(21), status: 'cancelled' }),
      flight({ flight: 'A4', scheduled: at(18) + 11 * 3_600_000 }),
      flight({ flight: 'A6', scheduled: at(18) + 40 * 3_600_000 }),
      flight({ flight: 'A5', scheduled: at(19), callsign: 'FDX5270' }),
    ],
    departures: [
      flight({ flight: 'D1', scheduled: at(17, 50), status: 'active' }),
      flight({ flight: 'D2', scheduled: at(19) }),
    ],
  };

  it('offers arrivals just landed, still to come, and cancelled — not long gone, past the window, or freight', () => {
    // A4 is eleven hours out: a free key never reaches that far, but nothing in
    // a published file should be hidden by a window tighter than the file.
    expect(upcomingArrivals(schedule, now).map((f) => f.flight)).toEqual(['A1', 'A3', 'A4']);
  });

  it('honours a tighter window when one is asked for', () => {
    expect(upcomingArrivals(schedule, now, 6).map((f) => f.flight)).toEqual(['A1', 'A3']);
  });

  it('offers departures that have not gone', () => {
    expect(upcomingDepartures(schedule, now).map((f) => f.flight)).toEqual(['D2']);
  });

  it('says how late a flight is only when it is worth saying', () => {
    expect(lateBy(flight({ delayMinutes: 25 }))).toBe(25);
    expect(lateBy(flight({ estimated: at(20, 20) }))).toBe(20);
    expect(lateBy(flight({ estimated: at(20, 5) }))).toBeNull();
  });

  it('finds a flight by its number or a codeshare, nearest the time entered', () => {
    const list = [flight({ flight: 'EK19', aliases: ['QF8019'], scheduled: at(18) }), flight({ flight: 'EK19', scheduled: at(18) + 86_400_000 })];
    expect(findScheduled(list, 'qf 8019', at(18, 30))?.scheduled).toBe(at(18));
    expect(findScheduled(list, 'EK19', at(18) + 86_400_000)?.scheduled).toBe(at(18) + 86_400_000);
    expect(findScheduled(list, 'EK20', at(18))).toBeNull();
  });
});

describe('a monitored journey', () => {
  afterEach(() => clearAll());

  function seed(schedule: Partial<FlightSchedule>): void {
    const now = Date.now();
    writeCache('flight-snapshot:EGCC', { generatedAt: new Date(now).toISOString(), airportIcao: 'EGCC', source: 't', attribution: 't', radiusKm: 463, aircraft: [] }, now);
    writeCache('flight-schedule:EGCC', { generatedAt: new Date(now).toISOString(), attribution: 't', arrivals: [], departures: [], ...schedule }, now);
  }

  it('is told when the schedule lists its flight as cancelled', async () => {
    const due = Date.now() + 2 * 3_600_000;
    seed({ arrivals: [flight({ flight: 'FR3006', scheduled: due, status: 'cancelled' })] });
    const result = await snapshotFlightProvider.getFlightStatus({ flightNumber: 'FR3006', airport: MANCHESTER, scheduledArrival: due, scheduledDeparture: null });
    expect(result.value?.phase).toBe('cancelled');
    expect(result.message).toMatch(/lists FR3006 as cancelled/);
  });

  it("uses the schedule's estimate until the aircraft is in range, and says so", async () => {
    const due = Date.now() + 3 * 3_600_000;
    seed({ arrivals: [flight({ flight: 'EK19', scheduled: due, estimated: due + 25 * 60_000, status: 'active' })] });
    const result = await snapshotFlightProvider.getFlightStatus({ flightNumber: 'EK19', airport: MANCHESTER, scheduledArrival: due, scheduledDeparture: null });
    expect(result.value?.estimatedArrivalSource).toBe('airline-schedule');
    expect(result.value?.estimatedArrival).toBe(due + 25 * 60_000);
  });
});
