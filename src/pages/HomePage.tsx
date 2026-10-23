import { hrefFor } from '../app/router';
import { JourneyMotion } from '../components/JourneyMotion';
import styles from './HomePage.module.css';

export function HomePage(): React.JSX.Element {
  return (
    <>
      <section className={styles.hero}>

        <h1 className={styles.tagline}>Know when to set off for Manchester Airport.</h1>
        <p className={styles.lede}>
          Enter a flight, date and postcode. We’ll check what we can, ask only for missing details, and explain your time to leave.
        </p>
        <a className={styles.voiceStart} href={`${hrefFor({ name: 'plan', kind: 'pickup' })}?mode=voice`}>Plan with voice <JourneyMotion /></a>
      </section>

      <section aria-labelledby="what-are-you-planning">
        <h2 className={styles.question} id="what-are-you-planning">
          Choose your journey
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

      <p className={styles.footnote}>Speak or type. No account needed. Your microphone only starts when you tap Start talking.</p>
    </>
  );
}
