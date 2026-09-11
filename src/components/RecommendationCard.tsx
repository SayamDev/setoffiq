import { formatClock, formatClockRange, formatDate, formatMinuteRange } from '../domain/time';
import type { AirportProfile, Instant, Recommendation } from '../domain/types';
import { ConfidenceBadge } from './ConfidenceBadge';
import styles from './RecommendationCard.module.css';

const HERO_CLASS: Record<string, string> = {
  'leave-now': styles.heroAccent!,
  'running-late': styles.heroWarn!,
};

/**
 * The screen the whole product exists for.
 *
 * Reading order is fixed and deliberate: the departure time, then what it is
 * built around, then how much to trust it. Nothing is buried in a chart.
 */
export function RecommendationCard({
  recommendation,
  airport,
  now,
  children,
}: {
  recommendation: Recommendation;
  airport: AirportProfile;
  now: Instant;
  children?: React.ReactNode;
}): React.JSX.Element {
  const zone = airport.timeZone;
  const heroClass = HERO_CLASS[recommendation.advisory.kind] ?? styles.hero!;
  const sameDay =
    formatDate(recommendation.recommendedDeparture, zone) === formatDate(now, zone);

  return (
    <section className={styles.card} aria-labelledby="recommendation-heading">
      <div className={heroClass}>
        <p className={styles.eyebrow} id="recommendation-heading">
          Recommended departure
        </p>
        <p className={styles.time}>{formatClock(recommendation.recommendedDeparture, zone)}</p>
        <p className={styles.day}>
          {sameDay ? 'Today' : formatDate(recommendation.recommendedDeparture, zone)} ·{' '}
          {airport.name} time
        </p>
        <p className={styles.advisoryHeadline}>{recommendation.advisory.headline}</p>
        <p className={styles.advisoryDetail}>{recommendation.advisory.detail}</p>
      </div>

      <dl className={styles.details}>
        {recommendation.kind === 'pickup' ? (
          <div>
            <dt className={styles.term}>Passenger likely ready</dt>
            <dd className={styles.value}>
              {formatClockRange(recommendation.readiness.window, zone)}
            </dd>
          </div>
        ) : (
          <div>
            <dt className={styles.term}>At the terminal</dt>
            <dd className={styles.value}>
              {formatClockRange(recommendation.terminalArrivalWindow, zone)}
            </dd>
          </div>
        )}

        <div>
          <dt className={styles.term}>Arrive at airport</dt>
          <dd className={styles.value}>
            {formatClockRange(recommendation.airportArrivalWindow, zone)}
          </dd>
        </div>

        <div>
          <dt className={styles.term}>Journey</dt>
          <dd className={styles.value}>{formatMinuteRange(recommendation.journey)}</dd>
        </div>

        <div>
          <dt className={styles.term}>Confidence</dt>
          <dd className={styles.valueText}>
            <ConfidenceBadge confidence={recommendation.confidence} />
          </dd>
        </div>
      </dl>

      {children ? <div className={styles.footer}>{children}</div> : null}
    </section>
  );
}
