import { formatClock } from '../domain/time';
import type { FlightStatus, Instant, Observed } from '../domain/types';
import { DataFreshnessLabel } from './DataFreshnessLabel';
import { Badge, Callout } from './ui';
import styles from './StatusCards.module.css';

const PHASE_WORDING: Record<FlightStatus['phase'], { label: string; tone: 'neutral' | 'good' | 'warn' | 'alert' }> = {
  scheduled: { label: 'Scheduled', tone: 'neutral' },
  airborne: { label: 'Airborne', tone: 'good' },
  landed: { label: 'Landed', tone: 'good' },
  cancelled: { label: 'Cancelled', tone: 'alert' },
  diverted: { label: 'Diverted', tone: 'alert' },
  unknown: { label: 'Unknown', tone: 'warn' },
};

/**
 * What SetoffIQ actually knows about the flight, and what it does not.
 *
 * When there is no live position this card says so plainly rather than
 * dressing the user's own scheduled time up as tracking.
 */
export function FlightStatusCard({
  flight,
  timeZone,
  now,
  isTestData = false,
}: {
  flight: Observed<FlightStatus>;
  timeZone: string;
  now: Instant;
  isTestData?: boolean;
}): React.JSX.Element {
  if (flight.state === 'unavailable' || !flight.value) {
    return (
      <div className={styles.panel}>
        <div className={styles.head}>
          <p className={styles.title}>Flight</p>
        </div>
        <p className={styles.primaryText}>Temporarily unavailable</p>
        <p className={styles.secondary}>
          {flight.message ?? "We couldn't check for live flight information."} Your recommendation
          is based on the scheduled time you entered.
        </p>
      </div>
    );
  }

  const status = flight.value;
  const phase = PHASE_WORDING[status.phase];
  const source = status.estimatedArrivalSource;
  const live = source === 'live-position';
  const simulated = source === 'scenario';

  return (
    <div className={styles.panel}>
      {isTestData ? (
        <div className={styles.testBanner}>
          <Badge tone="warn">Test data — not live</Badge>
        </div>
      ) : null}

      <div className={styles.head}>
        <p className={styles.title}>Flight {status.flightNumber ?? ''}</p>
        <Badge tone={phase.tone}>{phase.label}</Badge>
      </div>

      <p className={status.estimatedArrival ? styles.primary : styles.primaryText}>
        {status.estimatedArrival ? formatClock(status.estimatedArrival, timeZone) : 'No estimate'}
      </p>
      <p className={styles.secondary}>
        {live
          ? 'Estimated arrival on stand, from the aircraft position'
          : source === 'airline-schedule'
            ? "Estimated arrival from the airline schedule — the aircraft isn't in range yet"
            : simulated
              ? 'Simulated arrival from a test scenario — not live information'
              : 'Scheduled arrival, as you entered it'}
      </p>

      {status.position ? (
        <p className={styles.metrics}>
          <span className={styles.metric}>{status.position.distanceToAirportKm} km out</span>
          {status.position.baroAltitudeM !== null ? (
            <span className={styles.metric}>
              {Math.round(status.position.baroAltitudeM).toLocaleString('en-GB')} m
            </span>
          ) : null}
          {status.position.groundSpeedMps !== null ? (
            <span className={styles.metric}>
              {Math.round((status.position.groundSpeedMps * 3600) / 1000)} km/h
            </span>
          ) : null}
          {status.callsign ? <span className={styles.metric}>{status.callsign}</span> : null}
        </p>
      ) : null}

      {flight.state === 'stale' ? (
        <Callout tone="warn" role="status">
          <p>
            This is the last flight information we have. Treat it as out of date and allow extra
            time.
          </p>
        </Callout>
      ) : null}

      {!live && flight.message ? <p className={styles.secondary}>{flight.message}</p> : null}

      <DataFreshnessLabel observedAt={flight.observedAt} now={now} timeZone={timeZone} />
    </div>
  );
}
