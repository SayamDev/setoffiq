import { READINESS_STAGES, type ReadinessProgress } from '../domain/signals';
import { stageLabel } from '../domain/engine/stages';
import styles from './ReadinessStages.module.css';

/**
 * A landed flight is not a ready passenger, and that gap is the whole product.
 * Showing the stages makes the gap legible — and marks which of them were
 * actually observed rather than inferred from the clock.
 */
export function ReadinessStages({ progress }: { progress: ReadinessProgress }): React.JSX.Element {
  const currentIndex = READINESS_STAGES.indexOf(progress.stage);

  return (
    <div>
      <ol className={styles.list}>
        {READINESS_STAGES.map((stage, index) => {
          const isCurrent = index === currentIndex;
          const isPast = currentIndex >= 0 && index < currentIndex;
          return (
            <li
              key={stage}
              className={isCurrent ? styles.stageCurrent : isPast ? styles.stagePast : styles.stage}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span className={isPast || isCurrent ? styles.tickOn : styles.tick} aria-hidden="true" />
              {stageLabel(stage)}
            </li>
          );
        })}
      </ol>

      <p className={styles.detail}>{progress.detail}</p>
      <p className={styles.inferred}>
        {progress.observed
          ? 'This stage was observed from the aircraft position.'
          : 'This stage is inferred from the expected timings, not observed. No source publishes live disembarkation, border or baggage progress.'}
      </p>
    </div>
  );
}
