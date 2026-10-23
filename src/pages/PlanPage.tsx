import {
  FlightRouteSummary,
  shortRoute,
} from '../components/FlightRouteSummary';
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_AIRPORT } from '../domain/airports';
import { formatClock, formatDate } from '../domain/time';
import type { JourneyInput, JourneyKind } from '../domain/types';
import { signalDetails } from '../components/signalDetails';
import { hrefFor, navigate } from '../app/router';
import { ExplanationPanel } from '../components/ExplanationPanel';
import { VoiceJourney } from '../components/VoiceJourney';
import { PlanBasis } from '../components/PlanBasis';
import { QuickJourney } from '../components/QuickJourney';
import { JourneyForm } from '../components/JourneyForm';
import { JourneyTimeline } from '../components/JourneyTimeline';
import { RecommendationCard } from '../components/RecommendationCard';
import { SignalTable } from '../components/SignalTable';
import { ReadinessStages } from '../components/ReadinessStages';
import { Button, Callout, Card, Skeleton, ui } from '../components/ui';
import { useJourneyPlan } from '../hooks/useJourneyPlan';
import { useNow } from '../hooks/useNow';
import { createJourney } from '../storage/journeys';
import { toVersion } from '../domain/engine';
import type { SavedJourney } from '../domain/types';
import styles from './PlanPage.module.css';

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
  const [editRequest, setEditRequest] = useState(0);
  const explanationRef = useRef<HTMLDetailsElement>(null);
  const [entryMode, setEntryMode] = useState<'quick' | 'voice' | 'form'>(() => window.location.hash.includes('mode=voice') ? 'voice' : 'quick');
  const airport = DEFAULT_AIRPORT;
  const now = useNow(30_000);
  const [input, setInput] = useState<JourneyInput | null>(null);
  const [formSeed, setFormSeed] = useState<JourneyInput | null>(null);
  const plannedKind = input?.kind ?? formSeed?.kind ?? kind;
  const { status, plan, error, refresh } = useJourneyPlan(input);
  // Worked out with the plan, so the card, the section and the saved name agree.
  const route = plan?.flightRoute ?? null;
  const resultRef = useRef<HTMLDivElement>(null);

  /*
   * Calculating replaces the form below the fold with a result above it. On a
   * phone that leaves you looking at whatever was under your thumb, so the
   * page goes back to the top, and the recommendation takes focus once it is
   * there — which scrolls it into view and announces it to a screen reader.
   */
  const show = (next: JourneyInput | null): void => {
    setInput(next);
    if (!next) {
      setFormSeed(input);
      setEntryMode('form');
    } else if (entryMode !== 'quick') setEntryMode('voice');
    window.scrollTo({ top: 0, behavior: scrollBehaviour() });
  };

  useEffect(() => {
    if (status === 'ready' && resultRef.current) resultRef.current.focus();
  }, [status]);

  const startMonitoring = (): void => {
    if (!input || !plan || plan.recommendation.kind === 'unavailable') return;
    // The place goes in the name, so two journeys on one day are told apart
    // at a glance: "RK1711 to Rabat · Sun 27 Sept".
    const where = shortRoute(route, input.kind);
    const label = input.flightNumber
      ? `${input.flightNumber}${where ? ` ${where}` : ''} · ${formatDate(input.scheduledTime, airport.timeZone)}`
      : `${input.kind === 'pickup' ? 'Pickup' : 'Drop-off'} · ${formatDate(input.scheduledTime, airport.timeZone)}`;

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

  const details =
    plan && plan.recommendation.kind !== 'unavailable'
      ? signalDetails(plan)
      : {};

  const methodChoice = (
    <div className={styles.entryChoice}>
      <p id="entry-choice-label" className={styles.entryLabel}>
        Choose how to plan
      </p>
      <div
        className={styles.entryModes}
        role="group"
        aria-labelledby="entry-choice-label"
        aria-describedby="entry-choice-hint"
      >
        <button type="button" className={styles.entryOption} aria-pressed={entryMode === 'quick'} onClick={() => { setInput(null); setEntryMode('quick'); }}>
          Quick plan
        </button>
        <button
          type="button"
          className={styles.entryOption}
          aria-pressed={entryMode === 'voice'}
          onClick={() => setEntryMode('voice')}
        >
          Voice or text
        </button>
        <button
          type="button"
          className={styles.entryOption}
          aria-pressed={entryMode === 'form'}
          onClick={() => {
            if (input) {
              setFormSeed(input);
              setInput(null);
            }
            setEntryMode('form');
          }}
        >
          Use the form
        </button>
      </div>
      <p id="entry-choice-hint" className={styles.entryHint}>
        Start with three details, talk or type naturally, or use the full form.
      </p>
    </div>
  );

  return (
    <>
      <header className={styles.header}>
        <a className={styles.back} href="#/">
          ← Back
        </a>
        <nav className={styles.modeNav} aria-label="Journey type">
          <a
            className={
              plannedKind === 'pickup' ? styles.modeActive : styles.modeLink
            }
            href={hrefFor({ name: 'plan', kind: 'pickup' })}
            aria-current={plannedKind === 'pickup' ? 'page' : undefined}
          >
            Pickup
          </a>
          <a
            className={
              plannedKind === 'dropoff' ? styles.modeActive : styles.modeLink
            }
            href={hrefFor({ name: 'plan', kind: 'dropoff' })}
            aria-current={plannedKind === 'dropoff' ? 'page' : undefined}
          >
            Drop-off
          </a>
        </nav>
        <h1 className={styles.title}>
          {status === 'ready'
            ? plannedKind === 'pickup'
              ? 'Your pickup plan'
              : 'Your drop-off plan'
            : plannedKind === 'pickup'
              ? 'Plan a pickup'
              : 'Plan a drop-off'}
        </h1>
        <p className={styles.subtitle}>
          {status === 'ready'
            ? 'For Manchester Airport. All times are Manchester time.'
            : plannedKind === 'pickup'
              ? 'Enter the flight, date and starting postcode. We’ll check the details and work out when to leave.'
              : 'Enter the flight, date and starting postcode. We’ll work out when to leave for check-in.'}
        </p>
      </header>

      {status !== 'ready' ? methodChoice : null}
      {/* Focused when a result arrives; -1 keeps it out of the tab order. */}
      <div ref={resultRef} tabIndex={-1} className={styles.result}>
        {status === 'ready' && plan ? (
          plan.recommendation.kind === 'unavailable' ? (
            <>
              <Callout
                tone="alert"
                title={plan.recommendation.headline}
                role="alert"
              >
                <p>{plan.recommendation.detail}</p>
              </Callout>
              <div className={styles.actions}>
                <Button variant="secondary" onClick={() => show(null)}>
                  Change the details
                </Button>
              </div>
            </>
          ) : (
            <>
              <RecommendationCard
                recommendation={plan.recommendation}
                airport={airport}
                now={now}
                flight={{
                  number: input?.flightNumber ?? null,
                  route,
                  terminal: plan.terminal,
                }}
              >
                {input ? <PlanBasis input={input} plan={plan} /> : null}
                {plan.flight.message ? <details><summary>Flight data and coverage</summary><p className={ui.hint}>{plan.flight.message}</p></details> : null}
                <div className={styles.actions}>
                  <Button onClick={startMonitoring}>Start monitoring</Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEntryMode('voice');
                      setEditRequest((value) => value + 1);
                    }}
                  >
                    Edit journey
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const node = explanationRef.current;
                      if (node) {
                        node.open = true;
                        node.querySelector('summary')?.focus();
                      }
                    }}
                  >
                    Explain this time
                  </Button>
                </div>
                <p className={ui.hint}>
                  Monitoring keeps this journey in your browser and rechecks it
                  while SetoffIQ is open.
                </p>
              </RecommendationCard>

              <details ref={explanationRef} className={styles.resultDetails}>
                <summary>Why this time? View the journey details</summary>
                <section
                  className={styles.section}
                  aria-labelledby="affecting-heading"
                >
                  <h2 className={styles.sectionTitle} id="affecting-heading">
                    What's affecting your timing?
                  </h2>
                  <Button variant="secondary" onClick={refresh}>
                    Refresh this plan
                  </Button>
                  <SignalTable
                    signals={plan.recommendation.signals}
                    confidence={plan.recommendation.confidence}
                    now={now}
                    timeZone={airport.timeZone}
                    details={details}
                    attributions={
                      plan.roadDisruption.attribution
                        ? [plan.roadDisruption.attribution]
                        : []
                    }
                  />
                  <details className={styles.prose}>
                    <summary className={styles.proseSummary}>
                      Read this as a paragraph
                    </summary>
                    <div className={styles.generated}>
                      <ExplanationPanel
                        plan={plan}
                        recommendation={plan.recommendation}
                        airport={airport}
                        useLocalModel={useLocalModel}
                      />
                    </div>
                  </details>
                </section>

                {plan.recommendation.kind === 'pickup' ? (
                  <section
                    className={styles.section}
                    aria-labelledby="progress-heading"
                  >
                    <h2 className={styles.sectionTitle} id="progress-heading">
                      Where your passenger is
                    </h2>
                    <ReadinessStages progress={plan.recommendation.progress} />
                  </section>
                ) : null}

                {route && input ? (
                  <section
                    className={styles.section}
                    aria-labelledby="route-heading"
                  >
                    <h2 className={styles.sectionTitle} id="route-heading">
                      The flight
                    </h2>
                    <FlightRouteSummary
                      route={route}
                      kind={input.kind}
                      timeZone={airport.timeZone}
                      now={now}
                    />
                  </section>
                ) : null}

                <section
                  className={styles.section}
                  aria-labelledby="timeline-heading"
                >
                  <h2 className={styles.sectionTitle} id="timeline-heading">
                    Your timeline
                  </h2>
                  <JourneyTimeline
                    recommendation={plan.recommendation}
                    timeZone={airport.timeZone}
                    now={now}
                  />
                </section>
              </details>
              <details className={styles.resultDetails}>
                <summary>Travel notes and data limits</summary>
                <section
                  className={styles.section}
                  aria-labelledby="sources-heading"
                >
                  <h2 className={styles.sectionTitle} id="sources-heading">
                    Worth knowing
                  </h2>
                  <div className={styles.notes}>
                    {plan.route.state !== 'ok' && plan.route.message ? (
                      <p className={styles.note}>
                        <span className={styles.noteMark} aria-hidden="true">
                          !
                        </span>
                        <span>{plan.route.message}</span>
                      </p>
                    ) : null}
                    {airport.notes.map((note) => (
                      <p className={styles.note} key={note}>
                        <span className={styles.noteMark} aria-hidden="true">
                          —
                        </span>
                        <span>{note}</span>
                      </p>
                    ))}
                    <p className={styles.note}>
                      <span className={styles.noteMark} aria-hidden="true">
                        —
                      </span>
                      <span>
                        Airport parking and drop-off zones are charged by the
                        airport. SetoffIQ does not show prices because it has no
                        reliable current source for them — check{' '}
                        <a
                          href={airport.officialLinks[0]?.url}
                          rel="noreferrer noopener"
                        >
                          the airport's own parking information
                        </a>{' '}
                        before you travel.
                      </span>
                    </p>
                    <p className={styles.note}>
                      <span className={styles.noteMark} aria-hidden="true">
                        —
                      </span>
                      <span>
                        Calculated at{' '}
                        {formatClock(plan.computedAt, airport.timeZone)},{' '}
                        {airport.name} time.
                      </span>
                    </p>
                  </div>
                </section>
              </details>
            </>
          )
        ) : null}
      </div>

      {status === 'ready' && entryMode !== 'quick' ? methodChoice : null}
      {status === 'ready' && entryMode === 'quick' ? <details className={styles.resultDetails}><summary>Change how you plan</summary>{methodChoice}</details> : null}
      {entryMode === 'quick' && input === null ? <QuickJourney kind={kind} now={now} onSubmit={show} /> : null}
      <VoiceJourney
        suspended={entryMode !== 'voice'}
        editRequest={editRequest}
        kind={kind}
        input={input}
        plan={plan}
        busy={status === 'loading'}
        error={error}
        onInput={setInput}
        onMonitor={startMonitoring}
      />

      {input === null ? (
        <div hidden={entryMode !== 'form'}>
          <JourneyForm
            kind={formSeed?.kind ?? kind}
            initialInput={formSeed}
            airport={airport}
            now={now}
            onSubmit={show}
          />
        </div>
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
        <Callout
          tone="alert"
          title="We couldn't build a recommendation"
          role="alert"
        >
          <p>{error}</p>
          <p>
            <Button variant="secondary" onClick={refresh}>
              Try again
            </Button>
          </p>
        </Callout>
      ) : null}
    </>
  );
}

/** Jumping is kinder than a long smooth scroll when the page has changed. */
function scrollBehaviour(): ScrollBehavior {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth';
}
