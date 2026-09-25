import type { TrackerView } from '../domain/engine';
import styles from './FlightTracker.module.css';

/**
 * Where the aircraft is, and whether it has landed.
 *
 * The headline answers the question people actually ask — "has it landed?" —
 * and the line under it always says where that came from and how old it is,
 * because the positions behind it can be minutes or hours old.
 */
export function FlightTracker({ view }: { view: TrackerView }): React.JSX.Element {
  const tone = {
    neutral: styles.headline,
    active: styles.headlineActive,
    good: styles.headlineGood,
    alert: styles.headlineAlert,
  }[view.tone];

  return (
    <div className={styles.tracker}>
      {view.steps.length ? (
        <ol className={styles.steps} aria-label="Flight progress">
          {view.steps.map((step) => (
            <li
              key={step.id}
              className={
                step.state === 'current' ? styles.stepCurrent : step.state === 'done' ? styles.stepDone : styles.step
              }
              aria-current={step.state === 'current' ? 'step' : undefined}
            >
              <span className={styles.dot} aria-hidden="true" />
              <span className={styles.stepLabel}>{step.label}</span>
            </li>
          ))}
        </ol>
      ) : null}

      <p className={tone} role="status" aria-live="polite">
        {view.headline}
      </p>
      {view.facts.length ? <p className={styles.facts}>{view.facts.join(' · ')}</p> : null}
      <p className={styles.basis}>{view.basis}</p>
    </div>
  );
}
