import type { Recommendation, RecommendationFactor } from '../domain/types';
import styles from './ReasoningPanel.module.css';

const BASIS_LABEL: Record<RecommendationFactor['basis'], string> = {
  'live-data': 'Live data',
  'user-supplied': 'From you',
  assumption: 'Assumption',
  unavailable: 'Unavailable',
};

function basisClass(basis: RecommendationFactor['basis']): string {
  if (basis === 'live-data') return styles.basisLive!;
  if (basis === 'unavailable') return styles.basisUnavailable!;
  return styles.basis!;
}

/**
 * "Why this time?" answered without technical language.
 *
 * Each factor is tagged with where it came from, so measured data, the user's
 * own input and SetoffIQ's assumptions can never be mistaken for one another.
 */
export function ReasoningPanel({
  recommendation,
}: {
  recommendation: Recommendation;
}): React.JSX.Element {
  return (
    <div>
      <dl className={styles.list}>
        {recommendation.factors.map((factor) => (
          <div className={styles.item} key={factor.id}>
            <dt className={styles.label}>{factor.label}</dt>
            <dd className={styles.value}>
              <span>{factor.value}</span>
              <span className={basisClass(factor.basis)}>{BASIS_LABEL[factor.basis]}</span>
            </dd>
            <p className={styles.detail}>{factor.detail}</p>
          </div>
        ))}
      </dl>

      <div className={styles.confidenceReasons}>
        <h3>How confident is this?</h3>
        {recommendation.confidence.reasons.map((reason) => (
          <p className={styles.reason} key={reason.label}>
            <span className={styles.reasonMark} aria-hidden="true">
              {reason.impact === 'positive' ? '✓' : '–'}
            </span>
            <span>
              <strong>{reason.label}.</strong> {reason.detail}
            </span>
          </p>
        ))}
        <p className={styles.reason}>
          <span className={styles.reasonMark} aria-hidden="true">
            ⓘ
          </span>
          <span>
            Confidence is a SetoffIQ heuristic that reflects how much current
            information was available. It is not a validated statistical probability.
          </span>
        </p>
      </div>
    </div>
  );
}
