/**
 * Every number in this file is a SetoffIQ product assumption.
 *
 * None of it is published airport data. Manchester Airport does not publish
 * per-passenger processing times, so the application states these openly as
 * assumptions in the UI and in DATA-SOURCES.md rather than presenting them as
 * measurements. They live here so they can be adjusted in one place.
 */
import type { MinuteRange } from './types';

export const ASSUMPTION_LABEL = 'Estimated processing assumption';

/**
 * How much longer than the free-flow routed time a journey might take.
 * OSRM returns free-flow driving times with no traffic model, so the upper
 * bound of every journey estimate has to absorb that.
 */
export const JOURNEY_UNCERTAINTY = {
  /** Applied to every journey: routing engines model an empty road. */
  baseFraction: 0.12,
  /** Weekday peak periods in the airport's local time. */
  peakFraction: 0.15,
  peakHours: [7, 8, 9, 16, 17, 18] as const,
  /** Added when weather is likely to slow traffic. */
  weatherFraction: { clear: 0, moderate: 0.06, poor: 0.14 },
  /** Applied when no routing provider answered and distance was used instead. */
  noRoutingFraction: 0.35,
  /** Never recommend a departure without at least this much slack. */
  minimumSlackMinutes: 5,
} as const;

/**
 * Fallback used only when every routing provider fails. Straight-line distance
 * multiplied by a road-winding factor, at an assumed average speed. Clearly
 * flagged in the UI as an estimate made without routing.
 */
export const OFFLINE_ROUTE_ESTIMATE = {
  roadWindingFactor: 1.3,
  averageSpeedKph: 50,
} as const;

/** Flight data older than this is shown as stale and lowers confidence. */
export const FLIGHT_SNAPSHOT_STALE_AFTER_MINUTES = 30;

/**
 * Beyond this, aircraft positions are not used at all. The snapshot job runs
 * every fifteen minutes; a snapshot an hour old means the job has stopped, not
 * run late, and an aircraft seen an hour ago may be on the ground by now. A
 * 22-hour-old snapshot once produced a "leave now" for a flight from the day
 * before.
 */
export const FLIGHT_POSITIONS_UNUSABLE_AFTER_MINUTES = 60;

/**
 * A live estimate further than this from the scheduled time is a different
 * day's flight with the same number, not a late or early one.
 */
export const FLIGHT_MATCH_WINDOW_HOURS = 6;

/** Weather beyond this age is refetched rather than reused. */
export const WEATHER_CACHE_TTL_MINUTES = 60;

/** Route estimates change slowly; the road network does not move. */
export const ROUTE_CACHE_TTL_MINUTES = 60 * 24;

/** A recommendation moving by less than this is not worth telling anyone about. */
export const DEFAULT_NOTIFICATION_THRESHOLD_MINUTES = 10;

/**
 * Adaptive polling. Longer flights away means fewer requests; the interval
 * shortens as the journey approaches. Chosen so a single monitored journey
 * stays far inside every provider's documented limits.
 */
export const POLLING_INTERVALS_MINUTES = {
  moreThan24Hours: 180,
  sixToTwentyFourHours: 60,
  oneToSixHours: 20,
  withinOneHour: 10,
  airborne: 5,
  settled: 0,
} as const;

export const CONFIDENCE_THRESHOLDS = { high: 80, medium: 55 } as const;

export function scaleRange(range: MinuteRange, fraction: number): MinuteRange {
  return {
    minMinutes: range.minMinutes,
    maxMinutes: Math.ceil(range.maxMinutes * (1 + fraction)),
  };
}
