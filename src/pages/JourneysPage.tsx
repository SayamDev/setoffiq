import { DEFAULT_AIRPORT } from '../domain/airports';
import type { SavedJourney } from '../domain/types';
import { hrefFor } from '../app/router';
import { EmptyState } from '../components/EmptyState';
import { SavedJourneyCard } from '../components/SavedJourneyCard';
import { LinkButton, ui } from '../components/ui';
import styles from './PlanPage.module.css';

export function JourneysPage({ journeys }: { journeys: SavedJourney[] }): React.JSX.Element {
  const sorted = [...journeys].sort((a, b) => a.input.scheduledTime - b.input.scheduledTime);

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>Your journeys</h1>
        <p className={styles.subtitle}>
          Saved journeys stay in this browser. They are not sent anywhere and are not tied to an
          account.
        </p>
      </header>

      {sorted.length === 0 ? (
        <EmptyState
          title="No saved journeys yet"
          action={<LinkButton href={hrefFor({ name: 'home' })}>Plan a journey</LinkButton>}
        >
          Plan a pickup or drop-off and choose "Monitor this journey" to keep it here.
        </EmptyState>
      ) : (
        <ul className={`${ui.stackTight} ${styles.journeyGrid}`}>
          {sorted.map((journey) => (
            <li key={journey.id}>
              <SavedJourneyCard journey={journey} timeZone={DEFAULT_AIRPORT.timeZone} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
