import { useState } from 'react';
import { DEFAULT_AIRPORT } from '../domain/airports';
import { formatClock, formatDate } from '../domain/time';
import type { JourneyInput, JourneyKind } from '../domain/types';
import { navigate } from '../app/router';
import { ExplanationPanel } from '../components/ExplanationPanel';
import { FlightStatusCard } from '../components/FlightStatusCard';
import { JourneyForm } from '../components/JourneyForm';
import { JourneyTimeline } from '../components/JourneyTimeline';
import { RecommendationCard } from '../components/RecommendationCard';
import { ReasoningPanel } from '../components/ReasoningPanel';
import { WeatherCard } from '../components/WeatherCard';
import { Button, Callout, Card, Skeleton, ui } from '../components/ui';
import { useJourneyPlan } from '../hooks/useJourneyPlan';
import { useNow } from '../hooks/useNow';
import { createJourney } from '../storage/journeys';
import { toVersion } from '../domain/engine';
import type { SavedJourney } from '../domain/types';
import styles from './PlanPage.module.css';
import cardStyles from '../components/StatusCards.module.css';

const LOADING_COPY = [
  'Checking for the aircraft…',
  'Estimating your journey…',
  'Building your departure window…',
];

export function PlanPage({
  kind,
  onSaveJourney,
  useLocalModel,
}: {
  kind: JourneyKind;
  onSaveJourney: (journey: SavedJourney) => void;
  useLocalModel: boolean;
}): React.JSX.Element {
  const airport = DEFAULT_AIRPORT;
  const now = useNow(30_000);
  const [input, setInput] = useState<JourneyInput | null>(null);
  const { status, plan, error, refresh } = useJourneyPlan(input);

  const startMonitoring = (): void => {
    if (!input || !plan || plan.recommendation.kind === 'unavailable') return;
    const label = input.flightNumber
      ? `${input.flightNumber} · ${formatDate(input.scheduledTime, airport.timeZone)}`
      : `${kind === 'pickup' ? 'Pickup' : 'Drop-off'} · ${formatDate(input.scheduledTime, airport.timeZone)}`;

    let journey = createJourney(label, input, plan.computedAt);
    journey = {
      ...journey,
      lastCheckedAt: plan.computedAt,
      versions: [
        toVersion(
          plan.recommendation,
          plan.flight.value?.phase ?? 'unknown',
          plan.flight.observedAt,
          null,
          `${journey.id}-v1`,
        ),
      ],
    };
    onSaveJourney(journey);
    navigate({ name: 'journey', id: journey.id });
  };

  return (
    <>
      <header className={styles.header}>
        <a className={styles.back} href="#/">
          ← Back
        </a>
        <h1 className={styles.title}>
          {kind === 'pickup' ? 'Pick someone up' : 'Drop someone off'}
        </h1>
        <p className={styles.subtitle}>
          {kind === 'pickup'
            ? 'SetoffIQ works back from when your passenger is likely to walk out, so you arrive about when they do.'
            : 'SetoffIQ works back from the departure time, allowing time at the terminal and for the drive.'}
        </p>
      </header>

      {input === null ? (
        <Card>
          <JourneyForm kind={kind} airport={airport} now={now} onSubmit={setInput} />
        </Card>
      ) : null}

      {status === 'loading' ? (
        <Card>
          <div className={styles.loading} aria-busy="true" aria-live="polite">
            <p className={styles.loadingCopy}>{LOADING_COPY.join(' ')}</p>
            <Skeleton height="3.5rem" />
            <Skeleton height="1rem" width="70%" />
            <Skeleton height="1rem" width="50%" />
          </div>
        </Card>
      ) : null}

      {status === 'error' ? (
        <Callout tone="alert" title="We couldn't build a recommendation" role="alert">
          <p>{error}</p>
          <p>
            <Button variant="secondary" onClick={refresh}>
              Try again
            </Button>
          </p>
        </Callout>
      ) : null}

      {status === 'ready' && plan ? (
        plan.recommendation.kind === 'unavailable' ? (
          <>
            <Callout tone="alert" title={plan.recommendation.headline} role="alert">
              <p>{plan.recommendation.detail}</p>
            </Callout>
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => setInput(null)}>
                Change the details
              </Button>
            </div>
          </>
        ) : (
          <>
            <RecommendationCard recommendation={plan.recommendation} airport={airport} now={now}>
              <div className={styles.actions}>
                <Button onClick={startMonitoring}>Monitor this journey</Button>
                <Button variant="secondary" onClick={() => setInput(null)}>
                  Change the details
                </Button>
                <Button variant="quiet" onClick={refresh}>
                  Refresh
                </Button>
              </div>
              <p className={ui.hint}>
                Monitoring keeps this journey in your browser and rechecks it while SetoffIQ is
                open.
              </p>
            </RecommendationCard>

            <section className={styles.section} aria-labelledby="why-heading">
              <h2 className={styles.sectionTitle} id="why-heading">
                What is driving this recommendation?
              </h2>
              <Card>
                <ReasoningPanel recommendation={plan.recommendation} />
              </Card>
              <Card quiet>
                <ExplanationPanel
                  plan={plan}
                  recommendation={plan.recommendation}
                  airport={airport}
                  useLocalModel={useLocalModel}
                />
              </Card>
            </section>

            <section className={styles.section} aria-labelledby="timeline-heading">
              <h2 className={styles.sectionTitle} id="timeline-heading">
                Your timeline
              </h2>
              <Card>
                <JourneyTimeline
                  recommendation={plan.recommendation}
                  timeZone={airport.timeZone}
                  now={now}
                />
              </Card>
            </section>

            <section className={styles.section} aria-labelledby="sources-heading">
              <h2 className={styles.sectionTitle} id="sources-heading">
                What SetoffIQ checked
              </h2>
              <div className={cardStyles.grid}>
                <FlightStatusCard
                  flight={plan.flight}
                  timeZone={airport.timeZone}
                  now={now}
                  isTestData={Boolean(input?.scenarioId)}
                />
                <WeatherCard weather={plan.weather} timeZone={airport.timeZone} now={now} />
              </div>

              <div className={styles.notes}>
                {plan.route.state !== 'ok' && plan.route.message ? (
                  <p className={styles.note}>
                    <span aria-hidden="true">⚠</span>
                    <span>{plan.route.message}</span>
                  </p>
                ) : null}
                {airport.notes.map((note) => (
                  <p className={styles.note} key={note}>
                    <span aria-hidden="true">ⓘ</span>
                    <span>{note}</span>
                  </p>
                ))}
                <p className={styles.note}>
                  <span aria-hidden="true">ⓘ</span>
                  <span>
                    Airport parking and drop-off zones are charged by the airport. SetoffIQ does not
                    show prices because it has no reliable current source for them — check{' '}
                    <a href={airport.officialLinks[0]?.url} rel="noreferrer noopener">
                      the airport's own parking information
                    </a>{' '}
                    before you travel.
                  </span>
                </p>
                <p className={styles.note}>
                  <span aria-hidden="true">ⓘ</span>
                  <span>
                    Calculated at {formatClock(plan.computedAt, airport.timeZone)}, {airport.name}{' '}
                    time.
                  </span>
                </p>
              </div>
            </section>
          </>
        )
      ) : null}
    </>
  );
}
