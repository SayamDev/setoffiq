import { describe, expect, it } from 'vitest';
import {
  addRanges,
  formatClock,
  formatMinuteRange,
  formatRelative,
  minutesBetween,
  parseLocalDateTime,
  todayInZone,
  zonedTimeToInstant,
} from './time';

const LONDON = 'Europe/London';

describe('timezone handling', () => {
  it('treats a winter wall-clock time as GMT', () => {
    const instant = zonedTimeToInstant(2026, 1, 15, 12, 0, LONDON);
    expect(new Date(instant).toISOString()).toBe('2026-01-15T12:00:00.000Z');
  });

  it('treats a summer wall-clock time as BST', () => {
    const instant = zonedTimeToInstant(2026, 6, 15, 12, 0, LONDON);
    expect(new Date(instant).toISOString()).toBe('2026-06-15T11:00:00.000Z');
  });

  it('handles the spring clock change, when 01:00 becomes 02:00', () => {
    const beforeChange = zonedTimeToInstant(2026, 3, 29, 0, 30, LONDON);
    const afterChange = zonedTimeToInstant(2026, 3, 29, 2, 30, LONDON);
    expect(new Date(beforeChange).toISOString()).toBe('2026-03-29T00:30:00.000Z');
    expect(new Date(afterChange).toISOString()).toBe('2026-03-29T01:30:00.000Z');
    // Only one hour of wall clock separates them, because an hour disappears.
    expect(minutesBetween(beforeChange, afterChange)).toBe(60);
  });

  it('handles the autumn clock change, when the hour repeats', () => {
    const instant = zonedTimeToInstant(2026, 10, 25, 3, 0, LONDON);
    expect(new Date(instant).toISOString()).toBe('2026-10-25T03:00:00.000Z');
    expect(formatClock(instant, LONDON)).toBe('03:00');
  });

  it('round-trips a formatted clock time through the airport timezone', () => {
    const instant = zonedTimeToInstant(2026, 7, 1, 18, 5, LONDON);
    expect(formatClock(instant, LONDON)).toBe('18:05');
    // The same instant is an hour earlier in UTC, which is why the app never
    // formats using the browser's zone.
    expect(formatClock(instant, 'UTC')).toBe('17:05');
  });

  it('parses the date and time inputs the forms produce', () => {
    const instant = parseLocalDateTime('2026-09-16', '18:20', LONDON);
    expect(instant).not.toBeNull();
    expect(formatClock(instant!, LONDON)).toBe('18:20');
  });

  it('rejects malformed date or time input', () => {
    expect(parseLocalDateTime('16/09/2026', '18:20', LONDON)).toBeNull();
    expect(parseLocalDateTime('2026-09-16', '6pm', LONDON)).toBeNull();
    expect(parseLocalDateTime('', '', LONDON)).toBeNull();
  });

  it('handles a journey that crosses midnight', () => {
    const arrival = parseLocalDateTime('2026-09-17', '00:20', LONDON)!;
    const departure = parseLocalDateTime('2026-09-16', '23:10', LONDON)!;
    expect(minutesBetween(departure, arrival)).toBe(70);
    expect(formatClock(departure, LONDON)).toBe('23:10');
    expect(formatClock(arrival, LONDON)).toBe('00:20');
  });

  it('reports today in the airport zone, not the browser zone', () => {
    // 23:30 UTC on 16 September is already 00:30 on the 17th in Tokyo.
    const instant = Date.UTC(2026, 8, 16, 23, 30);
    expect(todayInZone(instant, LONDON)).toBe('2026-09-17');
    expect(todayInZone(instant, 'Asia/Tokyo')).toBe('2026-09-17');
    expect(todayInZone(instant, 'America/New_York')).toBe('2026-09-16');
  });
});

describe('formatting helpers', () => {
  it('describes freshness in plain words', () => {
    const now = Date.UTC(2026, 8, 16, 17, 42);
    expect(formatRelative(now, now)).toBe('just now');
    expect(formatRelative(now - 60_000, now)).toBe('1 minute ago');
    expect(formatRelative(now - 46 * 60_000, now)).toBe('46 minutes ago');
    expect(formatRelative(now + 12 * 60_000, now)).toBe('in 12 minutes');
    expect(formatRelative(now - 130 * 60_000, now)).toBe('2 hours ago');
  });

  it('formats minute ranges, collapsing equal bounds', () => {
    expect(formatMinuteRange({ minMinutes: 42, maxMinutes: 51 })).toBe('42–51 min');
    expect(formatMinuteRange({ minMinutes: 10, maxMinutes: 10 })).toBe('10 min');
  });

  it('adds minute ranges component-wise', () => {
    expect(
      addRanges({ minMinutes: 5, maxMinutes: 12 }, { minMinutes: 8, maxMinutes: 25 }),
    ).toEqual({ minMinutes: 13, maxMinutes: 37 });
  });
});
