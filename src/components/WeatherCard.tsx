import { formatClock } from '../domain/time';
import type { Instant, Observed, WeatherSnapshot } from '../domain/types';
import { DataFreshnessLabel } from './DataFreshnessLabel';
import { Badge, Card } from './ui';
import styles from './StatusCards.module.css';

const SEVERITY_TONE = { clear: 'good', moderate: 'warn', poor: 'alert' } as const;
const SEVERITY_WORDING = {
  clear: 'Not adding uncertainty',
  moderate: 'Some added uncertainty',
  poor: 'Significant added uncertainty',
} as const;

export function WeatherCard({
  weather,
  timeZone,
  now,
}: {
  weather: Observed<WeatherSnapshot>;
  timeZone: string;
  now: Instant;
}): React.JSX.Element {
  if (weather.state === 'unavailable' || !weather.value) {
    return (
      <Card>
        <div className={styles.head}>
          <p className={styles.title}>Weather</p>
        </div>
        <p className={styles.primary}>Unavailable</p>
        <p className={styles.secondary}>
          {weather.message ?? "We couldn't check conditions."} Your journey estimate does not
          include a weather allowance.
        </p>
      </Card>
    );
  }

  const snapshot = weather.value;

  return (
    <Card>
      <div className={styles.head}>
        <p className={styles.title}>Weather at the airport</p>
        <Badge tone={SEVERITY_TONE[snapshot.severity]}>{SEVERITY_WORDING[snapshot.severity]}</Badge>
      </div>

      <p className={styles.primary}>{snapshot.description}</p>
      <p className={styles.secondary}>Around {formatClock(snapshot.validFor, timeZone)}</p>

      <p className={styles.metrics}>
        <span className={styles.metric}>{Math.round(snapshot.temperatureC)}°C</span>
        <span className={styles.metric}>{Math.round(snapshot.windSpeedKph)} km/h wind</span>
        <span className={styles.metric}>{snapshot.precipitationMm.toFixed(1)} mm rain</span>
        {snapshot.visibilityM !== null ? (
          <span className={styles.metric}>
            {(snapshot.visibilityM / 1000).toFixed(1)} km visibility
          </span>
        ) : null}
      </p>

      <DataFreshnessLabel observedAt={weather.fetchedAt} now={now} timeZone={timeZone} label="Checked" />
    </Card>
  );
}
