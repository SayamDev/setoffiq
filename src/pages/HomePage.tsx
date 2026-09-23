import { hrefFor } from '../app/router';
import { Wordmark } from '../components/Wordmark';
import styles from './HomePage.module.css';

const STEPS = [
  {
    title: 'Choose your journey',
    body: 'Tell us whether you are collecting someone or taking them to the airport.',
  },
  {
    title: 'Add the details',
    body: 'Enter the flight time and where you are travelling from.',
  },
  {
    title: 'Get your set-off time',
    body: 'See a recommended time to leave, with the journey and flight information behind it.',
  },
];

export function HomePage(): React.JSX.Element {
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.wordmark}>
          <Wordmark />
        </div>
        <h1 className={styles.tagline}>Know when to set off for Manchester Airport.</h1>
        <p className={styles.lede}>
          Plan a pickup or drop-off around the flight and your journey. Get a clear time to leave,
          with the details that shaped it.
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

      <section className={styles.steps} aria-labelledby="how-it-works">
        <h2 className={styles.question} id="how-it-works">
          How it works
        </h2>
        <div className={styles.stepList}>
          {STEPS.map((step, index) => (
            <div className={styles.step} key={step.title}>
              <span className={styles.stepNumber} aria-hidden="true">
                0{index + 1}
              </span>
              <div>
                <p className={styles.stepTitle}>{step.title}</p>
                <p className={styles.stepBody}>{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
