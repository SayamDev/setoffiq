import { hrefFor } from '../app/router';
import { Wordmark } from '../components/Wordmark';
import styles from './HomePage.module.css';

const POINTS = [
  {
    title: 'A real calculation',
    body: 'A deterministic engine works back from the flight to a departure time. The explanation comes after the maths, never instead of it.',
  },
  {
    title: 'Honest about what it knows',
    body: 'Live aircraft positions where they exist, your own booking where they do not, and a label on every assumption.',
  },
  {
    title: 'Yours, on your device',
    body: 'No account, no tracking, no server holding your journeys. Saved plans stay in this browser.',
  },
];

export function HomePage(): React.JSX.Element {
  return (
    <>
      <section className={styles.hero}>
        <h1 className={styles.title}>
          <Wordmark />
        </h1>
        <p className={styles.tagline}>Know when to set off. Know when to wait.</p>
        <p className={styles.lede}>
          Plan airport pickups and drop-offs using available flight, journey and weather
          information — so you arrive at the right time instead of arriving early and waiting.
        </p>
      </section>

      <section aria-labelledby="what-are-you-planning">
        <h2 className={styles.question} id="what-are-you-planning">
          What are you planning?
        </h2>
        <div className={styles.choices}>
          <a className={styles.choice} href={hrefFor({ name: 'plan', kind: 'pickup' })}>
            <span className={styles.choiceTitle}>Collect an arriving passenger</span>
            <span className={styles.choiceBody}>
              Use their flight arrival time to work out when to set off for the airport.
            </span>
            <span className={styles.choiceGo}>
              Plan a pickup
              <span className={styles.arrow} aria-hidden="true">
                →
              </span>
            </span>
          </a>

          <a className={styles.choice} href={hrefFor({ name: 'plan', kind: 'dropoff' })}>
            <span className={styles.choiceTitle}>Take someone to a departing flight</span>
            <span className={styles.choiceBody}>
              Use their flight departure time to arrive at the terminal with time to spare.
            </span>
            <span className={styles.choiceGo}>
              Plan a drop-off
              <span className={styles.arrow} aria-hidden="true">
                →
              </span>
            </span>
          </a>
        </div>
      </section>

      <section className={styles.points}>
        {POINTS.map((point) => (
          <div key={point.title}>
            <p className={styles.pointTitle}>{point.title}</p>
            <p className={styles.pointBody}>{point.body}</p>
          </div>
        ))}
      </section>
    </>
  );
}
