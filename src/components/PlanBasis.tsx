import type { JourneyInput } from '../domain/types';
import type { JourneyPlan } from '../services/plan';
import { DEFAULT_AIRPORT } from '../domain/airports';
import { formatClock, formatDate } from '../domain/time';
import { ui } from './ui';

/** Describes evidence without calculating or upgrading the engine's confidence. */
export function PlanBasis({
  input,
  plan,
}: {
  input: JourneyInput;
  plan: JourneyPlan;
}): React.JSX.Element {
  const zone = DEFAULT_AIRPORT.timeZone;
  const published = input.scheduledTimeSource === 'dated-schedule';
  return (
    <div className={ui.hint} role="status">
      <p>
        <strong>
          {published ? 'Published scheduled time' : 'Booking time'}:{' '}
          {formatClock(input.scheduledTime, zone)}
        </strong>{' '}
        · {formatDate(input.scheduledTime, zone)}.
      </p>
      <p>
        {published
          ? 'Check this against your booking; a schedule is not a live arrival estimate.'
          : 'Your entered time stays the fallback when no aircraft can be matched.'}
        {published && input.scheduledTimeObservedAt != null
          ? ` Schedule published ${formatDate(input.scheduledTimeObservedAt, zone)} at ${formatClock(input.scheduledTimeObservedAt, zone)}.`
          : ''}
        {plan.flight.value?.estimatedArrivalSource === 'live-position'
          ? ' An aircraft-based estimate is available in the journey details.'
          : ''}
      </p>
      <p>
        {plan.route.state !== 'unavailable' && plan.route.value
          ? plan.route.state === 'stale'
            ? 'Drive based on an older road route; refresh before travelling.'
            : 'Drive based on a road route; traffic can change.'
          : 'Drive based on a distance estimate because road routing is unavailable.'}{' '}
        Calculated at {formatClock(plan.computedAt, zone)} Manchester time.
      </p>
    </div>
  );
}
