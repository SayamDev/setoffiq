import { describe, expect, it } from 'vitest';
import { quickFlightMatches } from './quickJourney';
import type { FlightSchedule, ScheduledFlight } from './flight/schedule';
const now = Date.parse('2026-10-24T10:00:00Z');
const flight: ScheduledFlight = {
  flight: 'RK1712',
  callsign: null,
  airline: 'RK',
  otherEnd: null,
  scheduled: Date.parse('2026-10-24T13:25:00Z'),
  estimated: null,
  actual: null,
  status: 'scheduled',
  delayMinutes: null,
  terminal: '3',
  aliases: ['FR1712'],
};
const schedule = (
  flights = [flight],
  generatedAt = new Date(now).toISOString(),
): FlightSchedule => ({
  generatedAt,
  attribution: 'test',
  arrivals: flights,
  departures: [],
});
describe('quick planner dated lookup', () => {
  it('matches normalised ticket numbers and explicit aliases', () => {
    expect(
      quickFlightMatches(schedule(), 'rk 1712', '2026-10-24', now),
    ).toEqual([flight]);
    expect(quickFlightMatches(schedule(), 'FR1712', '2026-10-24', now)).toEqual(
      [flight],
    );
  });
  it('never guesses a callsign association or a similar flight', () => {
    for (const number of ['RUK87AL', 'RK171', 'RK1713'])
      expect(quickFlightMatches(schedule(), number, '2026-10-24', now)).toEqual(
        [],
      );
  });
  it.each(['2026-10-23', '2026-10-25'])(
    'does not reuse a time on another date: %s',
    (date) => {
      expect(quickFlightMatches(schedule(), 'RK1712', date, now)).toEqual([]);
    },
  );
  it.each(['invalid', '2026-10-23T21:59:59Z', '2026-10-24T10:01:01Z'])(
    'rejects stale or invalid publication: %s',
    (generated) => {
      expect(
        quickFlightMatches(
          schedule([flight], generated),
          'RK1712',
          '2026-10-24',
          now,
        ),
      ).toEqual([]);
    },
  );
  it('preserves genuinely different times for a user choice and deduplicates identical times', () => {
    const later = { ...flight, scheduled: flight.scheduled + 3600000 };
    expect(
      quickFlightMatches(
        schedule([flight, { ...flight }, later]),
        'RK1712',
        '2026-10-24',
        now,
      ),
    ).toEqual([flight, later]);
  });
  it('keeps departures separate from arrivals', () => {
    expect(
      quickFlightMatches(schedule(), 'RK1712', '2026-10-24', now, 'dropoff'),
    ).toEqual([]);
    expect(
      quickFlightMatches(
        { ...schedule([]), departures: [flight] },
        'RK1712',
        '2026-10-24',
        now,
        'dropoff',
      ),
    ).toEqual([flight]);
  });
  it('uses Manchester local dates around summer midnight', () => {
    const midnight = {
      ...flight,
      scheduled: Date.parse('2026-06-10T23:30:00Z'),
    };
    const summer = Date.parse('2026-06-10T22:00:00Z');
    const source = schedule([midnight], new Date(summer).toISOString());
    expect(quickFlightMatches(source, 'RK1712', '2026-06-11', summer)).toEqual([
      midnight,
    ]);
    expect(quickFlightMatches(source, 'RK1712', '2026-06-10', summer)).toEqual(
      [],
    );
  });
  it('handles missing data and invalid schedule timestamps without inventing a time', () => {
    expect(quickFlightMatches(null, 'RK1712', '2026-10-24', now)).toEqual([]);
    expect(
      quickFlightMatches(
        schedule([{ ...flight, scheduled: NaN }]),
        'RK1712',
        '2026-10-24',
        now,
      ),
    ).toEqual([]);
  });
});
