import { formatClock, formatClockRange, formatDate, formatMinuteRange } from '../domain/time';
import type { AdvisoryKind, AirportProfile, Instant, Recommendation } from '../domain/types';
import { ConfidenceBadge } from './ConfidenceBadge';
import styles from './RecommendationCard.module.css';

/** The signal bar restates the advisory, which is always also written out. */
const SIGNAL_CLASS: Record<AdvisoryKind, string> = {
  'leave-now': styles.signalGo!,
  wait: styles.signalWait!,
  plan: styles.signalWait!,
  'running-late': styles.signalLate!,
  blocked: styles.signalLate!,
};

/**
 * The screen the whole product exists for.
 *
 * Reading order is fixed and deliberate: the departure time, what to do about
 * it, then the three numbers that qualify it, then how much to trust it.
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
  const sameDay = formatDate(recommendation.recommendedDeparture, zone) === formatDate(now, zone);

  return (
    <section className={styles.card} aria-labelledby="recommendation-heading">
      <div className={SIGNAL_CLASS[recommendation.advisory.kind]} aria-hidden="true" />

      <div className={styles.head}>
        <p className={styles.eyebrow} id="recommendation-heading">
          Recommended departure
        </p>
        <div className={styles.confidence}>
          <ConfidenceBadge confidence={recommendation.confidence} />
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.timeBlock}>
          <p className={styles.time}>{formatClock(recommendation.recommendedDeparture, zone)}</p>
          <p className={styles.day}>
            {sameDay ? 'Today' : formatDate(recommendation.recommendedDeparture, zone)} ·{' '}
            {airport.iataCode} time
          </p>
        </div>

        <div className={styles.advice}>
          <p className={styles.adviceHeadline}>{recommendation.advisory.headline}</p>
          <p className={styles.adviceDetail}>{recommendation.advisory.detail}</p>
        </div>
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
      </dl>

      {children ? <div className={styles.footer}>{children}</div> : null}
    </section>
  );
}
