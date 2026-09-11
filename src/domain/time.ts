import type { Instant, MinuteRange, TimeWindow } from './types';

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;

/**
 * Offset of `timeZone` from UTC at `instant`, in milliseconds.
 * Derived from Intl rather than a hardcoded table, so daylight saving is
 * handled by the platform's own timezone database.
 */
function zoneOffsetMs(instant: Instant, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = formatter.formatToParts(new Date(instant));
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    return part ? Number(part.value) : 0;
  };
  // `Intl` renders midnight as hour 24 in some engines; normalise it.
  const hour = read('hour') % 24;
  const asUtc = Date.UTC(read('year'), read('month') - 1, read('day'), hour, read('minute'), read('second'));
  return asUtc - instant;
}

/**
 * Convert a wall-clock time in `timeZone` to an instant.
 *
 * Two passes are needed because the offset itself depends on the instant we
 * are trying to find. The second pass settles the clocks-change boundaries.
 */
export function zonedTimeToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Instant {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const firstGuess = naive - zoneOffsetMs(naive, timeZone);
  return naive - zoneOffsetMs(firstGuess, timeZone);
}

/** Parse the `<input type="date">` + `<input type="time">` pair the forms use. */
export function parseLocalDateTime(date: string, time: string, timeZone: string): Instant | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) return null;
  const [, year, month, day] = dateMatch;
  const [, hour, minute] = timeMatch;
  const instant = zonedTimeToInstant(
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute),
    timeZone,
  );
  return Number.isFinite(instant) ? instant : null;
}

/** "18:05" in the airport's timezone, never the browser's. */
export function formatClock(instant: Instant, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(instant));
}

/** "Sat 14 Sep" in the airport's timezone. */
export function formatDate(instant: Instant, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(instant));
}

export function formatClockRange(window: TimeWindow, timeZone: string): string {
  return `${formatClock(window.earliest, timeZone)}–${formatClock(window.latest, timeZone)}`;
}

export function formatMinuteRange(range: MinuteRange): string {
  if (range.minMinutes === range.maxMinutes) return `${range.minMinutes} min`;
  return `${range.minMinutes}–${range.maxMinutes} min`;
}

/** "4 minutes ago", "just now", "in 12 minutes". Used for freshness labels. */
export function formatRelative(instant: Instant, now: Instant): string {
  const deltaMinutes = Math.round((instant - now) / MINUTE_MS);
  if (Math.abs(deltaMinutes) < 1) return 'just now';
  const magnitude = Math.abs(deltaMinutes);
  const unit = magnitude === 1 ? 'minute' : 'minutes';
  if (magnitude < 60) {
    return deltaMinutes < 0 ? `${magnitude} ${unit} ago` : `in ${magnitude} ${unit}`;
  }
  const hours = Math.round(magnitude / 60);
  const hourUnit = hours === 1 ? 'hour' : 'hours';
  return deltaMinutes < 0 ? `${hours} ${hourUnit} ago` : `in ${hours} ${hourUnit}`;
}

export function addMinutes(instant: Instant, minutes: number): Instant {
  return instant + minutes * MINUTE_MS;
}

export function minutesBetween(from: Instant, to: Instant): number {
  return Math.round((to - from) / MINUTE_MS);
}

export function addRanges(...ranges: MinuteRange[]): MinuteRange {
  return ranges.reduce<MinuteRange>(
    (total, range) => ({
      minMinutes: total.minMinutes + range.minMinutes,
      maxMinutes: total.maxMinutes + range.maxMinutes,
    }),
    { minMinutes: 0, maxMinutes: 0 },
  );
}

/** Today's date in the airport's timezone, as an `<input type="date">` value. */
export function todayInZone(now: Instant, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now));
  return parts;
}
