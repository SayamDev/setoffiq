import { DEFAULT_AIRPORT } from '../domain/airports';
import { formatClock, formatDate, formatRelative } from '../domain/time';
import type { SavedJourney } from '../domain/types';
import { navigate } from '../app/router';
import { ActivityLog } from '../components/ActivityLog';
import { ChangeNotice } from '../components/ChangeNotice';
import { ExplanationPanel } from '../components/ExplanationPanel';
import { FlightStatusCard } from '../components/FlightStatusCard';
import { JourneyTimeline } from '../components/JourneyTimeline';
import { RecommendationCard } from '../components/RecommendationCard';
import { ScenarioSwitcher } from '../components/ScenarioSwitcher';
import { ReasoningPanel } from '../components/ReasoningPanel';
import { WeatherCard } from '../components/WeatherCard';
import { Badge, Button, Callout, Card, Skeleton, ui } from '../components/ui';
import { useMonitoredJourney } from '../hooks/useMonitoredJourney';
import { useNow } from '../hooks/useNow';
import { setMonitoring } from '../storage/journeys';
import type { Settings } from '../storage/settings';
import styles from './PlanPage.module.css';
import cardStyles from '../components/StatusCards.module.css';

const MONITORING_LABEL = {
  active: 'Monitoring',
  paused: 'Monitoring paused',
  stopped: 'Monitoring stopped',
  off: 'Not monitored',
} as const;

export function JourneyPage({
  journey,
  settings,
  onSave,
  onDelete,
}: {
  journey: SavedJourney | null;
  settings: Settings;
  onSave: (journey: SavedJourney) => void;
  onDelete: (id: string) => void;
}): React.JSX.Element {
  const airport = DEFAULT_AIRPORT;
  const now = useNow(30_000);
  const monitor = useMonitoredJourney(journey, airport, settings, onSave);

  if (!journey) {
    return (
      <Callout tone="info" title="That journey is no longer saved">
        <p>It may have been deleted, or saved in a different browser.</p>
        <p>
          <Button variant="secondary" onClick={() => navigate({ name: 'journeys' })}>
            Back to your journeys
          </Button>
        </p>
      </Callout>
    );
  }

  const zone = airport.timeZone;
  const recommendation =
    monitor.plan && monitor.plan.recommendation.kind !== 'unavailable'
      ? monitor.plan.recommendation
      : null;

  const toggleMonitoring = (): void => {
    onSave(setMonitoring(journey, journey.monitoring === 'active' ? 'paused' : 'active'));
  };

  const handleDelete = (): void => {
    onDelete(journey.id);
    navigate({ name: 'journeys' });
  };

  return (
    <>
      <header className={styles.header}>
        <a className={styles.back} href="#/journeys">
          ← Your journeys
        </a>
        <h1 className={styles.title}>{journey.label}</h1>
        <p className={styles.subtitle}>
          {journey.input.kind === 'pickup' ? 'Pick up' : 'Drop off'} at {airport.name} ·{' '}
          {formatDate(journey.input.scheduledTime, zone)} at{' '}
          {formatClock(journey.input.scheduledTime, zone)}
        </p>
        <p>
          <Badge tone={journey.monitoring === 'active' ? 'good' : journey.monitoring === 'stopped' ? 'alert' : 'warn'}>
            {MONITORING_LABEL[journey.monitoring]}
          </Badge>
        </p>
      </header>

      {journey.input.scenarioId ? (
        <Card>
          <ScenarioSwitcher journey={journey} onSave={onSave} />
        </Card>
      ) : null}

      {monitor.change ? (
        <ChangeNotice
          previousDeparture={monitor.change.previousDeparture}
          nextDeparture={monitor.change.nextDeparture}
          reason={monitor.change.reason}
          timeZone={zone}
          onDismiss={monitor.dismissChange}
        />
      ) : null}

      {monitor.plan?.recommendation.kind === 'unavailable' ? (
        <Callout tone="alert" title={monitor.plan.recommendation.headline} role="alert">
          <p>{monitor.plan.recommendation.detail}</p>
          <p>Monitoring has been stopped for this journey.</p>
        </Callout>
      ) : null}

      {monitor.status === 'checking' && !recommendation ? (
        <Card>
          <div aria-busy="true" aria-live="polite">
            <p className={styles.loadingCopy}>Checking the latest information…</p>
            <Skeleton height="3.5rem" />
          </div>
        </Card>
      ) : null}

      {monitor.status === 'error' ? (
        <Callout tone="warn" title="We couldn't refresh this journey" role="status">
          <p>
            {monitor.error} The recommendation below is the last one SetoffIQ was able to
            calculate.
          </p>
          <p>
            <Button variant="secondary" onClick={monitor.check}>
              Try again
            </Button>
          </p>
        </Callout>
      ) : null}

      {recommendation && monitor.plan ? (
        <>
          <RecommendationCard recommendation={recommendation} airport={airport} now={now}>
            <div className={styles.actions}>
              <Button variant="secondary" onClick={monitor.check} disabled={monitor.status === 'checking'}>
                {monitor.status === 'checking' ? 'Checking…' : 'Check now'}
              </Button>
              <Button variant="secondary" onClick={toggleMonitoring}>
                {journey.monitoring === 'active' ? 'Pause monitoring' : 'Resume monitoring'}
              </Button>
              <Button variant="danger" onClick={handleDelete}>
                Delete journey
              </Button>
            </div>
            <p className={ui.hint} aria-live="polite">
              {journey.lastCheckedAt
                ? `Last checked ${formatRelative(journey.lastCheckedAt, now)}.`
                : 'Not checked yet.'}{' '}
              {monitor.nextCheckAt && journey.monitoring === 'active'
                ? `Next check ${formatRelative(monitor.nextCheckAt, now)}, while this page is open.`
                : 'Automatic checks are not scheduled.'}
            </p>
            <p className={ui.hint}>
              SetoffIQ runs entirely in your browser, so it can only check while this page is open.
              Reopening it refreshes straight away.
            </p>
          </RecommendationCard>

          <section className={styles.section} aria-labelledby="live-heading">
            <h2 className={styles.sectionTitle} id="live-heading">
              Live information
            </h2>
            <div className={cardStyles.grid}>
              <FlightStatusCard
                flight={monitor.plan.flight}
                timeZone={zone}
                now={now}
                isTestData={Boolean(journey.input.scenarioId)}
              />
              <WeatherCard weather={monitor.plan.weather} timeZone={zone} now={now} />
            </div>
          </section>

          <section className={styles.section} aria-labelledby="timeline-heading">
            <h2 className={styles.sectionTitle} id="timeline-heading">
              Timeline
            </h2>
            <Card>
              <JourneyTimeline recommendation={recommendation} timeZone={zone} now={now} />
            </Card>
          </section>

          <section className={styles.section} aria-labelledby="why-heading">
            <h2 className={styles.sectionTitle} id="why-heading">
              Why this time?
            </h2>
            <Card>
              <ReasoningPanel recommendation={recommendation} />
            </Card>
            <Card quiet>
              <ExplanationPanel
                plan={monitor.plan}
                recommendation={recommendation}
                airport={airport}
                useLocalModel={settings.useLocalModel}
              />
            </Card>
          </section>
        </>
      ) : null}

      <section className={styles.section} aria-labelledby="activity-heading">
        <h2 className={styles.sectionTitle} id="activity-heading">
          Activity
        </h2>
        <Card>
          <ActivityLog events={journey.events} timeZone={zone} />
        </Card>
      </section>
    </>
  );
}
