import { JOURNEY_UNCERTAINTY, OFFLINE_ROUTE_ESTIMATE } from '../assumptions';
import type {
  Instant,
  MinuteRange,
  RoadDisruptionSnapshot,
  RouteResult,
  WeatherSnapshot,
} from '../types';
import type { ProviderInput } from './inputs';

export interface JourneyEstimate {
  range: MinuteRange;
  /** Free-flow routed minutes, before any uncertainty was added. */
  baseMinutes: number;
  routed: boolean;
  /** Human-readable list of what widened the range, for the reasoning panel. */
  uncertaintyReasons: string[];
}

function localHour(instant: Instant, timeZone: string): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hour12: false,
  }).format(new Date(instant));
  return Number(hour) % 24;
}

function isWeekday(instant: Instant, timeZone: string): boolean {
  const day = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short' }).format(
    new Date(instant),
  );
  return day !== 'Sat' && day !== 'Sun';
}

/** Straight-line distance, only used when every routing provider has failed. */
export function estimateMinutesWithoutRouting(distanceKm: number): number {
  const roadKm = distanceKm * OFFLINE_ROUTE_ESTIMATE.roadWindingFactor;
  return Math.max(5, Math.round((roadKm / OFFLINE_ROUTE_ESTIMATE.averageSpeedKph) * 60));
}

/**
 * Turn a free-flow routed duration into a plausible range.
 *
 * The lower bound is the routed time itself: with an empty road that is
 * roughly what the drive takes. Everything real-world — traffic, weather, the
 * fact that the router models neither — widens the upper bound only.
 */
export function estimateJourney(
  route: ProviderInput<RouteResult>,
  weather: ProviderInput<WeatherSnapshot>,
  distanceKm: number,
  arriveAround: Instant,
  timeZone: string,
  roadDisruption: ProviderInput<RoadDisruptionSnapshot> | null = null,
): JourneyEstimate {
  const routed = route.state !== 'unavailable' && route.value !== null;
  const baseMinutes = routed
    ? Math.max(1, Math.round(route.value!.durationSeconds / 60))
    : estimateMinutesWithoutRouting(distanceKm);

  const reasons: string[] = [];
  let fraction = JOURNEY_UNCERTAINTY.baseFraction;
  reasons.push('Routing gives free-flow driving times, so the upper end allows for normal traffic.');

  if (!routed) {
    fraction += JOURNEY_UNCERTAINTY.noRoutingFraction;
    reasons.push('No routing service answered, so this is a distance-based estimate.');
  }

  const hour = localHour(arriveAround, timeZone);
  if (isWeekday(arriveAround, timeZone) && JOURNEY_UNCERTAINTY.peakHours.includes(hour as never)) {
    fraction += JOURNEY_UNCERTAINTY.peakFraction;
    reasons.push('The journey falls in a weekday peak period.');
  }

  const severity = weather.value?.severity ?? null;
  if (severity && severity !== 'clear') {
    fraction += JOURNEY_UNCERTAINTY.weatherFraction[severity];
    reasons.push(
      severity === 'poor'
        ? 'Poor weather is expected around this time.'
        : 'Some rain or wind is expected around this time.',
    );
  }

  /*
   * Only genuinely disruptive events widen the estimate, and only when in
   * force. Routine lane closures for maintenance are the normal state of the
   * motorway network — there are typically dozens within 40 km of any airport
   * — so letting them add time would put a permanent, meaningless penalty on
   * every recommendation. They are still reported; they just do not move the
   * number.
   *
   * A reported closure is a reason to allow more time, not a basis for
   * claiming to know how much longer the drive takes.
   */
  const disruptions = roadDisruption?.state === 'ok' ? roadDisruption.value?.disruptions ?? [] : [];
  const disruptive = disruptions.filter(
    (entry) => entry.active && entry.routeMatch === 'on-route' &&
      (entry.category === 'closure' || entry.category === 'incident'),
  );
  if (disruptive.length > 0) {
    const closures = disruptive.filter((entry) => entry.category === 'closure').length;
    fraction += closures > 0 ? 0.2 : 0.1;
    reasons.push(
      closures > 0
        ? 'A road closure is reported on or very close to the route.'
        : 'An incident is reported on or very close to the route.',
    );
  }

  const maxMinutes = Math.max(
    baseMinutes + JOURNEY_UNCERTAINTY.minimumSlackMinutes,
    Math.ceil(baseMinutes * (1 + fraction)),
  );

  return {
    range: { minMinutes: baseMinutes, maxMinutes },
    baseMinutes,
    routed,
    uncertaintyReasons: reasons,
  };
}
