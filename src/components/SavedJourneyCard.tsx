import { formatClock, formatDate } from '../domain/time';
import type { Instant, SavedJourney } from '../domain/types';
import { hrefFor } from '../app/router';
import { latestVersion } from '../storage/journeys';
import { Badge } from './ui';
import styles from './JourneyExtras.module.css';

const MONITORING_TONE = {
  active: 'good',
  paused: 'warn',
  stopped: 'neutral',
  off: 'neutral',
} as const;

const MONITORING_LABEL = {
  active: 'Monitoring',
  paused: 'Paused',
  stopped: 'Stopped',
  off: 'Not monitored',
} as const;

export function SavedJourneyCard({
  journey,
  timeZone,
}: {
  journey: SavedJourney;
  timeZone: string;
}): React.JSX.Element {
  const version = latestVersion(journey);
  const scheduled: Instant = journey.input.scheduledTime;

  return (
    <a className={styles.journeyCard} href={hrefFor({ name: 'journey', id: journey.id })}>
      <span className={styles.journeyHead}>
        <span className={styles.journeyLabel}>{journey.label}</span>
        <Badge tone={MONITORING_TONE[journey.monitoring]}>
          {MONITORING_LABEL[journey.monitoring]}
        </Badge>
      </span>
      <span className={styles.journeyMeta}>
        <span>{journey.input.kind === 'pickup' ? 'Pick up' : 'Drop off'}</span>
        <span>{journey.input.airportIata}</span>
        {journey.input.flightNumber ? <span>{journey.input.flightNumber}</span> : null}
        <span>
          {formatDate(scheduled, timeZone)} · {formatClock(scheduled, timeZone)}
        </span>
      </span>
      {version ? (
        <span className={styles.journeyMeta}>
          <span>Leave at {formatClock(version.departure, timeZone)}</span>
          <span>{version.confidence} confidence</span>
        </span>
      ) : null}
    </a>
  );
}
