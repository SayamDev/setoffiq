import { parseLocalDateTime, formatClock, todayInZone } from '../domain/time';
import { validateScheduledTime } from '../domain/scheduleWindow';
import type { JourneyKind } from '../domain/types';

/** Interpret a booking clock once in the destination airport's zone. */
export function bookingTime(kind: JourneyKind, date: string, clock: string, zone: string, now: number): number | string {
  const at = parseLocalDateTime(date, clock, zone);
  if (at === null || todayInZone(at, zone) !== date || formatClock(at, zone) !== clock)
    return 'Enter a valid flight date and time from your booking.';
  if ([at - 3_600_000, at + 3_600_000].some(other => todayInZone(other, zone) === date && formatClock(other, zone) === clock))
    return 'That local time occurs twice when the clocks change. Confirm the exact time with your airline before planning.';
  return validateScheduledTime(kind, at, now)?.message ?? at;
}
