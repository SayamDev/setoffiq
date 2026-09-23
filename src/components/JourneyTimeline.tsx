import { formatClock } from '../domain/time';
import type { Instant, Recommendation } from '../domain/types';
import styles from './JourneyTimeline.module.css';

interface Step {
  at: Instant;
  title: string;
  note: string;
  reached: boolean;
}

function buildSteps(recommendation: Recommendation, now: Instant, timeZone: string): Step[] {
  const reached = (at: Instant): boolean => now >= at;

  if (recommendation.kind === 'pickup') {
    return [
      {
        at: recommendation.recommendedDeparture,
        title: 'Set off',
        note: 'Set off so the slower end of your drive still gets you there in time.',
        reached: reached(recommendation.recommendedDeparture),
      },
      {
        at: recommendation.airportArrivalWindow.latest,
        title: 'Arrive at the airport',
        note: `Between ${formatClock(recommendation.airportArrivalWindow.earliest, timeZone)} and this time, depending on traffic.`,
        reached: reached(recommendation.airportArrivalWindow.latest),
      },
      {
        at: recommendation.readiness.window.earliest,
        title: 'Passenger could be ready',
        note: 'The earliest they realistically clear the airport.',
        reached: reached(recommendation.readiness.window.earliest),
      },
      {
        at: recommendation.readiness.window.latest,
        title: 'Latest expected readiness',
        note: 'If bags or border control are slow, this is the far end.',
        reached: reached(recommendation.readiness.window.latest),
      },
    ];
  }

  return [
    {
      at: recommendation.recommendedDeparture,
      title: 'Set off',
      note: 'Set off allowing for the slower end of your drive.',
      reached: reached(recommendation.recommendedDeparture),
    },
    {
      at: recommendation.airportArrivalWindow.latest,
      title: 'Arrive at the airport',
      note: 'Park or pull into the drop-off zone.',
      reached: reached(recommendation.airportArrivalWindow.latest),
    },
    {
      at: recommendation.terminalArrivalWindow.latest,
      title: 'Passenger at the terminal',
      note: 'Ahead of the check-in and bag-drop deadlines their airline sets.',
      reached: reached(recommendation.terminalArrivalWindow.latest),
    },
    {
      at: recommendation.flightDeparture,
      title: 'Flight departs',
      note: 'The scheduled departure time from the booking.',
      reached: reached(recommendation.flightDeparture),
    },
  ];
}

export function JourneyTimeline({
  recommendation,
  timeZone,
  now,
}: {
  recommendation: Recommendation;
  timeZone: string;
  now: Instant;
}): React.JSX.Element {
  const steps = buildSteps(recommendation, now, timeZone);

  return (
    <ol className={styles.list}>
      {steps.map((step, index) => (
        <li className={styles.step} key={step.title}>
          <span className={styles.time}>{formatClock(step.at, timeZone)}</span>
          <span className={styles.rail} aria-hidden="true">
            <span className={step.reached ? styles.dotFilled : styles.dot} />
            {index < steps.length - 1 ? <span className={styles.line} /> : null}
          </span>
          <span className={styles.body}>
            <span className={styles.title}>{step.title}</span>
            <p className={styles.note}>{step.note}</p>
          </span>
        </li>
      ))}
    </ol>
  );
}
