import { HOUR_MS, parseLocalDateTime, todayInZone } from './time';
import type { Instant, JourneyKind } from './types';

/**
 * What counts as a sensible time to plan around.
 *
 * The two journey kinds differ, and the difference is the product's whole
 * premise. A departure in the past is meaningless — the aircraft has gone. But
 * an *arrival* in the recent past is a perfectly good question: a passenger who
 * landed twenty minutes ago is still somewhere between the aircraft and the
 * kerb, and "when should I leave?" is exactly what SetoffIQ is for.
 */
export const SCHEDULE_LIMITS = {
  /**
   * How far back an arrival can be and still have a passenger inside the
   * terminal. Comfortably beyond the upper end of the processing assumptions,
   * which top out near 67 minutes, with room for a slow bag.
   */
  arrivalLookBackHours: 6,
  /** A departure already past cannot be planned for, but allow for clock skew. */
  departureGraceMinutes: 5,
  /** Beyond this nothing useful is knowable and it is more likely a typo. */
  lookAheadDays: 365,
} as const;

export interface ScheduleProblem {
  message: string;
}

export function validateScheduledTime(
  kind: JourneyKind,
  scheduledTime: Instant,
  now: Instant,
): ScheduleProblem | null {
  const aheadMs = scheduledTime - now;

  if (aheadMs > SCHEDULE_LIMITS.lookAheadDays * 24 * HOUR_MS) {
    return { message: 'That date is more than a year away. Check the year on the date.' };
  }

  if (kind === 'dropoff') {
    if (aheadMs < -SCHEDULE_LIMITS.departureGraceMinutes * 60_000) {
      return {
        message:
          'That departure time has already passed. Enter the time the flight is scheduled to leave.',
      };
    }
    return null;
  }

  if (aheadMs < -SCHEDULE_LIMITS.arrivalLookBackHours * HOUR_MS) {
    return {
      message:
        'That arrival was more than six hours ago, so your passenger will be long out of the terminal. Check the date and time.',
    };
  }

  return null;
}

/** `min` for the date input: today for a drop-off, yesterday for a pickup. */
export function earliestSelectableDate(kind: JourneyKind, now: Instant, timeZone: string): string {
  const earliest =
    kind === 'dropoff' ? now : now - SCHEDULE_LIMITS.arrivalLookBackHours * HOUR_MS;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(earliest));
}

/**
 * How long ago a time on today's date can be before it more likely means
 * tomorrow. A pickup keeps a two-hour window — a passenger who landed an hour
 * ago is a real question — while a departure that has passed has simply gone.
 */
export const TOMORROW_AFTER_MINUTES: Record<JourneyKind, number> = {
  pickup: 120,
  dropoff: SCHEDULE_LIMITS.departureGraceMinutes,
};

/**
 * The date a bare time most likely means, when nobody has chosen a date.
 *
 * At 19:00, "01:05" is tomorrow morning's flight, not one that landed eighteen
 * hours ago. Only used while the date is still the form's default: a date
 * someone picked is never second-guessed.
 */
export function impliedDate(
  kind: JourneyKind,
  time: string,
  now: Instant,
  timeZone: string,
): { date: string; tomorrow: boolean } {
  const today = todayInZone(now, timeZone);
  const onToday = parseLocalDateTime(today, time, timeZone);
  if (onToday === null || onToday >= now - TOMORROW_AFTER_MINUTES[kind] * 60_000) {
    return { date: today, tomorrow: false };
  }
  return { date: todayInZone(now + 24 * HOUR_MS, timeZone), tomorrow: true };
}

